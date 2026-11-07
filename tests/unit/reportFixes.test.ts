import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Node } from '@xyflow/react';
import { HeadlessSimulationEngine } from '../../src/engine/simulationEngine';
import { CliSession } from '../../src/engine/cli/cliEngine';
import { evaluateExercise } from '../../src/features/classroom/exerciseEvaluator';
import { ClassroomHub, type KeyValueStore } from '../../src/features/classroom/classroomHub';
import type { ClassroomEvent, Exercise } from '../../src/features/classroom/types';
import type { DeviceData, TopologyLink } from '../../src/types/network';
import { useAppStore } from '../../src/store/useAppStore';

const host = (id: string, ip: string, status: 'up' | 'down' = 'up'): DeviceData => ({
  id, label: id, type: 'pc', ports: [{
    id: 'fa0', name: 'FastEthernet 0', status, kind: 'ethernet',
    ipAddress: ip, subnetMask: '255.255.255.0',
    macAddress: id === 'PC-1' ? '00:50:79:00:00:01' : '00:50:79:00:00:02',
  }],
});
const cable: TopologyLink = {
  sourceNodeId: 'PC-1', sourcePortId: 'fa0', targetNodeId: 'PC-2', targetPortId: 'fa0',
};
const exercise: Exercise = {
  id: 'ip-only', title: 'Konfigurasi IP', instructions: 'Atur IP PC-1.', difficulty: 'Dasar',
  targets: [{ id: 'ip', title: 'IP PC-1', type: 'device_config', deviceId: 'PC-1', address: '192.168.1.10', prefix: 24 }],
};

describe('Laporan Zuhri: diagnostik port', () => {
  it('port ADMIN DOWN dengan kabel terpasang menjelaskan bahwa interface dinonaktifkan', () => {
    const engine = new HeadlessSimulationEngine();
    engine.setTopology([host('PC-1', '192.168.1.10', 'down'), host('PC-2', '192.168.1.20')], [cable]);
    const result = engine.planPing('PC-1', '192.168.1.20').summary;
    expect(result.success).toBe(false);
    expect(result.outputLines.join(' ')).toMatch(/ADMIN DOWN|administratif/i);
    expect(result.outputLines.join(' ')).not.toMatch(/kabel tidak terhubung/i);
  });

  it('port tanpa kabel menjelaskan kabel belum terhubung', () => {
    const engine = new HeadlessSimulationEngine();
    engine.setTopology([host('PC-1', '192.168.1.10', 'down')], []);
    expect(engine.planPing('PC-1', '192.168.1.20').summary.outputLines.join(' ')).toMatch(/kabel.*(tidak|belum).*terhubung/i);
  });

  it('dua host aktif yang terkabel tetap bisa ping dua arah', () => {
    const engine = new HeadlessSimulationEngine();
    engine.setTopology([host('PC-1', '192.168.1.10'), host('PC-2', '192.168.1.20')], [cable]);
    expect(engine.planPing('PC-1', '192.168.1.20', { echoCount: 4 }).summary.received).toBe(4);
    expect(engine.planPing('PC-2', '192.168.1.10', { echoCount: 4 }).summary.received).toBe(4);
  });
});

describe('Laporan Zuhri: arti nilai rubrik', () => {
  it.each<[string, DeviceData[], number]>([
    ['PC tidak ada', [], 0],
    ['IP salah', [host('PC-1', '192.168.1.11')], 0],
    ['mask salah', [{ ...host('PC-1', '192.168.1.10'), ports: [{ ...host('PC-1', '192.168.1.10').ports[0], subnetMask: '255.255.255.128' }] }], 0],
  ])('%s tidak lolos konfigurasi', async (_label, devices, expected) => {
    expect((await evaluateExercise(exercise, [...devices], [])).score).toBe(expected);
  });

  it('nilai konfigurasi 100 tidak mengklaim konektivitas telah diuji', async () => {
    const result = await evaluateExercise(exercise, [host('PC-1', '192.168.1.10', 'down')], []);
    expect(result.score).toBe(100);
    expect(result.feedback).toMatch(/konektivitas tidak diuji/i);
  });

  it('rubrik dengan ping gagal memberi nilai parsial meskipun IP sesuai', async () => {
    const result = await evaluateExercise({ ...exercise, targets: [...exercise.targets, {
      id: 'ping', title: 'Ping PC-2', type: 'reachability', sourceDeviceId: 'PC-1', destinationDeviceId: 'PC-2',
    }] }, [host('PC-1', '192.168.1.10', 'down'), host('PC-2', '192.168.1.20')], []);
    expect(result.score).toBe(50);
    expect(result.checks.find((c) => c.targetId === 'ping')?.passed).toBe(false);
  });
});

