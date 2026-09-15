import { describe, it, expect, beforeEach } from 'vitest';
import { classroomHub } from '../../src/features/classroom/classroomHub';
import { evaluateExercise } from '../../src/features/classroom/exerciseEvaluator';
import { DEFAULT_EXERCISES } from '../../src/features/classroom/defaultExercises';
import type { DeviceData, TopologyLink } from '../../src/types/network';
import type { Exercise } from '../../src/features/classroom/types';

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
      expect(classroomHub.getCurrentParticipant()?.id).toBe(p1?.id);

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

    it('memvalidasi defaultGateway pada device_config', async () => {
      const pcWithGw: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        defaultGateway: '192.168.1.1',
        ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:10' }],
      };

      const testExercise = {
        id: 'ex-gw-test',
        title: 'Uji Gateway',
        instructions: 'Instruksi',
        difficulty: 'Dasar' as const,
        targets: [
          {
            id: 'tgt-gw-pc1',
            title: 'Konfigurasi IP PC-1 dan Gateway',
            type: 'device_config' as const,
            deviceId: 'PC-1',
            address: '192.168.1.10',
            gateway: '192.168.1.1',
          },
        ],
      };

      // Kasus 1: Sesuai
      const res1 = await evaluateExercise(testExercise, [pcWithGw], []);
      expect(res1.score).toBe(100);
      expect(res1.checks[0].passed).toBe(true);

      // Kasus 2: Gateway salah
      const pcWrongGw = { ...pcWithGw, defaultGateway: '192.168.1.254' };
      const res2 = await evaluateExercise(testExercise, [pcWrongGw], []);
      expect(res2.score).toBe(0);
      expect(res2.checks[0].passed).toBe(false);
      expect(res2.checks[0].reason).toContain('Default Gateway tidak sesuai');

      // Kasus 3: Gateway belum diisi
      const pcNoGw = { ...pcWithGw, defaultGateway: undefined };
      const res3 = await evaluateExercise(testExercise, [pcNoGw], []);
      expect(res3.score).toBe(0);
      expect(res3.checks[0].passed).toBe(false);
      expect(res3.checks[0].reason).toContain('belum diisi');
    });

    it('memvalidasi konfigurasi IP pada subInterfaces router-on-a-stick', async () => {
      const routerStick: DeviceData = {
        id: 'router-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          {
            id: 'g0/0',
            name: 'GigabitEthernet 0/0',
            status: 'up',
            macAddress: '00:50:79:00:00:99',
            subInterfaces: [
              { vlanId: 10, ipAddress: '192.168.10.1', subnetMask: '255.255.255.0' },
              { vlanId: 20, ipAddress: '192.168.20.1', subnetMask: '255.255.255.0' },
            ],
          },
        ],
      };

      const testExercise = {
        id: 'ex-subif-test',
        title: 'Uji Sub-Interface',
        instructions: 'Instruksi',
        difficulty: 'Menengah' as const,
        targets: [
          {
            id: 'tgt-subif-vlan10',
            title: 'IP VLAN 10 Router',
            type: 'device_config' as const,
            deviceId: 'Router-1',
            address: '192.168.10.1',
          },
        ],
      };

      const res = await evaluateExercise(testExercise, [routerStick], []);
      expect(res.score).toBe(100);
      expect(res.checks[0].passed).toBe(true);
      expect(res.checks[0].reason).toContain('sub-interface VLAN 10');
    });

    it('memberikan petunjuk diagnostik yang jelas saat ping gagal karena interface down atau gateway kosong', async () => {
      const pcDown: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'down', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:11' }],
      };
      const pc2: DeviceData = {
        id: 'pc-2',
        label: 'PC-2',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.2.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:22' }],
      };

      const testExercise = {
        id: 'ex-diag-test',
        title: 'Uji Diagnostik',
        instructions: 'Instruksi',
        difficulty: 'Dasar' as const,
        targets: [
          {
            id: 'tgt-ping',
            title: 'Ping PC-1 ke PC-2',
            type: 'reachability' as const,
            sourceDeviceId: 'PC-1',
            destinationDeviceId: 'PC-2',
          },
        ],
      };

      const res = await evaluateExercise(testExercise, [pcDown, pc2], []);
      expect(res.checks[0].passed).toBe(false);
      expect(res.checks[0].reason).toContain('DOWN (belum diaktifkan)');
    });

    it('membekukan snapshot ujian (immutable exam snapshot) sehingga perubahan katalog bank soal tidak mengubah soal siswa', () => {
      const initialExercises: Exercise[] = [
        {
          id: 'ex-snapshot-1',
          title: 'Soal A Awal',
          instructions: 'Kerjakan A',
          difficulty: 'Dasar' as const,
          targets: [],
        },
        {
          id: 'ex-snapshot-2',
          title: 'Soal B Awal',
          instructions: 'Kerjakan B',
          difficulty: 'Menengah' as const,
          targets: [],
        },
      ];

      // Buat kelas dengan 2 soal awal
      const session = classroomHub.createClass('Kelas Snapshot', 'NET-7777', undefined, initialExercises);
      expect(session.activeExercises?.length).toBe(2);
      expect(classroomHub.getActiveExercises().length).toBe(2);

      // Mutasi array sumber (misalnya guru mengedit soal di katalog bank soal)
      initialExercises[0].title = 'Soal A BERUBAH TOTAL';
      initialExercises.push({
        id: 'ex-snapshot-3',
        title: 'Soal C Tambahan',
        instructions: 'Kerjakan C',
        difficulty: 'Lanjutan' as const,
        targets: [],
      });

      // Soal ujian yang sedang aktif di kelas TIDAK BOLEH terpengaruh (tetap immutable snapshot)
      const activeList = classroomHub.getActiveExercises();
      expect(activeList.length).toBe(2);
      expect(activeList[0].title).toBe('Soal A Awal');
      expect(activeList.find((x) => x.id === 'ex-snapshot-3')).toBeUndefined();
    });

    it('mendukung pengerjaan multi-soal dengan navigasi dan skor per-soal pada submission', () => {
      classroomHub.createClass('Kelas Multi Soal', 'NET-8888');
      const student = classroomHub.joinClass('NET-8888', 'Budi Multi');
      expect(student).toBeDefined();

      const multiSub = {
        participantId: student!.id,
        nickname: student!.nickname,
        exerciseId: 'ex-01-lan-basic',
        score: 85,
        status: 'partial' as const,
        submittedAt: Date.now(),
        evaluation: {
          status: 'partial' as const,
          score: 85,
          checks: [],
          feedback: 'Rata-rata skor 85/100',
          evaluatedAt: new Date().toLocaleTimeString(),
        },
        exerciseScores: {
          'ex-01-lan-basic': 100,
          'ex-02-router-gateway': 70,
        },
      };

      classroomHub.submitWork('NET-8888', multiSub);
      const savedSubs = classroomHub.getSubmissions();
      expect(savedSubs[student!.id]).toBeDefined();
      expect(savedSubs[student!.id].exerciseScores?.['ex-01-lan-basic']).toBe(100);
      expect(savedSubs[student!.id].exerciseScores?.['ex-02-router-gateway']).toBe(70);
      expect(savedSubs[student!.id].score).toBe(85);
    });

    it('mengunci peran pengguna ke teacher atau student secara eksklusif dan aman', () => {
      // 1. Awalnya peran kosong (null)
      classroomHub.setLockedRole(null);
      expect(classroomHub.getLockedRole()).toBeNull();

      // 2. Kunci ke mode siswa & set partisipan
      classroomHub.setLockedRole('student');
      expect(classroomHub.getLockedRole()).toBe('student');
      classroomHub.setCurrentParticipant({
        id: 'stu-999',
        nickname: 'Ahmad Siswa',
        joinedAt: Date.now(),
        status: 'in_progress',
      });
      expect(classroomHub.getCurrentParticipant()?.nickname).toBe('Ahmad Siswa');

      // 3. Ketika beralih kunci ke mode guru, status siswa aktif wajib otomatis di-reset
      classroomHub.setLockedRole('teacher');
      expect(classroomHub.getLockedRole()).toBe('teacher');
      expect(classroomHub.getCurrentParticipant()).toBeNull();

      // 4. Reset peran (Ganti Peran)
      classroomHub.setLockedRole(null);
      expect(classroomHub.getLockedRole()).toBeNull();
    });

    it('membersihkan lockedRole saat clearAll() dipanggil', () => {
      classroomHub.setLockedRole('teacher');
      expect(classroomHub.getLockedRole()).toBe('teacher');
      classroomHub.clearAll();
      expect(classroomHub.getLockedRole()).toBeNull();
    });

    it('memastikan guru dapat membuka kelas tanpa soal (0 soal) dan bank soal awal default kosong', () => {
      const session = classroomHub.createClass('Kelas Kosong Awal', 'NET-EMPTY', undefined, []);
      expect(session.activeExercises).toEqual([]);
      expect(session.activeExerciseId).toBeNull();
      expect(classroomHub.getActiveExercises()).toEqual([]);
      expect(classroomHub.getActiveExercise()).toBeNull();

      // Siswa tetap dapat bergabung ke kelas tanpa error
      const student = classroomHub.joinClass('NET-EMPTY', 'Siswa A');
      expect(student).toBeDefined();
      expect(classroomHub.getParticipants().length).toBe(1);
    });

    it('memperbarui paket soal kelas via updateClassExercises tanpa menghilangkan partisipan', () => {
      const session = classroomHub.createClass('Kelas Dinamis', 'NET-DYN', undefined, []);
      const student = classroomHub.joinClass('NET-DYN', 'Siswa B');
      expect(student).toBeDefined();

      const newExercises = [
        {
          id: 'ex-dyn-1',
          title: 'Soal Praktikum 1',
          instructions: 'Hubungkan PC ke Switch',
          difficulty: 'Dasar' as const,
          category: 'LAN' as const,
          targets: [],
        },
      ];

      classroomHub.updateClassExercises(session.classCode, newExercises);
      expect(classroomHub.getActiveExercises().length).toBe(1);
      expect(classroomHub.getActiveExercises()[0].id).toBe('ex-dyn-1');
      expect(classroomHub.getActiveExercise()?.id).toBe('ex-dyn-1');

      // Partisipan siswa tetap ada dan tidak hilang
      expect(classroomHub.getParticipants().length).toBe(1);
      expect(classroomHub.getParticipants()[0].nickname).toBe('Siswa B');
    });
  });
});
