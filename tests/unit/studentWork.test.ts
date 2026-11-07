import { describe, expect, it } from 'vitest';
import { evaluatePacket, buildPacketSubmission } from '../../src/features/classroom/submissionBuilder';
import { verifySubmission } from '../../src/features/classroom/verification';
import { createStudentWorkspace } from '../../src/features/classroom/studentWorkspace';
import type { Exercise, StarterTopology } from '../../src/features/classroom/types';

const topology = (gateway: string): StarterTopology => ({ nodes: [{ id: 'pc', type: 'deviceNode', position: { x: 1, y: 2 }, data: {
  id: 'pc', label: 'PC-1', type: 'pc', defaultGateway: gateway,
  ports: [{ id: 'fa0', name: 'Fa0', macAddress: '02:00:00:00:00:01', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0' }],
} }], edges: [] });
const exercises: Exercise[] = ['192.168.1.1', '192.168.1.254'].map((gateway, i) => ({ id: `e${i}`, title: `Soal ${i}`, difficulty: 'Dasar', instructions: 'Atur gateway', targets: [{ id: `t${i}`, title: 'IP', type: 'device_config', deviceId: 'PC-1', address: '192.168.1.10', gateway }] }));

describe('independent student work', () => {
  it('retains each question across switching and a new page lifecycle, isolated by round', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
    const work = createStudentWorkspace(storage);
    work.save('class:student:1', 'e0', topology('192.168.1.1'));
    work.save('class:student:1', 'e1', topology('192.168.1.254'));
    const recovered = createStudentWorkspace(storage);
    expect(recovered.read('class:student:1').selectedExerciseId).toBe('e1');
    expect(recovered.read('class:student:1').topologies.e0.nodes[0].data.defaultGateway).toBe('192.168.1.1');
    expect(recovered.read('class:student:2').topologies).toEqual({});
    expect(recovered.read('class:other:1').topologies).toEqual({});
  });

  it('grades two conflicting tasks independently and teacher verification agrees', async () => {
    const snapshot = { ...topology('192.168.1.254'), exerciseTopologies: { e0: topology('192.168.1.1'), e1: topology('192.168.1.254') } };
    const packet = await evaluatePacket(exercises, snapshot.nodes, snapshot.edges, {}, snapshot.exerciseTopologies);
    expect(packet.exerciseScores).toEqual({ e0: 100, e1: 100 });
    const submission = buildPacketSubmission({ id: 'stu', nickname: 'Siswa', joinedAt: 0, status: 'in_progress' }, exercises, 'e1', packet);
    expect(await verifySubmission(submission, snapshot, exercises)).toMatchObject({ status: 'match', verifiedScore: 100 });
  });

  it('does not grade missing per-question work against another question snapshot', async () => {
    const snapshot = { ...topology('192.168.1.1'), exerciseTopologies: { e0: topology('192.168.1.1') } };
    const packet = await evaluatePacket(exercises, snapshot.nodes, snapshot.edges, {}, snapshot.exerciseTopologies);
    expect(packet.exerciseScores).toEqual({ e0: 100, e1: 0 });
  });

  it('keeps independent work in memory if browser storage fills up', () => {
    const work = createStudentWorkspace({ getItem: () => null, setItem: () => { throw new Error('full'); } });
    expect(work.save('class:student:1', 'e0', topology('192.168.1.1'))).toBe(false);
    work.save('class:student:1', 'e1', topology('192.168.1.254'));
    expect(work.read('class:student:1').topologies.e0.nodes[0].data.defaultGateway).toBe('192.168.1.1');
  });
});
