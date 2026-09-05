import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  type PingResultPayload,
  type UIWorkerMessage,
  type WorkerUIMessage,
} from '../types/ipc';
import { type SimulationSpeed } from '../types/network';

/**
 * Bridge UI-thread <-> Web Worker. Worker dibuat sekali untuk seluruh aplikasi
 * (singleton modul) supaya CLI terminal dan Toolbar berbagi engine yang sama.
 */
let worker: Worker | null = null;
let requestSeq = 0;
const pendingPings = new Map<string, (result: PingResultPayload) => void>();

function ensureWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL('../engine/worker.ts', import.meta.url), {
    type: 'module',
  });

  worker.onmessage = (event: MessageEvent<WorkerUIMessage>) => {
    const msg = event.data;
    const store = useAppStore.getState();

    switch (msg.type) {
      case 'LOG':
        store.addSimulationLog(msg.payload.type, msg.payload.message);
        break;

      case 'PACKET_HOP':
        store.setActivePackets([msg.payload]);
        break;

      case 'PING_RESULT': {
        const resolver = pendingPings.get(msg.payload.requestId);
        pendingPings.delete(msg.payload.requestId);
        resolver?.(msg.payload);
        store.setSimulationStatus('idle');
        setTimeout(() => useAppStore.getState().setActivePackets([]), 600);
        break;
      }

      case 'SIMULATION_STATE_SYNC':
        msg.payload.devices.forEach((dev) => {
          store.updateDeviceConfig(dev.id, {
            arpTable: dev.arpTable,
            macTable: dev.macTable,
          });
        });
        break;

      case 'SIMULATION_STEP':
        // Event internal engine->worker, tidak pernah sampai di UI thread.
        break;
    }
  };

  return worker;
}

export function setEngineSpeed(speed: SimulationSpeed): void {
  ensureWorker().postMessage({
    type: 'SET_SIMULATION_SPEED',
    payload: { simulationSpeed: speed },
  } as UIWorkerMessage);
}

export function pauseSimulation(): void {
  ensureWorker().postMessage({ type: 'PAUSE_SIMULATION' } as UIWorkerMessage);
  useAppStore.getState().setSimulationStatus('paused');
}

export function resumeSimulation(): void {
  ensureWorker().postMessage({ type: 'RESUME_SIMULATION' } as UIWorkerMessage);
  useAppStore.getState().setSimulationStatus('running');
}

export interface PingRequestOptions {
  echoCount?: number;
  outputStyle?: 'windows' | 'ios';
}

export async function requestPing(
  sourceNodeId: string,
  targetIp: string,
  options: PingRequestOptions = {}
): Promise<PingResultPayload> {
  const store = useAppStore.getState();
  if (store.simulationStatus === 'running') {
    throw new Error('SIM_BUSY');
  }

  const w = ensureWorker();
  store.setSimulationStatus('running');

  // Kirim snapshot topologi terbaru setiap ping (single state of truth: store).
  const devices = store.nodes.map((n) => n.data);
  const links = store.edges.map((e) => ({
    sourceNodeId: e.source,
    sourcePortId: e.sourceHandle ?? 'fa0',
    targetNodeId: e.target,
    targetPortId: e.targetHandle ?? 'fa0',
    kind: e.type === 'wirelessLink' ? ('wireless' as const) : ('ethernet' as const),
  }));
  w.postMessage({ type: 'INIT_STATE', payload: { devices, links } } as UIWorkerMessage);

  const requestId = `ping-${Date.now()}-${++requestSeq}`;
  return new Promise<PingResultPayload>((resolve) => {
    pendingPings.set(requestId, resolve);
    w.postMessage({
      type: 'START_PING',
      payload: {
        requestId,
        sourceNodeId,
        targetIp,
        echoCount: options.echoCount ?? 1,
        outputStyle: options.outputStyle ?? 'windows',
      },
    } as UIWorkerMessage);
  });
}

export function useSimulationEngine() {
  useEffect(() => {
    ensureWorker();
    return () => {
      worker?.terminate();
      worker = null;
      pendingPings.clear();
    };
  }, []);

  const simulationSpeed = useAppStore((s) => s.simulationSpeed);
  useEffect(() => {
    setEngineSpeed(simulationSpeed);
  }, [simulationSpeed]);

  const triggerPing = (sourceNodeId: string, targetIp: string) => {
    requestPing(sourceNodeId, targetIp, { echoCount: 4, outputStyle: 'windows' }).catch(
      (err: unknown) => {
        const store = useAppStore.getState();
        const message = err instanceof Error ? err.message : String(err);
        store.setSimulationStatus('idle');
        store.addSimulationLog(
          'ERROR',
          message === 'SIM_BUSY'
            ? 'Ping lain sedang berjalan. Tunggu hingga selesai.'
            : `Gagal memulai ping: ${message}`
        );
      }
    );
  };

  return { triggerPing };
}
