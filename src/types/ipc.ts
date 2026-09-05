import {
  type DeviceData,
  type PacketHopPayload,
  type SimulationEventLog,
  type SimulationSpeed,
  type TopologyLink,
} from './network';
import { type SimEvent } from './protocol';

// Messages from UI Main Thread to Simulation Worker
export type UIWorkerMessage =
  | {
      type: 'INIT_STATE';
      payload: {
        devices: DeviceData[];
        links: TopologyLink[];
      };
    }
  | {
      type: 'START_PING';
      payload: {
        requestId: string;
        sourceNodeId: string;
        targetIp: string;
        echoCount: number;
        outputStyle: 'windows' | 'ios';
      };
    }
  | {
      type: 'SET_SIMULATION_SPEED';
      payload: {
        simulationSpeed: SimulationSpeed;
      };
    }
  | {
      type: 'PAUSE_SIMULATION';
    }
  | {
      type: 'RESUME_SIMULATION';
    }
  | {
      type: 'ENABLE_STEP_MODE';
      payload: { enabled: boolean };
    }
  | {
      type: 'SIM_STEP_NEXT';
    };

export interface PingResultPayload {
  requestId: string;
  sourceNodeId: string;
  targetIp: string;
  success: boolean;
  rttMs: number;
  ttl: number;
  logs: string[];
  /** Baris teks output siap tampil (format windows/ios sesuai permintaan). */
  outputLines: string[];
}

// Messages from Simulation Worker to UI Main Thread.
// SIMULATION_STEP hanya berjalan internal (engine -> worker via callback),
// tidak pernah melewati postMessage.
export type WorkerUIMessage =
  | {
      type: 'LOG';
      payload: {
        type: SimulationEventLog['type'];
        message: string;
      };
    }
  | {
      type: 'SIMULATION_STEP';
      payload: PacketHopPayload;
    }
  | {
      type: 'PACKET_HOP';
      payload: PacketHopPayload;
    }
  | {
      type: 'PING_RESULT';
      payload: PingResultPayload;
    }
  | {
      type: 'SIMULATION_STATE_SYNC';
      payload: {
        devices: DeviceData[];
      };
    }
  | {
      type: 'SIM_PLAN';
      payload: {
        requestId: string;
        events: SimEvent[];
      };
    }
  | {
      type: 'EVENT_PLAYED';
      payload: {
        requestId: string;
        event: SimEvent;
      };
    };