describe('Laporan Zuhri: connected routes aktif', () => {
  it('CLI menampilkan jaringan aktif dan tidak menampilkan connected route port DOWN', async () => {
    const device: DeviceData = { ...host('R-1', '192.168.1.1'), type: 'router', ports: [
      { ...host('R-1', '192.168.1.1').ports[0], id: 'fa0/0', name: 'FastEthernet 0/0' },
      { ...host('R-1', '192.168.2.1', 'down').ports[0], id: 'fa0/1', name: 'FastEthernet 0/1', subInterfaces: [{ vlanId: 20, ipAddress: '192.168.20.1', subnetMask: '255.255.255.0' }] },
    ] };
    const cli = new CliSession({ getDevice: () => device, setHostname() {}, setPortConfig() {}, requestPing: async () => ({ success: false, outputLines: [] }) });
    await cli.handle('enable');
    const output = (await cli.handle('show ip route')).join('\n');
    expect(output).toContain('192.168.1.0/24');
    expect(output).not.toContain('192.168.2.0/24');
    expect(output).not.toContain('192.168.20.0/24');
  });
});

class MemoryStorage implements KeyValueStore {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function newHub() {
  return new ClassroomHub({ localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() });
}

describe('Laporan Zuhri: alasan sesi siswa berakhir', () => {
  it.each(['closed', 'kicked'] as const)('alasan %s tetap tersedia setelah identitas peserta dibersihkan', async (reason) => {
    const hub = newHub();
    hub.setLockedRole('student');
    hub.createClass('Kelas', 'REPORT-1', undefined, [exercise], { local: true });
    const participant = hub.joinClass('REPORT-1', 'Ani')!;
    await Promise.resolve();
    const events: ClassroomEvent[] = [];
    hub.subscribe((event) => events.push(event));
    const event: ClassroomEvent = reason === 'closed'
      ? { type: 'CLASS_CLOSED', classCode: 'REPORT-1' }
      : { type: 'PARTICIPANT_KICKED', classCode: 'REPORT-1', participantId: participant.id };
    hub.broadcast(event);
    hub.broadcast(event); // polling/siaran duplikat tidak boleh menghasilkan notifikasi ganda
    await Promise.resolve();
    expect(hub.getCurrentParticipant()).toBeNull();
    expect(hub.getSession()).toBeNull();
    expect(hub.getLockedRole()).toBeNull();
    expect(events.filter((e) => e.type === 'STUDENT_SESSION_ENDED')).toEqual([{
      type: 'STUDENT_SESSION_ENDED', classCode: 'REPORT-1', participantId: participant.id, reason,
    }]);
  });

  it('menutup kelas guru tidak menghasilkan event akhir sesi siswa', async () => {
    const hub = newHub();
    hub.setLockedRole('teacher');
    hub.createClass('Kelas', 'REPORT-2', undefined, [], { local: true });
    await Promise.resolve();
    const events: ClassroomEvent[] = [];
    hub.subscribe((e) => events.push(e));
    hub.closeClass('REPORT-2');
    await Promise.resolve();
    expect(hub.getLockedRole()).toBe('teacher');
    expect(events.some((e) => e.type === 'STUDENT_SESSION_ENDED')).toBe(false);
  });
});

describe('Laporan Zuhri: peringatan IP dari store bersama GUI dan CLI', () => {
  afterEach(() => {
    useAppStore.getState().resetTopology();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('memberi peringatan saat kabel menyatukan dua IP duplikat dan dapat memperingatkan lagi setelah konflik diperbaiki', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
    const nodes = [host('PC-1', '192.168.1.10'), host('PC-2', '192.168.1.10')].map((data, i): Node<DeviceData> => ({
      id: data.id, type: 'deviceNode', position: { x: i * 200, y: 0 }, data,
    }));
    useAppStore.setState({ nodes, edges: [], toasts: [], activeLabId: null });
    expect(useAppStore.getState().toasts).toHaveLength(0);
    useAppStore.getState().connectPorts('PC-1', 'fa0', 'PC-2', 'fa0');
    await Promise.resolve();
    expect(useAppStore.getState().toasts.some((t) => /konflik IP.*192\.168\.1\.10/i.test(t.message))).toBe(true);
    useAppStore.getState().updatePortConfig('PC-2', 'fa0', { ipAddress: '192.168.1.20' });
    useAppStore.setState({ toasts: [] });
    useAppStore.getState().updatePortConfig('PC-2', 'fa0', { ipAddress: '192.168.1.10' });
    await Promise.resolve();
    expect(useAppStore.getState().toasts.some((t) => /konflik IP/i.test(t.message))).toBe(true);
  });
});
