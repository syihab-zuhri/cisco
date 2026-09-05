import { HeadlessSimulationEngine } from './simulationEngine';
import { type PingResultPayload, type UIWorkerMessage, type WorkerUIMessage } from '../types/ipc';

// Engine di dalam web worker memberi delay per hop agar visualisasi animasi
// paket terlihat meluncur. Delay dinormalisasi oleh simulation speed (0.5x/1x/2x).
const BASE_HOP_MS = 800;
let hopDelayMs = BASE_HOP_MS;
let paused = false;
let resumeWaiters: Array<() => void> = [];

/** Gerbang pause: engine menunggu di sini sebelum setiap hop saat simulasi dijeda. */
async function pauseGate(): Promise<void> {
  while (paused) {
    await new Promise<void>((resolve) => resumeWaiters.push(resolve));
  }
}

function resume(): void {
  paused = false;
  const waiters = resumeWaiters;
  resumeWaiters = [];
  waiters.forEach((wake) => wake());
}

const engine = new HeadlessSimulationEngine(
  async (event) => {
    // SIMULATION_STEP hanya event internal engine->worker; yang dilempar ke UI
    // adalah PACKET_HOP (INV-002: kontrak di src/types/ipc.ts).
    if (event.type === 'SIMULATION_STEP') {
      self.postMessage({
        type: 'PACKET_HOP',
        payload: event.payload,
      } as WorkerUIMessage);
      await new Promise((resolve) => setTimeout(resolve, hopDelayMs));
      await pauseGate();
    }
  },
  (level, msg) => {
    self.postMessage({
      type: 'LOG',
      payload: { type: level, message: msg },
    } as WorkerUIMessage);
  }
);

self.onmessage = async (e: MessageEvent<UIWorkerMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'INIT_STATE': {
      engine.setTopology(msg.payload.devices, msg.payload.links);
      break;
    }

    case 'SET_SIMULATION_SPEED': {
      hopDelayMs = BASE_HOP_MS / msg.payload.simulationSpeed;
      break;
    }

    case 'PAUSE_SIMULATION': {
      paused = true;
      break;
    }

    case 'RESUME_SIMULATION': {
      resume();
      break;
    }

    case 'START_PING': {
      const { requestId, sourceNodeId, targetIp, echoCount, outputStyle } = msg.payload;
      try {
        const result = await engine.executePing(sourceNodeId, targetIp, {
          echoCount,
          outputStyle,
        });
        const payload: PingResultPayload = {
          requestId,
          sourceNodeId,
          targetIp,
          success: result.success,
          rttMs: result.rttMs,
          ttl: result.ttl,
          logs: result.logs,
          outputLines: result.outputLines,
        };
        self.postMessage({ type: 'PING_RESULT', payload } as WorkerUIMessage);

        self.postMessage({
          type: 'LOG',
          payload: {
            type: result.success ? 'SUCCESS' : 'ERROR',
            message: result.success
              ? `Ping ke ${targetIp} selesai: ${result.received}/${result.sent} echo reply diterima (TTL ${result.ttl}).`
              : `Ping ke ${targetIp} gagal: ${result.outputLines[result.outputLines.length - 1] ?? 'tidak diketahui'}`,
          },
        } as WorkerUIMessage);

        self.postMessage({
          type: 'SIMULATION_STATE_SYNC',
          payload: { devices: engine.getDevices() },
        } as WorkerUIMessage);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        self.postMessage({
          type: 'LOG',
          payload: { type: 'ERROR', message: `Simulasi error: ${message}` },
        } as WorkerUIMessage);
        const payload: PingResultPayload = {
          requestId,
          sourceNodeId,
          targetIp,
          success: false,
          rttMs: 0,
          ttl: 0,
          logs: [`Simulasi error: ${message}`],
          outputLines: [`Simulasi error: ${message}`],
        };
        self.postMessage({ type: 'PING_RESULT', payload } as WorkerUIMessage);
      }
      break;
    }
  }
};
