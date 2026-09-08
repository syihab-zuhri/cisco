import { HeadlessSimulationEngine } from './simulationEngine';
import { createPauseGate, createStepGate } from './gates';
import {
  type DhcpResultPayload,
  type PingResultPayload,
  type RipResultPayload,
  type UIWorkerMessage,
  type WorkerUIMessage,
} from '../types/ipc';
import { type SimEvent } from '../types/protocol';

// Engine di dalam web worker memberi delay per hop agar visualisasi animasi
// paket terlihat meluncur. Delay dinormalisasi oleh simulation speed (0.5x/1x/2x).
const BASE_HOP_MS = 800;
const LOG_PACE_MS = 60;
let hopDelayMs = BASE_HOP_MS;

const pauseGate = createPauseGate();
const stepGate = createStepGate();

const engine = new HeadlessSimulationEngine(
  async (event) => {
    // SIMULATION_STEP hanya event internal engine->worker; yang dilempar ke UI
    // adalah PACKET_HOP (INV-002: kontrak di src/types/ipc.ts).
    if (event.type === 'SIMULATION_STEP') {
      self.postMessage({
        type: 'PACKET_HOP',
        payload: event.payload,
      } as WorkerUIMessage);
    }
  }
);

let isSimulationRunning = false;
let activeRunId = 0;
let cancelDelay: (() => void) | null = null;

self.onmessage = async (e: MessageEvent<UIWorkerMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'INIT_STATE': {
      engine.setTopology(msg.payload.devices, msg.payload.links);
      break;
    }

    case 'ABORT_SIMULATION': {
      activeRunId++;
      isSimulationRunning = false;
      pauseGate.resume();
      stepGate.setEnabled(false);
      if (cancelDelay) {
        cancelDelay();
        cancelDelay = null;
      }
      break;
    }

    case 'SET_SIMULATION_SPEED': {
      hopDelayMs = BASE_HOP_MS / msg.payload.simulationSpeed;
      break;
    }

    case 'PAUSE_SIMULATION': {
      pauseGate.pause();
      break;
    }

    case 'RESUME_SIMULATION': {
      pauseGate.resume();
      break;
    }

    case 'ENABLE_STEP_MODE': {
      stepGate.setEnabled(msg.payload.enabled);
      break;
    }

    case 'SIM_STEP_NEXT': {
      stepGate.next();
      break;
    }

    case 'START_PING': {
      const { requestId, sourceNodeId, targetIp, echoCount, outputStyle } = msg.payload;
      if (isSimulationRunning) {
        postError(requestId, 'SIM_BUSY: Simulasi lain sedang berjalan.', 'ping');
        break;
      }
      const runId = ++activeRunId;
      isSimulationRunning = true;
      try {
        const plan = engine.planPing(sourceNodeId, targetIp, { echoCount, outputStyle });
        await playPlan(requestId, plan.events, runId);
        if (runId !== activeRunId) return;

        const result: PingResultPayload = {
          requestId,
          sourceNodeId,
          targetIp,
          success: plan.summary.success,
          rttMs: plan.summary.rttMs,
          ttl: plan.summary.ttl,
          logs: plan.events
            .filter((ev) => ev.kind === 'LOG')
            .map((ev) => `[${ev.level}] ${ev.message}`),
          outputLines: plan.summary.outputLines,
        };
        self.postMessage({ type: 'PING_RESULT', payload: result } as WorkerUIMessage);

        self.postMessage({
          type: 'LOG',
          payload: {
            type: plan.summary.success ? 'SUCCESS' : 'ERROR',
            message: plan.summary.success
              ? `Ping ke ${targetIp} selesai: ${plan.summary.received}/${plan.summary.sent} echo reply diterima (TTL ${plan.summary.ttl}).`
              : `Ping ke ${targetIp} gagal: ${plan.summary.outputLines.at(-1) ?? plan.events.filter((e) => e.kind === 'LOG' && e.level === 'ERROR').at(-1)?.message ?? 'penyebab tidak diketahui'}`,
          },
        } as WorkerUIMessage);

        self.postMessage({
          type: 'SIMULATION_STATE_SYNC',
          payload: { devices: engine.getDevices() },
        } as WorkerUIMessage);
      } catch (err: unknown) {
        if (runId !== activeRunId) return;
        const message = err instanceof Error ? err.message : String(err);
        postError(requestId, message, 'ping');
      } finally {
        if (runId === activeRunId) {
          isSimulationRunning = false;
        }
      }
      break;
    }

    case 'START_DHCP': {
      const { requestId, nodeId, portId } = msg.payload;
      if (isSimulationRunning) {
        postError(requestId, 'SIM_BUSY: Simulasi lain sedang berjalan.', 'dhcp');
        break;
      }
      const runId = ++activeRunId;
      isSimulationRunning = true;
      try {
        const plan = engine.planDhcp(nodeId, portId);
        await playPlan(requestId, plan.events, runId);
        if (runId !== activeRunId) return;

        const leaseEffect = plan.events
          .flatMap((ev) => ev.effects ?? [])
          .find((eff) => eff.type === 'DHCP_LEASE');
        const assignedIp = leaseEffect?.ipAddress ?? undefined;

        const payload: DhcpResultPayload = {
          requestId,
          nodeId,
          portId,
          success: plan.summary.success,
          assignedIp,
          logs: plan.events.filter((ev) => ev.kind === 'LOG').map((ev) => `[${ev.level}] ${ev.message}`),
          outputLines: plan.summary.outputLines,
        };
        self.postMessage({ type: 'DHCP_RESULT', payload } as WorkerUIMessage);
        self.postMessage({
          type: 'LOG',
          payload: {
            type: plan.summary.success ? 'SUCCESS' : 'ERROR',
            message: plan.summary.success
              ? `DHCP selesai: ${plan.summary.outputLines[0]}`
              : `DHCP gagal: ${plan.summary.outputLines[0]}`,
          },
        } as WorkerUIMessage);
        self.postMessage({
          type: 'SIMULATION_STATE_SYNC',
          payload: { devices: engine.getDevices() },
        } as WorkerUIMessage);
      } catch (err: unknown) {
        if (runId !== activeRunId) return;
        const message = err instanceof Error ? err.message : String(err);
        postError(requestId, message, 'dhcp');
      } finally {
        if (runId === activeRunId) {
          isSimulationRunning = false;
        }
      }
      break;
    }
    case 'START_RIP': {
      const requestId = msg.payload.requestId;
      if (isSimulationRunning) {
        postError(requestId, 'SIM_BUSY: Simulasi lain sedang berjalan.', 'rip');
        break;
      }
      const runId = ++activeRunId;
      isSimulationRunning = true;
      try {
        const plan = engine.planRip();
        await playPlan(requestId, plan.events, runId);
        if (runId !== activeRunId) return;
        const payload: RipResultPayload = {
          requestId,
          success: plan.summary.success,
          routesAdded: Number(/(\d+)/.exec(plan.summary.outputLines[0])?.[1] ?? 0),
          logs: plan.events.filter((ev) => ev.kind === 'LOG').map((ev) => `[${ev.level}] ${ev.message}`),
          outputLines: plan.summary.outputLines,
        };
        self.postMessage({ type: 'RIP_RESULT', payload } as WorkerUIMessage);
        self.postMessage({
          type: 'LOG',
          payload: {
            type: plan.summary.success ? 'SUCCESS' : 'ERROR',
            message: plan.summary.outputLines[0],
          },
        } as WorkerUIMessage);
        self.postMessage({
          type: 'SIMULATION_STATE_SYNC',
          payload: { devices: engine.getDevices() },
        } as WorkerUIMessage);
      } catch (err: unknown) {
        if (runId !== activeRunId) return;
        const message = err instanceof Error ? err.message : String(err);
        postError(requestId, message, 'rip');
      } finally {
        if (runId === activeRunId) {
          isSimulationRunning = false;
        }
      }
      break;
    }
  }
};

