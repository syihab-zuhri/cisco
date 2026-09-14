import { describe, it, expect, beforeEach } from 'vitest';
import { classroomHub } from '../../src/features/classroom/classroomHub';
import { evaluateExercise } from '../../src/features/classroom/exerciseEvaluator';
import { DEFAULT_EXERCISES } from '../../src/features/classroom/defaultExercises';
import type { DeviceData, TopologyLink } from '../../src/types/network';

describe('Classroom Feature Suite', () => {
  beforeEach(() => {
    classroomHub.clearAll();
  });

  describe('ClassroomHub Lifecycle', () => {
    it('berhasil membuat sesi kelas baru dengan kode unik dan status open', () => {
      const session = classroomHub.createClass('Kelas TKJ 1', 'NET-9999');
      expect(session).toBeDefined();
      expect(session.classCode).toBe('NET-9999');
      expect(session.status).toBe('open');
      expect(session.title).toBe('Kelas TKJ 1');

      const saved = classroomHub.getSession();
      expect(saved?.classCode).toBe('NET-9999');
    });

    it('peserta dapat bergabung ke kelas dan status tersimpan', () => {
      classroomHub.createClass('Kelas TKJ 1', 'NET-1001');
      const p1 = classroomHub.joinClass('NET-1001', 'Ahmad Dani');
      expect(p1).toBeDefined();
      expect(p1?.nickname).toBe('Ahmad Dani');

      const participants = classroomHub.getParticipants();
      expect(participants.length).toBe(1);
      expect(participants[0].nickname).toBe('Ahmad Dani');
    });

    it('guru dapat mengunci sesi kelas dan menutup kelas', () => {
      classroomHub.createClass('Kelas TKJ 1', 'NET-1002');
      classroomHub.setStatus('NET-1002', 'locked');
      expect(classroomHub.getSession()?.status).toBe('locked');

      classroomHub.closeClass('NET-1002');
      expect(classroomHub.getSession()?.status).toBe('closed');
    });

    it('submission tersimpan dan mengubah status peserta menjadi submitted', () => {
      classroomHub.createClass('Kelas TKJ 1', 'NET-1003');
      const student = classroomHub.joinClass('NET-1003', 'Rina');
      expect(student).toBeDefined();

      const sub = {
        participantId: student!.id,
        nickname: student!.nickname,
        exerciseId: 'ex-01-lan-basic',
        score: 100,
        status: 'passed' as const,
        submittedAt: Date.now(),
        evaluation: {
          status: 'passed' as const,
          score: 100,
          checks: [],
          feedback: 'Sempurna',
          evaluatedAt: '10:00',
        },
      };

      classroomHub.submitWork('NET-1003', sub);

      const submissions = classroomHub.getSubmissions();
      expect(submissions[student!.id]).toBeDefined();
      expect(submissions[student!.id].score).toBe(100);

      const participants = classroomHub.getParticipants();
      expect(participants.find((p) => p.id === student!.id)?.status).toBe('submitted');
    });
  });

  describe('Exercise Evaluator', () => {
    const makePc = (id: string, label: string, ip: string, mask = '255.255.255.0'): DeviceData => ({
      id,
      label,
      type: 'pc',
      ports: [
        {
          id: 'fa0',
          name: 'FastEthernet 0',
          status: 'up',
          ipAddress: ip,
          subnetMask: mask,
          macAddress: `00:50:79:00:00:${id.slice(-2)}`,
        },
      ],
    });

    const makeSwitch = (id: string, label: string): DeviceData => ({
      id,
      label,
      type: 'switch',
      ports: [
        { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:01:00:00:00:01' },
        { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:01:00:00:00:02' },
      ],
    });

    it('menghasilkan nilai 100 ketika seluruh target konfigurasi dan reachability terpenuhi', async () => {
      const pc1 = makePc('pc-1', 'PC-1', '192.168.1.10');
      const srv1 = makePc('server-1', 'Server-1', '192.168.1.50');
      const sw1 = makeSwitch('sw-1', 'Switch-1');

      const devices = [pc1, srv1, sw1];
      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
        { sourceNodeId: 'server-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/2' },
      ];

      const ex1 = DEFAULT_EXERCISES[0]; // ex-01-lan-basic
      const evalResult = await evaluateExercise(ex1, devices, links);

      expect(evalResult.status).toBe('passed');
      expect(evalResult.score).toBe(100);
      expect(evalResult.checks.every((c) => c.passed)).toBe(true);
    });

    it('menghasilkan nilai parsial ketika kabel terhubung tetapi IP belum dikonfigurasi', async () => {
      // pc-1 belum memiliki IP yang benar (misal kosong)
      const pc1: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', macAddress: '00:50:79:00:00:01' }],
      };
      const srv1 = makePc('server-1', 'Server-1', '192.168.1.50');
      const sw1 = makeSwitch('sw-1', 'Switch-1');

      const devices = [pc1, srv1, sw1];
      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
        { sourceNodeId: 'server-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/2' },
      ];

      const ex1 = DEFAULT_EXERCISES[0];
      const evalResult = await evaluateExercise(ex1, devices, links);

      expect(evalResult.status).toBe('partial');
      expect(evalResult.score).toBeLessThan(100);
      expect(evalResult.checks.find((c) => c.targetId === 'tgt-pc1-ip')?.passed).toBe(false);
      expect(evalResult.checks.find((c) => c.targetId === 'tgt-link-pc-sw')?.passed).toBe(true);
    });

    it('menghasilkan nilai failed jika tidak ada perangkat yang cocok sama sekali', async () => {
      const emptyDevices: DeviceData[] = [];
      const emptyLinks: TopologyLink[] = [];

      const ex1 = DEFAULT_EXERCISES[0];
      const evalResult = await evaluateExercise(ex1, emptyDevices, emptyLinks);

      expect(evalResult.status).toBe('failed');
      expect(evalResult.score).toBe(0);
      expect(evalResult.checks.every((c) => !c.passed)).toBe(true);
    });
  });
});
