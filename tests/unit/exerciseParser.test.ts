import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseExerciseJson,
  parseSubmissionJson,
  validateExercise,
  validateExerciseTarget,
  loadExercises,
  saveExercises,
  clearExercisesStorage,
} from '../../src/features/classroom/exerciseParser';
import type { Exercise } from '../../src/features/classroom/types';

describe('Exercise Parser & Validator Suite', () => {
  beforeEach(() => {
    // Bersihkan storage
    clearExercisesStorage();
  });

  describe('validateExerciseTarget', () => {
    it('memvalidasi target device_config dengan alias expectedIp/subnetMask', () => {
      const raw = {
        id: 'tgt-1',
        title: 'Atur IP PC-1',
        type: 'device_config',
        deviceId: 'PC-1',
        expectedIp: '192.168.1.10',
        expectedMask: '255.255.255.0',
      };
      const result = validateExerciseTarget(raw, 0);
      expect(result.error).toBeUndefined();
      expect(result.target).toBeDefined();
      expect(result.target?.type).toBe('device_config');
      if (result.target?.type === 'device_config') {
        expect(result.target.address).toBe('192.168.1.10');
        expect(result.target.subnetMask).toBe('255.255.255.0');
      }
    });

    it('memvalidasi target link_exists dengan alias deviceA & deviceB', () => {
      const raw = {
        id: 'tgt-2',
        title: 'Hubungkan PC ke Switch',
        type: 'link_exists',
        deviceA: 'PC-1',
        deviceB: 'Switch-1',
      };
      const result = validateExerciseTarget(raw, 1);
      expect(result.error).toBeUndefined();
      expect(result.target?.type).toBe('link_exists');
      if (result.target?.type === 'link_exists') {
        expect(result.target.fromDeviceId).toBe('PC-1');
        expect(result.target.toDeviceId).toBe('Switch-1');
      }
    });

    it('memvalidasi target reachability dengan alias targetDeviceId', () => {
      const raw = {
        id: 'tgt-3',
        title: 'Ping ke Server',
        type: 'reachability',
        sourceDeviceId: 'PC-1',
        targetDeviceId: 'Server-1',
      };
      const result = validateExerciseTarget(raw, 2);
      expect(result.error).toBeUndefined();
      expect(result.target?.type).toBe('reachability');
      if (result.target?.type === 'reachability') {
        expect(result.target.destinationDeviceId).toBe('Server-1');
      }
    });

    it('menolak target dengan tipe tidak dikenal', () => {
      const raw = {
        title: 'Kriteria Aneh',
        type: 'invalid_type',
      };
      const result = validateExerciseTarget(raw, 0);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('tidak valid');
    });
  });

  describe('validateExercise', () => {
    it('memvalidasi soal lengkap dengan kriteria target', () => {
      const rawExercise = {
        id: 'ex-test-01',
        title: 'Praktikum Routing Static',
        instructions: '1. Atur IP router\n2. Uji ping',
        difficulty: 'Menengah',
        targets: [
          {
            id: 't-1',
            title: 'IP Router',
            type: 'device_config',
            deviceId: 'Router-1',
            address: '10.0.0.1',
          },
        ],
      };
      const result = validateExercise(rawExercise);
      expect(result.error).toBeUndefined();
      expect(result.exercise).toBeDefined();
      expect(result.exercise?.title).toBe('Praktikum Routing Static');
      expect(result.exercise?.difficulty).toBe('Menengah');
    });

    it('menolak soal dengan judul kosong', () => {
      const raw = {
        title: '   ',
        instructions: 'Petunjuk...',
        targets: [],
      };
      const result = validateExercise(raw);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('"title"');
    });

    it('menolak soal tanpa target kriteria', () => {
      const raw = {
        title: 'Soal Tanpa Target',
        instructions: 'Petunjuk...',
        targets: [],
      };
      const result = validateExercise(raw);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('minimal 1 kriteria');
    });
  });

  describe('parseExerciseJson', () => {
    it('berhasil mem-parse string JSON single exercise', () => {
      const jsonStr = JSON.stringify({
        id: 'ex-single',
        title: 'Soal Tunggal Guru',
        instructions: 'Ikuti petunjuk praktikum',
        difficulty: 'Dasar',
        targets: [
          {
            id: 't1',
            title: 'Koneksi PC ke Switch',
            type: 'link_exists',
            fromDeviceId: 'PC-1',
            toDeviceId: 'Switch-1',
          },
        ],
      });

      const res = parseExerciseJson(jsonStr);
      expect(res.success).toBe(true);
      expect(res.exercises.length).toBe(1);
      expect(res.exercises[0].id).toBe('ex-single');
      expect(res.exercises[0].title).toBe('Soal Tunggal Guru');
    });

    it('berhasil mem-parse string JSON kumpulan array bank soal', () => {
      const jsonStr = JSON.stringify([
        {
          id: 'ex-multi-1',
          title: 'Soal 1',
          instructions: 'Petunjuk 1',
          difficulty: 'Dasar',
          targets: [
            {
              id: 't1',
              title: 'Target 1',
              type: 'required_device_count',
              deviceType: 'pc',
              count: 2,
            },
          ],
        },
        {
          id: 'ex-multi-2',
          title: 'Soal 2',
          instructions: 'Petunjuk 2',
          difficulty: 'Lanjutan',
          targets: [
            {
              id: 't2',
              title: 'Target 2',
              type: 'vlan_config',
              deviceId: 'Switch-1',
              portId: 'fa0/1',
              vlanId: 20,
              mode: 'access',
            },
          ],
        },
      ]);

      const res = parseExerciseJson(jsonStr);
      expect(res.success).toBe(true);
      expect(res.exercises.length).toBe(2);
      expect(res.exercises[1].difficulty).toBe('Lanjutan');
    });

    it('mengembalikan error jika format teks bukan JSON valid', () => {
      const malformed = '{ title: "tidak ada kutip ganda", ';
      const res = parseExerciseJson(malformed);
      expect(res.success).toBe(false);
      expect(res.exercises.length).toBe(0);
      expect(res.errors[0]).toContain('Format JSON tidak valid');
    });

    it('mendukung parsing format paket praktikum mandiri (.oplab)', () => {
      const oplabObj = {
        format: 'openpacket_lab_package',
        version: '1.0',
        createdAt: 1789360000000,
        exercise: {
          id: 'ex-oplab-1',
          title: 'Praktikum Oplab Mandiri',
          instructions: 'Kerjakan secara mandiri',
          difficulty: 'Menengah',
          targets: [
            {
              id: 't-1',
              title: 'IP Router',
              type: 'device_config',
              deviceId: 'Router-1',
              address: '10.0.0.1',
            },
          ],
        },
      };

      const res = parseExerciseJson(JSON.stringify(oplabObj));
      expect(res.success).toBe(true);
      expect(res.exercises.length).toBe(1);
      expect(res.exercises[0].id).toBe('ex-oplab-1');
      expect(res.exercises[0].title).toBe('Praktikum Oplab Mandiri');
    });
  });

  describe('parseSubmissionJson (.opsub)', () => {
    it('berhasil mem-parse format berkas lembar jawaban .opsub', () => {
      const opsubData = {
        format: 'openpacket_submission',
        version: '1.0',
        submittedAt: 1789361000000,
        studentNickname: 'Budi Santoso',
        exerciseId: 'ex-01',
        submission: {
          participantId: 'stu-budi-1',
          nickname: 'Budi Santoso',
          exerciseId: 'ex-01',
          score: 100,
          status: 'passed',
          evaluation: {
            status: 'passed',
            score: 100,
            checks: [],
            feedback: 'Sempurna',
            evaluatedAt: '12:00',
          },
          submittedAt: 1789361000000,
        },
        topology: { nodes: [], edges: [] },
      };

      const res = parseSubmissionJson(JSON.stringify(opsubData));
      expect(res.success).toBe(true);
      expect(res.submission?.nickname).toBe('Budi Santoso');
      expect(res.submission?.score).toBe(100);
      expect(res.topology).toBeDefined();
    });

    it('menolak format berkas invalid dengan error deskriptif', () => {
      const res = parseSubmissionJson(JSON.stringify({ format: 'unknown_file' }));
      expect(res.success).toBe(false);
      expect(res.error).toContain('tidak dikenali');
    });
  });

  describe('Storage persistence', () => {
    it('dapat menyimpan dan memuat kembali daftar soal yang disunting', () => {
      const custom: Exercise[] = [
        {
          id: 'custom-01',
          title: 'Soal Khusus Ujian',
          instructions: 'Kerjakan dalam 30 menit',
          difficulty: 'Lanjutan',
          targets: [
            {
              id: 't1',
              title: 'IP Server',
              type: 'device_config',
              deviceId: 'Server-1',
              address: '172.16.0.5',
            },
          ],
        },
      ];

      saveExercises(custom);
      const loaded = loadExercises();
      expect(loaded.length).toBe(1);
      expect(loaded[0].id).toBe('custom-01');
      expect(loaded[0].title).toBe('Soal Khusus Ujian');
    });
  });
});