/** Memutar aliran event dengan pacing/pause/step, lalu meneruskannya ke UI. */
async function playPlan(requestId: string, events: SimEvent[], runId: number): Promise<void> {
  if (runId !== activeRunId) return;
  self.postMessage({
    type: 'SIM_PLAN',
    payload: { requestId, events },
  } as WorkerUIMessage);

  for (const event of events) {
    if (runId !== activeRunId) return;
    await pauseGate.wait();
    if (runId !== activeRunId) return;
    if (stepGate.isEnabled()) {
      // Step mode: tanpa pacing — satu klik Next = tepat satu event.
      await stepGate.wait();
    } else {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          cancelDelay = null;
          resolve();
        }, event.kind === 'LOG' ? LOG_PACE_MS : hopDelayMs);
        cancelDelay = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
    if (runId !== activeRunId) return;

    self.postMessage({
      type: 'EVENT_PLAYED',
      payload: { requestId, event },
    } as WorkerUIMessage);

    if (event.kind === 'LOG') {
      self.postMessage({
        type: 'LOG',
        payload: { type: event.level, message: event.message },
      } as WorkerUIMessage);
    } else if (event.hop) {
      self.postMessage({
        type: 'PACKET_HOP',
        payload: {
          packetId: `pkt-${event.seq}`,
          sourceNodeId: event.hop.sourceNodeId,
          targetNodeId: event.hop.targetNodeId,
          sourcePortId: event.hop.sourcePortId,
          targetPortId: event.hop.targetPortId,
          type: event.kind,
          currentProtocol: event.kind.startsWith('ARP')
            ? 'ARP'
            : event.kind.startsWith('DHCP')
            ? 'DHCP'
            : event.kind.startsWith('RIP')
            ? 'RIP'
            : 'ICMP',
          summary: event.message,
        },
      } as WorkerUIMessage);
    }
  }
}

function postError(
  requestId: string,
  message: string,
  kind: 'ping' | 'dhcp' | 'rip'
): void {
  self.postMessage({
    type: 'LOG',
    payload: { type: 'ERROR', message: `Simulasi error: ${message}` },
  } as WorkerUIMessage);
  // M4: jawab dengan tipe hasil yang sama dengan permintaan —
  // promise requestDhcp/requestRip tidak boleh menggantung selamanya.
  if (kind === 'dhcp') {
    const payload: DhcpResultPayload = {
      requestId,
      nodeId: '',
      portId: '',
      success: false,
      logs: [`Simulasi error: ${message}`],
      outputLines: [`Simulasi error: ${message}`],
    };
    self.postMessage({ type: 'DHCP_RESULT', payload } as WorkerUIMessage);
  } else if (kind === 'rip') {
    const payload: RipResultPayload = {
      requestId,
      success: false,
      routesAdded: 0,
      logs: [`Simulasi error: ${message}`],
      outputLines: [`Simulasi error: ${message}`],
    };
    self.postMessage({ type: 'RIP_RESULT', payload } as WorkerUIMessage);
  } else {
    const pingPayload: PingResultPayload = {
      requestId,
      sourceNodeId: '',
      targetIp: '',
      success: false,
      rttMs: 0,
      ttl: 0,
      logs: [`Simulasi error: ${message}`],
      outputLines: [`Simulasi error: ${message}`],
    };
    self.postMessage({ type: 'PING_RESULT', payload: pingPayload } as WorkerUIMessage);
  }
}
