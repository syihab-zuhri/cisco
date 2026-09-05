import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  type DhcpResultPayload,
  type PingResultPayload,
  type RipResultPayload,
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
const pendingDhcp = new Map<string, (result: DhcpResultPayload) => void>();
const pendingRip = new Map<string, (result: RipResultPayload) => void>();

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

      case 'DHCP_RESULT': {
        const resolver = pendingDhcp.get(msg.payload.requestId);
        pendingDhcp.delete(msg.payload.requestId);
        resolver?.(msg.payload);
        store.setSimulationStatus('idle');
        setTimeout(() => useAppStore.getState().setActivePackets([]), 600);
        break;
      }

      case 'RIP_RESULT': {
        const resolver = pendingRip.get(msg.payload.requestId);
        pendingRip.delete(msg.payload.requestId);
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

      case 'SIM_PLAN':
        store.setSimPlan(msg.payload.events);
        break;

      case 'EVENT_PLAYED':
        store.markSimEventPlayed(msg.payload.event);
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

export function enableStepMode(enabled: boolean): void {
  ensureWorker().postMessage({
    type: 'ENABLE_STEP_MODE',
    payload: { enabled },
  } as UIWorkerMessage);
}

/** Maju satu event dalam step mode (dipanggil tombol "Next Hop"). */
export function simStepNext(): void {
  ensureWorker().postMessage({ type: 'SIM_STEP_NEXT' } as UIWorkerMessage);
}

/** Menjalankan konvergensi RIPv2 pada semua router dengan RIP aktif. */
export async function requestRip(): Promise<RipResultPayload> {
  const store = useAppStore.getState();
  if (store.simulationStatus === 'running') {
    throw new Error('SIM_BUSY');
  }

  const w = ensureWorker();
  store.setSimulationStatus('running');

  const devices = store.nodes.map((n) => n.data);
  const links = store.edges.map((e) => ({
    sourceNodeId: e.source,
    sourcePortId: e.sourceHandle ?? 'fa0',
    targetNodeId: e.target,
    targetPortId: e.targetHandle ?? 'fa0',
    kind: e.type === 'wirelessLink' ? ('wireless' as const) : ('ethernet' as const),
  }));
  w.postMessage({ type: 'INIT_STATE', payload: { devices, links } } as UIWorkerMessage);

  const requestId = `rip-${Date.now()}-${++requestSeq}`;
  return new Promise<RipResultPayload>((resolve) => {
    pendingRip.set(requestId, resolve);
    w.postMessage({ type: 'START_RIP' } as UIWorkerMessage);
  });
}
/** Meminta IP via DHCP (DORA) untuk port klien — router sebagai server. */
export async function requestDhcp(
  nodeId: string,
  portId: string
): Promise<DhcpResultPayload> {
  const store = useAppStore.getState();
  if (store.simulationStatus === 'running') {
    throw new Error('SIM_BUSY');
  }

  const w = ensureWorker();
  store.setSimulationStatus('running');

  const devices = store.nodes.map((n) => n.data);
  const links = store.edges.map((e) => ({
    sourceNodeId: e.source,
    sourcePortId: e.sourceHandle ?? 'fa0',
    targetNodeId: e.target,
    targetPortId: e.targetHandle ?? 'fa0',
    kind: e.type === 'wirelessLink' ? ('wireless' as const) : ('ethernet' as const),
  }));
  w.postMessage({ type: 'INIT_STATE', payload: { devices, links } } as UIWorkerMessage);

  const requestId = `dhcp-${Date.now()}-${++requestSeq}`;
  return new Promise<DhcpResultPayload>((resolve) => {
    pendingDhcp.set(requestId, resolve);
    w.postMessage({
      type: 'START_DHCP',
      payload: { requestId, nodeId, portId },
    } as UIWorkerMessage);
  });
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

  const stepMode = useAppStore((s) => s.stepMode);
  useEffect(() => {
    enableStepMode(stepMode);
  }, [stepMode]);

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
