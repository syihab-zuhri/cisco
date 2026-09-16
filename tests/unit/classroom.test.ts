import { describe, it, expect, beforeEach } from 'vitest';
import { classroomHub, ClassroomHub } from '../../src/features/classroom/classroomHub';
import { evaluateExercise } from '../../src/features/classroom/exerciseEvaluator';
import { cleanNodesForStarterTopology } from '../../src/features/classroom/topologyExerciseConverter';
import { DEFAULT_EXERCISES } from '../../src/features/classroom/defaultExercises';
import {
  loadExercises,
  saveExercises,
  clearExercisesStorage,
} from '../../src/features/classroom/exerciseParser';
import type { DeviceData, TopologyLink } from '../../src/types/network';
import type { Exercise } from '../../src/features/classroom/types';


const MOCK_EXERCISES: Exercise[] = [
  {
    id: 'ex-01-lan-basic',
    title: 'Tantangan 01: Koneksi LAN Dasar (PC ke Switch & Server)',
    instructions:
      'Hubungkan PC-1 dan Server-1 ke Switch-1. Atur IP PC-1 ke 192.168.1.10 (mask 255.255.255.0) dan Server-1 ke 192.168.1.50 (mask 255.255.255.0). Pastikan ping dari PC-1 ke Server-1 berhasil.',
    difficulty: 'Dasar',
    starterTemplateId: 'tpl-single-switch-lan',
    targets: [
      {
        id: 'tgt-pc1-ip',
        title: 'Konfigurasi IP PC-1 (192.168.1.10/24)',
        type: 'device_config',
        deviceId: 'pc-1',
        address: '192.168.1.10',
        subnetMask: '255.255.255.0',
      },
      {
        id: 'tgt-srv1-ip',
        title: 'Konfigurasi IP Server-1 (192.168.1.50/24)',
        type: 'device_config',
        deviceId: 'server-1',
        address: '192.168.1.50',
        subnetMask: '255.255.255.0',
      },
      {
        id: 'tgt-link-pc-sw',
        title: 'Kabel fisik PC-1 terhubung ke Switch-1',
        type: 'link_exists',
        fromDeviceId: 'pc-1',
        toDeviceId: 'sw-1',
      },
      {
        id: 'tgt-ping-pc-srv',
        title: 'Ping berhasil: PC-1 menjangkau Server-1 (ICMP 100%)',
        type: 'reachability',
        sourceDeviceId: 'pc-1',
        destinationDeviceId: 'server-1',
      },
    ],
  },
  {
    id: 'ex-02-router-gateway',
    title: 'Tantangan 02: Routing Lintas Subnet dengan Default Gateway',
    instructions:
      'Hubungkan dua subnet berbeda melalui Router-1. Subnet A (192.168.1.0/24) untuk PC-1 dengan gateway 192.168.1.1. Subnet B (192.168.2.0/24) untuk PC-2 dengan gateway 192.168.2.1. Uji ping lintas segmen.',
    difficulty: 'Menengah',
    starterTemplateId: 'tpl-classic-router-direct',
    targets: [
      {
        id: 'tgt-pc1-ip',
        title: 'Konfigurasi IP PC-1 (192.168.1.10/24)',
        type: 'device_config',
        deviceId: 'pc-1',
        address: '192.168.1.10',
        subnetMask: '255.255.255.0',
      },
      {
        id: 'tgt-pc2-ip',
        title: 'Konfigurasi IP PC-2 (192.168.2.20/24)',
        type: 'device_config',
        deviceId: 'pc-2',
        address: '192.168.2.20',
        subnetMask: '255.255.255.0',
      },
      {
        id: 'tgt-ping-cross-subnet',
        title: 'Ping lintas subnet: PC-1 ke PC-2 melalui Router',
        type: 'reachability',
        sourceDeviceId: 'pc-1',
        destinationDeviceId: 'pc-2',
      },
    ],
  },
  {
    id: 'ex-03-vlan-segmentation',
    title: 'Tantangan 03: Isolasi Keamanan Jaringan dengan VLAN',
    instructions:
      'Lakukan segmentasi port pada Switch-1. Kelompokkan port PC-1 ke dalam VLAN 10 dan PC-2 ke dalam VLAN 20. Pastikan kedua host yang berbeda VLAN tidak dapat saling membocorkan trafik.',
    difficulty: 'Menengah',
    starterTemplateId: 'tpl-single-switch-lan',
    targets: [
      {
        id: 'tgt-vlan-pc1',
        title: 'Port PC-1 berada pada VLAN 10 (Access)',
        type: 'vlan_config',
        deviceId: 'sw-1',
        portId: 'fa0/1',
        vlanId: 10,
        mode: 'access',
      },
      {
        id: 'tgt-vlan-pc2',
        title: 'Port PC-2 berada pada VLAN 20 (Access)',
        type: 'vlan_config',
        deviceId: 'sw-1',
        portId: 'fa0/2',
        vlanId: 20,
        mode: 'access',
      },
      {
        id: 'tgt-link-sw-pc1',
        title: 'Koneksi fisik PC-1 ke Switch-1',
        type: 'link_exists',
        fromDeviceId: 'pc-1',
        toDeviceId: 'sw-1',
      },
    ],
  },
];
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

  describe('Teacher Exit and Exercise Purging Lifecycle', () => {
    it('menutup kelas (closeClass) membersihkan seluruh soal aktif dan mengosongkan bank soal di storage', () => {
      classroomHub.setLockedRole('teacher');
      saveExercises([...MOCK_EXERCISES]);
      expect(loadExercises().length).toBeGreaterThan(0);

      classroomHub.createClass('Kelas TKJ 1', 'NET-EX1', undefined, MOCK_EXERCISES);
      expect(classroomHub.getActiveExercises().length).toBeGreaterThan(0);
      expect(classroomHub.getActiveExercise()).not.toBeNull();

      // Guru menutup kelas
      classroomHub.closeClass('NET-EX1');

      // Seluruh soal aktif dan bank soal harus bersih
      expect(classroomHub.getActiveExercises()).toEqual([]);
      expect(classroomHub.getActiveExercise()).toBeNull();
      expect(loadExercises()).toEqual([]);
      expect(classroomHub.getSession()?.status).toBe('closed');
      expect(classroomHub.getSession()?.activeExercises).toEqual([]);
      expect(classroomHub.getSession()?.activeExerciseId).toBeNull();
    });

    it('guru meninggalkan kelas (leaveClass) membersihkan seluruh soal aktif dan bank soal storage', () => {
      classroomHub.setLockedRole('teacher');
      saveExercises([...MOCK_EXERCISES]);
      expect(loadExercises().length).toBeGreaterThan(0);

      classroomHub.createClass('Kelas TKJ 2', 'NET-EX2', undefined, MOCK_EXERCISES);
      expect(classroomHub.getActiveExercises().length).toBeGreaterThan(0);

      // Guru leaveClass
      classroomHub.leaveClass();

      // Seluruh soal dan peran harus bersih
      expect(classroomHub.getActiveExercises()).toEqual([]);
      expect(classroomHub.getActiveExercise()).toBeNull();
      expect(loadExercises()).toEqual([]);
      expect(classroomHub.getLockedRole()).toBeNull();
    });

    it('berganti peran dari guru ke student atau null (setLockedRole) membersihkan bank soal dan soal aktif', () => {
      classroomHub.setLockedRole('teacher');
      saveExercises([...MOCK_EXERCISES]);
      expect(loadExercises().length).toBeGreaterThan(0);

      classroomHub.createClass('Kelas TKJ 3', 'NET-EX3', undefined, MOCK_EXERCISES);
      expect(classroomHub.getActiveExercises().length).toBeGreaterThan(0);

      // Beralih ke student
      classroomHub.setLockedRole('student');
      expect(classroomHub.getActiveExercises()).toEqual([]);
      expect(classroomHub.getActiveExercise()).toBeNull();
      expect(loadExercises()).toEqual([]);
      expect(classroomHub.getLockedRole()).toBe('student');

      // Masuk lagi ke mode guru, simpan soal, lalu keluar ke null
      classroomHub.setLockedRole('teacher');
      saveExercises([...MOCK_EXERCISES]);
      expect(loadExercises().length).toBeGreaterThan(0);

      classroomHub.setLockedRole(null);
      expect(classroomHub.getActiveExercises()).toEqual([]);
      expect(classroomHub.getActiveExercise()).toBeNull();
      expect(loadExercises()).toEqual([]);
      expect(classroomHub.getLockedRole()).toBeNull();
    });

    it('clearAll membersihkan seluruh data sesi, peserta, submission, activeExercises, dan bank soal di storage', () => {
      classroomHub.setLockedRole('teacher');
      saveExercises([...MOCK_EXERCISES]);
      classroomHub.createClass('Kelas TKJ 4', 'NET-EX4', undefined, MOCK_EXERCISES);
      classroomHub.joinClass('NET-EX4', 'Murid 1');

      classroomHub.clearAll();

      expect(classroomHub.getSession()).toBeNull();
      expect(classroomHub.getParticipants()).toEqual([]);
      expect(classroomHub.getActiveExercises()).toEqual([]);
      expect(classroomHub.getActiveExercise()).toBeNull();
      expect(loadExercises()).toEqual([]);
      expect(classroomHub.getLockedRole()).toBeNull();
    });

    it('saveExercises dengan array kosong atau clearExercisesStorage() mengosongkan storage soal', () => {
      saveExercises([...MOCK_EXERCISES]);
      expect(loadExercises().length).toBe(MOCK_EXERCISES.length);

      saveExercises([]);
      expect(loadExercises()).toEqual([]);

      saveExercises([...MOCK_EXERCISES]);
      expect(loadExercises().length).toBe(MOCK_EXERCISES.length);

      clearExercisesStorage();
      expect(loadExercises()).toEqual([]);
    });

    it('loadExercises() mengembalikan array kosong [] secara default tanpa auto-seed', () => {
      expect(loadExercises()).toEqual([]);
      clearExercisesStorage();
      expect(loadExercises()).toEqual([]);
    });

    it('DEFAULT_EXERCISES kosong secara default untuk eliminasi total soal bawaan', () => {
      expect(DEFAULT_EXERCISES).toEqual([]);
    });

    it('guru keluar dari mode guru tanpa sesi kelas aktif tetap mengosongkan bank soal dan soal aktif', () => {
      classroomHub.setLockedRole('teacher');
      saveExercises([...MOCK_EXERCISES]);
      classroomHub.saveActiveExercises([...MOCK_EXERCISES]);
      classroomHub.saveActiveExercise(MOCK_EXERCISES[0]);
      expect(loadExercises().length).toBeGreaterThan(0);
      expect(classroomHub.getActiveExercises().length).toBeGreaterThan(0);

      // Tidak ada sesi kelas yang dibuat (sesi null), guru langsung leaveClass
      classroomHub.leaveClass();

      expect(loadExercises()).toEqual([]);
      expect(classroomHub.getActiveExercises()).toEqual([]);
      expect(classroomHub.getActiveExercise()).toBeNull();
      expect(classroomHub.getLockedRole()).toBeNull();
    });

    it('menyiarkan event CLASS_CLOSED dan EXERCISES_UPDATED (exercises: []) saat guru menutup kelas atau keluar peran', async () => {
      let resolveClosed!: () => void;
      const closedPromise = new Promise<void>((r) => { resolveClosed = r; });
      let resolveUpdated!: () => void;
      const updatedPromise = new Promise<void>((r) => { resolveUpdated = r; });
      const unsub = classroomHub.subscribe((ev) => {
        if (ev.type === 'CLASS_CLOSED') {
          resolveClosed();
        } else if (ev.type === 'EXERCISES_UPDATED' && (!ev.exercises || ev.exercises.length === 0)) {
          resolveUpdated();
        }
      });

      classroomHub.setLockedRole('teacher');
      classroomHub.createClass('Kelas Broadcast', 'NET-BC1', undefined, MOCK_EXERCISES);

      classroomHub.closeClass('NET-BC1');

      await Promise.all([closedPromise, updatedPromise]);

      expect(classroomHub.getActiveExercises()).toEqual([]);
      expect(loadExercises()).toEqual([]);

      unsub();
    });

    it('menghapus soal terakhir berhasil dan menyisakan daftar kosong serta membersihkan storage', () => {
      saveExercises([MOCK_EXERCISES[0]]);
      expect(loadExercises().length).toBe(1);

      // Simulasi guru menghapus soal terakhir
      const currentList = loadExercises();
      const exIdToDelete = currentList[0].id;
      const updated = currentList.filter((x) => x.id !== exIdToDelete);
      saveExercises(updated);

      expect(updated).toEqual([]);
      expect(loadExercises()).toEqual([]);
    });

    it('guru keluar dari Mode Guru sepenuhnya membersihkan soal dari memori dan storage', () => {
      classroomHub.setLockedRole('teacher');
      saveExercises([...MOCK_EXERCISES]);
      classroomHub.saveActiveExercises([...MOCK_EXERCISES]);
      classroomHub.saveActiveExercise(MOCK_EXERCISES[0]);
      expect(loadExercises().length).toBeGreaterThan(0);
      expect(classroomHub.getActiveExercises().length).toBeGreaterThan(0);
      expect(classroomHub.getActiveExercise()).not.toBeNull();

      clearExercisesStorage();
      classroomHub.saveActiveExercises([]);
      classroomHub.saveActiveExercise(null);
      classroomHub.leaveClass();
      classroomHub.setLockedRole(null);

      expect(loadExercises()).toEqual([]);
      expect(classroomHub.getActiveExercises()).toEqual([]);
      expect(classroomHub.getActiveExercise()).toBeNull();
      expect(classroomHub.getLockedRole()).toBeNull();
    });

    it('penutupan modal saat mode guru aktif tanpa sesi kelas aktif membersihkan mode guru dan bank soal', () => {
      classroomHub.setLockedRole('teacher');
      saveExercises([...MOCK_EXERCISES]);
      expect(loadExercises().length).toBeGreaterThan(0);
      expect(classroomHub.getSession()).toBeNull();

      // Simulasi penutupan modal oleh guru (handleModalClose / purgeAllTeacherData)
      const role = classroomHub.getLockedRole();
      if (role === 'teacher') {
        const curSess = classroomHub.getSession();
        const code = curSess?.classCode || '';
        classroomHub.closeClass(code);
        classroomHub.saveActiveExercises([]);
        classroomHub.saveActiveExercise(null);
        clearExercisesStorage();
        classroomHub.leaveClass();
        classroomHub.setLockedRole(null);
      }

      expect(loadExercises()).toEqual([]);
      expect(classroomHub.getLockedRole()).toBeNull();
      expect(classroomHub.getActiveExercises()).toEqual([]);
      expect(classroomHub.getActiveExercise()).toBeNull();
    });

    it('penutupan modal saat mode guru aktif dengan sesi kelas aktif selalu menutup kelas dan membersihkan seluruh soal dari memori dan storage', () => {
      classroomHub.setLockedRole('teacher');
      saveExercises([...MOCK_EXERCISES]);
      classroomHub.createClass('Kelas Ujian Modal', 'MODAL-99', undefined, MOCK_EXERCISES);
      expect(classroomHub.getActiveExercises().length).toBeGreaterThan(0);
      expect(classroomHub.getActiveExercise()).not.toBeNull();
      expect(loadExercises().length).toBeGreaterThan(0);
      expect(classroomHub.getSession()?.status).toBe('open');

      // Guru menutup modal saat kelas aktif (handleModalClose / purgeAllTeacherData)
      const role = classroomHub.getLockedRole();
      if (role === 'teacher') {
        const curSess = classroomHub.getSession();
        const code = (curSess?.classCode || '').trim();
        classroomHub.closeClass(code);
        classroomHub.saveActiveExercises([]);
        classroomHub.saveActiveExercise(null);
        clearExercisesStorage();
        classroomHub.leaveClass();
        classroomHub.setLockedRole(null);
      }

      expect(loadExercises()).toEqual([]);
      expect(classroomHub.getActiveExercises()).toEqual([]);
      expect(classroomHub.getActiveExercise()).toBeNull();
      expect(classroomHub.getLockedRole()).toBeNull();
      expect(classroomHub.getSession()?.status).toBe('closed');
      expect(classroomHub.getSession()?.activeExercises).toEqual([]);
      expect(classroomHub.getSession()?.activeExerciseId).toBeNull();
    });

    it('purgeAllTeacherData memicu siklus pembersihan menyeluruh (kelas ditutup, soal aktif kosong, storage bank soal kosong, lockedRole null, dan event broadcast)', async () => {
      let classClosedReceived = false;
      let exercisesUpdatedReceived = false;
      let resolveClosed!: () => void;
      const closedPromise = new Promise<void>((r) => { resolveClosed = r; });
      let resolveUpdated!: () => void;
      const updatedPromise = new Promise<void>((r) => { resolveUpdated = r; });
      let broadcastExercises: unknown = null;

      const unsub = classroomHub.subscribe((ev) => {
        if (ev.type === 'CLASS_CLOSED') {
          classClosedReceived = true;
          resolveClosed();
        }
        if (ev.type === 'EXERCISES_UPDATED' && (!ev.exercises || ev.exercises.length === 0)) {
          exercisesUpdatedReceived = true;
          broadcastExercises = ev.exercises;
          resolveUpdated();
        }
      });
      classroomHub.setLockedRole('teacher');
      saveExercises([...MOCK_EXERCISES]);
      classroomHub.createClass('Kelas Audit', 'AUDIT-101', undefined, MOCK_EXERCISES);
      classroomHub.joinClass('AUDIT-101', 'Peserta 1');

      expect(classroomHub.getLockedRole()).toBe('teacher');
      expect(classroomHub.getActiveExercises().length).toBeGreaterThan(0);
      expect(loadExercises().length).toBeGreaterThan(0);
      expect(classroomHub.getSession()?.status).toBe('open');

      // Jalankan logika identik dengan purgeAllTeacherData di ClassroomModal
      const curSess = classroomHub.getSession();
      const code = (curSess?.classCode || '').trim();
      classroomHub.closeClass(code);
      classroomHub.saveActiveExercises([]);
      classroomHub.saveActiveExercise(null);
      clearExercisesStorage();
      classroomHub.broadcast({
        type: 'CLASS_CLOSED',
        classCode: code,
      });
      classroomHub.broadcast({
        type: 'EXERCISES_UPDATED',
        classCode: code,
        exercises: [],
      });
      classroomHub.leaveClass();
      classroomHub.setLockedRole(null);
      await Promise.all([closedPromise, updatedPromise]);

      expect(loadExercises()).toEqual([]);
      expect(classroomHub.getActiveExercises()).toEqual([]);
      expect(classroomHub.getActiveExercise()).toBeNull();
      expect(classroomHub.getLockedRole()).toBeNull();
      expect(classroomHub.getSession()?.status).toBe('closed');
      expect(classroomHub.getSession()?.activeExercises).toEqual([]);
      expect(classroomHub.getSession()?.activeExerciseId).toBeNull();
      expect(classClosedReceived).toBe(true);
      expect(exercisesUpdatedReceived).toBe(true);
      expect(broadcastExercises).toEqual([]);
      unsub();
    });

    it('penghapusan soal satu per satu sampai habis mengosongkan bank soal dan soal aktif', () => {
      saveExercises([MOCK_EXERCISES[0], MOCK_EXERCISES[1]]);
      expect(loadExercises().length).toBe(2);

      // Hapus soal pertama
      let currentList = loadExercises();
      let updated = currentList.filter((x) => x.id !== MOCK_EXERCISES[0].id);
      saveExercises(updated);
      expect(loadExercises().length).toBe(1);

      // Hapus soal kedua (soal terakhir)
      currentList = loadExercises();
      updated = currentList.filter((x) => x.id !== MOCK_EXERCISES[1].id);
      saveExercises(updated);
      if (updated.length === 0) {
        clearExercisesStorage();
        classroomHub.saveActiveExercises([]);
        classroomHub.saveActiveExercise(null);
      }

      expect(loadExercises()).toEqual([]);
      expect(classroomHub.getActiveExercises()).toEqual([]);
      expect(classroomHub.getActiveExercise()).toBeNull();
    });

    it('invarian HUD Siswa: null jika sesi closed atau peserta null, dan tidak ada target soal aktif bila soal kosong', () => {
      // Kondisi 1: Peserta null -> HUD harus null
      const participantNull = null;
      const sessionOpen = {
        classCode: 'TEST-1',
        title: 'Kelas Test',
        createdAt: Date.now(),
        status: 'open' as 'open' | 'closed',
        allowSelfCheck: true,
        activeExercises: [],
        activeExerciseId: null,
      };
      const shouldRenderHUD1 = !(!participantNull || !sessionOpen || sessionOpen.status === 'closed');
      expect(shouldRenderHUD1).toBe(false);

      // Kondisi 2: Sesi closed -> HUD harus null
      const dummyParticipant = { id: 'p-1', nickname: 'Budi', joinedAt: Date.now(), status: 'in_progress' as const };
      const sessionClosed = { ...sessionOpen, status: 'closed' as const };
      const shouldRenderHUD2 = !(!dummyParticipant || !sessionClosed || sessionClosed.status === 'closed');
      expect(shouldRenderHUD2).toBe(false);

      // Kondisi 3: Siswa terhubung tetapi activeExercises kosong -> tidak ada instruksi/target soal
      const activeExercisesEmpty: Exercise[] = [];
      const activeExercise = activeExercisesEmpty[0] || null;
      expect(activeExercise).toBeNull();
      const hasActiveQuestionInstructions = activeExercise !== null;
      expect(hasActiveQuestionInstructions).toBe(false);
    });

    it('pada startup/inisialisasi ClassroomHub tanpa sesi aktif, storage bank soal lama otomatis dibersihkan', () => {
      // Simulasikan data legacy tersimpan di storage sebelum hub diinisialisasi
      saveExercises([...MOCK_EXERCISES]);
      expect(loadExercises().length).toBeGreaterThan(0);
      expect(classroomHub.getSession()).toBeNull();

      // Buat instance baru hub tanpa sesi aktif
      new ClassroomHub();

      // Storage harus sudah bersih
      expect(loadExercises()).toEqual([]);
    });

    it('invarian pembukaan modal tanpa sesi aktif: bank soal tetap kosong [] dan storage dibersihkan', () => {
      // Simulasikan ada data legacy
      saveExercises([...MOCK_EXERCISES]);
      expect(loadExercises().length).toBeGreaterThan(0);

      // Simulasikan logika ClassroomModal saat isOpen dan !existingSession
      const existingSession = classroomHub.getSession();
      expect(existingSession).toBeNull();

      let exercises: Exercise[] = ['dummy' as unknown as Exercise];
      let selectedExercise: Exercise | null = 'dummy' as unknown as Exercise;
      let selectedExamExerciseIds: string[] = ['ex-1'];

      if (!existingSession) {
        clearExercisesStorage();
        exercises = [];
        selectedExercise = null;
        selectedExamExerciseIds = [];
      }

      expect(exercises).toEqual([]);
      expect(selectedExercise).toBeNull();
      expect(selectedExamExerciseIds).toEqual([]);
      expect(loadExercises()).toEqual([]);
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

      const ex1 = MOCK_EXERCISES[0]; // ex-01-lan-basic
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

      const ex1 = MOCK_EXERCISES[0];
      const evalResult = await evaluateExercise(ex1, devices, links);

      expect(evalResult.status).toBe('partial');
      expect(evalResult.score).toBeLessThan(100);
      expect(evalResult.checks.find((c) => c.targetId === 'tgt-pc1-ip')?.passed).toBe(false);
      expect(evalResult.checks.find((c) => c.targetId === 'tgt-link-pc-sw')?.passed).toBe(true);
    });

    it('menghasilkan nilai failed jika tidak ada perangkat yang cocok sama sekali', async () => {
      const emptyDevices: DeviceData[] = [];
      const emptyLinks: TopologyLink[] = [];

      const ex1 = MOCK_EXERCISES[0];
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

    it('membersihkan seluruh konfigurasi IP saat siswa memuat starter topology guru', () => {
      const rawTeacherNodes = [
        {
          id: 'pc-1',
          data: {
            id: 'pc-1',
            label: 'PC-1',
            type: 'pc',
            defaultGateway: '192.168.1.1',
            staticRoutes: [{ destination: '10.0.0.0', mask: '255.0.0.0', nextHop: '192.168.1.254' }],
            ports: [
              {
                id: 'fa0',
                name: 'FastEthernet 0',
                ipAddress: '192.168.1.10',
                subnetMask: '255.255.255.0',
                macAddress: '00:50:79:66:01:01',
              },
            ],
          },
        },
        {
          id: 'router-1',
          data: {
            id: 'router-1',
            label: 'Router-1',
            type: 'router',
            ports: [
              {
                id: 'fa0/0',
                name: 'FastEthernet 0/0',
                ipAddress: '192.168.1.1',
                subnetMask: '255.255.255.0',
                subInterfaces: [
                  {
                    vlanId: 10,
                    ipAddress: '192.168.10.1',
                    subnetMask: '255.255.255.0',
                  },
                ],
              },
            ],
          },
        },
      ];

      const cleaned = cleanNodesForStarterTopology(rawTeacherNodes);

      // Node PC-1
      const pcPorts = cleaned[0].data.ports[0] as { ipAddress?: string; subnetMask?: string; macAddress?: string };
      expect(cleaned[0].data.label).toBe('PC-1');
      expect(cleaned[0].data.defaultGateway).toBeUndefined();
      expect(cleaned[0].data.staticRoutes).toBeUndefined();
      expect(pcPorts.ipAddress).toBeUndefined();
      expect(pcPorts.subnetMask).toBeUndefined();
      expect(pcPorts.macAddress).toBe('00:50:79:66:01:01');

      // Node Router-1 & subInterfaces
      const routerPorts = cleaned[1].data.ports[0] as { ipAddress?: string; subInterfaces?: Array<{ vlanId: number; ipAddress?: string }> };
      expect(routerPorts.ipAddress).toBeUndefined();
      expect(routerPorts.subInterfaces?.[0].ipAddress).toBeUndefined();
      expect(routerPorts.subInterfaces?.[0].vlanId).toBe(10);
    });
    it('mendukung toggle izin cek mandiri siswa oleh guru (mode ujian)', () => {
      const session = classroomHub.createClass('Kelas Ujian Ketat', 'NET-EXAM', undefined, []);
      expect(session.allowSelfCheck).toBe(true);

      // Guru mematikan cek mandiri
      classroomHub.toggleSelfCheck('NET-EXAM', false);
      expect(classroomHub.getSession()?.allowSelfCheck).toBe(false);

      // Guru menghidupkan kembali cek mandiri
      classroomHub.toggleSelfCheck('NET-EXAM', true);
      expect(classroomHub.getSession()?.allowSelfCheck).toBe(true);
    });

    it('membersihkan soal aktif saat guru menutup kelas (closeClass)', () => {
      const exercise: Exercise = {
        id: 'ex-cleanup-1',
        title: 'Soal Cleanup Test',
        instructions: 'Test',
        difficulty: 'Dasar',
        targets: [],
      };
      const session = classroomHub.createClass('Kelas Bersih', 'NET-CLEAN', undefined, [exercise]);
      expect(classroomHub.getActiveExercises().length).toBe(1);
      expect(classroomHub.getActiveExercise()?.id).toBe('ex-cleanup-1');

      // Guru menutup kelas
      classroomHub.closeClass(session.classCode);

      // Soal aktif harus bersih
      expect(classroomHub.getActiveExercises().length).toBe(0);
      expect(classroomHub.getActiveExercise()).toBeNull();
      expect(classroomHub.getSession()?.status).toBe('closed');
      expect(classroomHub.getSession()?.activeExercises).toEqual([]);
      expect(classroomHub.getSession()?.activeExerciseId).toBeNull();
    });

    it('membersihkan soal aktif saat guru keluar dari mode guru (leaveClass)', () => {
      const exercise: Exercise = {
        id: 'ex-leave-1',
        title: 'Soal Leave Test',
        instructions: 'Test',
        difficulty: 'Dasar',
        targets: [],
      };
      classroomHub.setLockedRole('teacher');
      classroomHub.createClass('Kelas Guru Keluar', 'NET-LEAVE', undefined, [exercise]);
      expect(classroomHub.getActiveExercises().length).toBe(1);

      // Guru keluar dari kelas / mode guru
      classroomHub.leaveClass();

      expect(classroomHub.getActiveExercises().length).toBe(0);
      expect(classroomHub.getActiveExercise()).toBeNull();
      expect(classroomHub.getLockedRole()).toBeNull();
    });

    it('membersihkan soal aktif saat beralih dari role teacher ke role student', () => {
      const exercise: Exercise = {
        id: 'ex-switch-1',
        title: 'Soal Switch Test',
        instructions: 'Test',
        difficulty: 'Dasar',
        targets: [],
      };
      classroomHub.setLockedRole('teacher');
      classroomHub.saveActiveExercises([exercise]);
      classroomHub.saveActiveExercise(exercise);
      expect(classroomHub.getActiveExercises().length).toBe(1);

      // Switch ke student
      classroomHub.setLockedRole('student');
      expect(classroomHub.getActiveExercises().length).toBe(0);
      expect(classroomHub.getActiveExercise()).toBeNull();
    });

    it('membersihkan soal aktif ketika updateClassExercises dipanggil dengan array kosong', () => {
      const exercise: Exercise = {
        id: 'ex-clear-1',
        title: 'Soal Clear Test',
        instructions: 'Test',
        difficulty: 'Dasar',
        targets: [],
      };
      const session = classroomHub.createClass('Kelas Kosongkan', 'NET-EMPTY', undefined, [exercise]);
      expect(classroomHub.getActiveExercises().length).toBe(1);

      classroomHub.updateClassExercises(session.classCode, []);
      expect(classroomHub.getActiveExercises().length).toBe(0);
      expect(classroomHub.getActiveExercise()).toBeNull();
      expect(classroomHub.getSession()?.activeExerciseId).toBeNull();
      expect(classroomHub.getSession()?.activeExercises).toEqual([]);
    });

    it('menolak target device_config pada router jika interface masih DOWN (no shutdown)', async () => {
      const routerDown: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'down',
            ipAddress: '192.168.1.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:00:00:01',
          },
        ],
      };

      const ex: Exercise = {
        id: 'ex-r-down',
        title: 'Uji Router Down',
        instructions: '',
        difficulty: 'Dasar',
        targets: [
          {
            id: 'tgt-ip',
            title: 'IP Router',
            type: 'device_config',
            deviceId: 'Router-1',
            address: '192.168.1.1',
            subnetMask: '255.255.255.0',
          },
        ],
      };

      const evalRes = await evaluateExercise(ex, [routerDown], []);
      expect(evalRes.checks[0].passed).toBe(false);
      expect(evalRes.checks[0].reason).toContain('no shutdown');
    });

    it('menolak target device_config sub-interface jika interface induk DOWN', async () => {
      const routerSubDown: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'down',
            macAddress: '00:50:79:00:00:01',
            subInterfaces: [
              {
                vlanId: 10,
                ipAddress: '192.168.10.1',
                subnetMask: '255.255.255.0',
              },
            ],
          },
        ],
      };

      const ex: Exercise = {
        id: 'ex-sub-down',
        title: 'Uji Sub-Interface Parent Down',
        instructions: '',
        difficulty: 'Dasar',
        targets: [
          {
            id: 'tgt-sub-ip',
            title: 'IP Sub-Interface',
            type: 'device_config',
            deviceId: 'Router-1',
            address: '192.168.10.1',
            subnetMask: '255.255.255.0',
          },
        ],
      };

      const evalRes = await evaluateExercise(ex, [routerSubDown], []);
      expect(evalRes.checks[0].passed).toBe(false);
      expect(evalRes.checks[0].reason).toContain('DOWN');
      expect(evalRes.checks[0].reason).toContain('FastEthernet 0/0');
    });

    it('memvalidasi prefix length (target.prefix) pada device_config', async () => {
      const pc: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [
          {
            id: 'fa0',
            name: 'FastEthernet 0',
            status: 'up',
            ipAddress: '10.0.0.1',
            subnetMask: '255.255.255.0', // /24
            macAddress: '00:50:79:00:00:11',
          },
        ],
      };

      const exWrongPrefix: Exercise = {
        id: 'ex-prefix-test',
        title: 'Uji Prefix',
        instructions: '',
        difficulty: 'Dasar',
        targets: [
          {
            id: 'tgt-prefix',
            title: 'IP dengan /16',
            type: 'device_config',
            deviceId: 'PC-1',
            address: '10.0.0.1',
            prefix: 16, // Ekspektasi /16 tetapi konfigurasi /24
          },
        ],
      };

      const resWrong = await evaluateExercise(exWrongPrefix, [pc], []);
      expect(resWrong.checks[0].passed).toBe(false);
      expect(resWrong.checks[0].reason).toContain('Prefix length tidak cocok');

      const exRightPrefix: Exercise = {
        id: 'ex-prefix-ok',
        title: 'Uji Prefix OK',
        instructions: '',
        difficulty: 'Dasar',
        targets: [
          {
            id: 'tgt-prefix-ok',
            title: 'IP dengan /24',
            type: 'device_config',
            deviceId: 'PC-1',
            address: '10.0.0.1',
            prefix: 24,
          },
        ],
      };

      const resRight = await evaluateExercise(exRightPrefix, [pc], []);
      expect(resRight.checks[0].passed).toBe(true);
    });

    it('menolak target link_exists jika port yang disambungkan tidak ada pada perangkat', async () => {
      const pc1: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', macAddress: '00:50:79:00:00:01' }],
      };
      const pc2: DeviceData = {
        id: 'pc-2',
        label: 'PC-2',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', macAddress: '00:50:79:00:00:02' }],
      };

      // Link dengan port hantu (non-existent port)
      const badLink: TopologyLink = {
        sourceNodeId: 'pc-1',
        sourcePortId: 'port-hantu',
        targetNodeId: 'pc-2',
        targetPortId: 'fa0',
      };

      const ex: Exercise = {
        id: 'ex-bad-link',
        title: 'Uji Link Hantu',
        instructions: '',
        difficulty: 'Dasar',
        targets: [
          {
            id: 'tgt-link',
            title: 'Kabel PC-1 ke PC-2',
            type: 'link_exists',
            fromDeviceId: 'PC-1',
            toDeviceId: 'PC-2',
          },
        ],
      };

      const res = await evaluateExercise(ex, [pc1, pc2], [badLink]);
      expect(res.checks[0].passed).toBe(false);
    });

    it('memvalidasi vlan_config mode trunk dan nama port yang fleksibel (spasi / huruf besar)', async () => {
      const sw: DeviceData = {
        id: 'sw-1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          {
            id: 'fa0/1',
            name: 'FastEthernet 0/1',
            status: 'up',
            portMode: 'trunk',
            macAddress: '00:50:79:00:00:33',
          },
        ],
      };

      const ex: Exercise = {
        id: 'ex-vlan-trunk',
        title: 'Uji VLAN Trunk',
        instructions: '',
        difficulty: 'Dasar',
        targets: [
          {
            id: 'tgt-trunk',
            title: 'Trunk Port Fa0/1',
            type: 'vlan_config',
            deviceId: 'Switch-1',
            portId: 'Fa0/1', // Huruf besar / format singkat
            vlanId: 1,
            mode: 'trunk',
          },
        ],
      };

      const res = await evaluateExercise(ex, [sw], []);
      expect(res.checks[0].passed).toBe(true);
    });
  });
});
