/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
// @ts-expect-error importing mjs core
import { createRelayMiddleware } from '../../scripts/classroom-relay-core.mjs';
import {
  ClassroomHub,
  STORAGE_KEY_RELAY_URL,
  normalizeClassCode,
  generateSecret,
  type KeyValueStore,
} from '../../src/features/classroom/classroomHub';
import type { ClassroomEvent, Exercise, Submission } from '../../src/features/classroom/types';

/**
 * Integrasi hub <-> relay HTTP nyata dengan beberapa "perangkat" (hub + penyimpanan terpisah):
 * memastikan perbaikan audit Mode Kelas bekerja end-to-end (token, kick, lock, ronde, impor, ...).
 */

class MemoryKV implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

let server: Server;
let baseUrl = '';
let rooms: Map<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeAll(async () => {
  rooms = new Map();
  const mw = createRelayMiddleware(rooms, { autoCleanup: false });
  server = createServer((req, res) => mw(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function device() {
  const local = new MemoryKV();
  local.setItem(STORAGE_KEY_RELAY_URL, baseUrl);
  const hub = new ClassroomHub({ localStorage: local, sessionStorage: new MemoryKV(), fetch: globalThis.fetch });
  const events: ClassroomEvent[] = [];
  hub.subscribe((e) => events.push(e));
  return { hub, local, events };
}

async function until(cond: () => boolean, label: string, timeoutMs = 10000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout menunggu: ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

let seq = 0;
const uniqueCode = (prefix = 'HUB') => `${prefix}-${Date.now().toString(36).toUpperCase()}${seq++}`;

const EX = (id: string, title = id): Exercise => ({
  id,
  title,
  instructions: 'x',
  difficulty: 'Dasar',
  targets: [{ id: `${id}-t`, title: 'k', type: 'link_exists', fromDeviceId: 'PC-1', toDeviceId: 'SW-1' }],
});

function fakeSubmission(participantId: string, nickname: string, score: number): Submission {
  return {
    participantId,
    nickname,
    exerciseId: 'ex-1',
    score,
    status: score === 100 ? 'passed' : 'partial',
    evaluation: { status: 'partial', score, checks: [], feedback: 'ok', evaluatedAt: '' },
    submittedAt: Date.now(),
  };
}

async function startClass(teacher: ReturnType<typeof device>, code: string, exercises: Exercise[] = [EX('ex-1')]) {
  teacher.hub.setLockedRole('teacher');
  const session = teacher.hub.createClass('Kelas Uji', code, undefined, exercises);
  await until(() => rooms.has(code), 'room terbentuk di relay');
  return session;
}

async function joinStudent(code: string, nickname: string) {
  const s = device();
  s.hub.setLockedRole('student');
  const p = s.hub.joinClass(code, nickname)!;
  await until(() => rooms.get(code)?.participants.some((x: { id: string }) => x.id === p.id), `relay menerima ${nickname}`);
  return { ...s, participant: p };
}

describe('Hub: kode, token, dan kerahasiaan', () => {
  it('normalizeClassCode & generateSecret', () => {
    expect(normalizeClassCode('  net 1234 ')).toBe('NET-1234');
    expect(normalizeClassCode('a/b?c#d')).toBe('ABCD');
    expect(normalizeClassCode('')).toBe('');
    const a = generateSecret();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(generateSecret()).not.toBe(a);
  });

  it('perangkat siswa TIDAK PERNAH menerima hostToken guru (tersimpan kosong) dan guru mempertahankan tokennya', async () => {
    const code = uniqueCode();
    const teacher = device();
    const session = await startClass(teacher, code);
    const student = await joinStudent(code, 'Ani');

    await student.hub.syncWithServer(code);
    await teacher.hub.syncWithServer(code);

    expect(student.hub.getSession()?.hostToken).toBe('');
    expect(JSON.stringify(student.local)).not.toContain(session.hostToken);
    expect(JSON.stringify([...(student.local as unknown as { m: Map<string, string> }).m.values()])).not.toContain(session.hostToken);
    expect(teacher.hub.getSession()?.hostToken).toBe(session.hostToken);
  });

  it('siswa dengan token yang bocor tidak ada lagi: menutup kelas lewat event tanpa token ditolak', async () => {
    const code = uniqueCode();
    const teacher = device();
    await startClass(teacher, code);
    const student = await joinStudent(code, 'Ani');
    await student.hub.syncWithServer(code);

    const tokenOnStudent = student.hub.getSession()?.hostToken;
    const res = await fetch(`${baseUrl}/api/classroom/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'CLASS_CLOSED', classCode: code, hostToken: tokenOnStudent }),
    });
    expect(res.status).toBe(403);
    expect(rooms.get(code).session.status).toBe('open');
  });
});

describe('Hub: pra-pemeriksaan kelas saat bergabung', () => {
  it('checkClass membedakan: tidak ditemukan, ditemukan, terkunci, ditutup', async () => {
    const code = uniqueCode();
    const teacher = device();
    await startClass(teacher, code);
    const s = device();

    expect((await s.hub.checkClass('TIDAK-ADA-123')).status).toBe('not_found');
    expect(await s.hub.checkClass(code)).toMatchObject({ status: 'found', classStatus: 'open' });

    teacher.hub.setStatus(code, 'locked');
    await until(() => rooms.get(code).session.status === 'locked', 'lock');
    expect(await s.hub.checkClass(code)).toMatchObject({ status: 'found', classStatus: 'locked' });

    teacher.hub.closeClass(code);
    await until(() => rooms.get(code).session.status === 'closed', 'close');
    expect(await s.hub.checkClass(code)).toMatchObject({ status: 'found', classStatus: 'closed' });
  });

  it('checkClass = unreachable bila relay tidak terjangkau', async () => {
    const local = new MemoryKV();
    local.setItem(STORAGE_KEY_RELAY_URL, 'http://127.0.0.1:1'); // port tertutup
    const hub = new ClassroomHub({ localStorage: local, sessionStorage: new MemoryKV(), fetch: globalThis.fetch });
    expect((await hub.checkClass('APA-SAJA')).status).toBe('unreachable');
  });
});

describe('Hub: peserta, keluar, dan kick lintas perangkat', () => {
  it('siswa yang keluar tidak lagi tampil sebagai peserta hantu di perangkat guru', async () => {
    const code = uniqueCode();
    const teacher = device();
    await startClass(teacher, code);
    const ani = await joinStudent(code, 'Ani');
    const budi = await joinStudent(code, 'Budi');

    await teacher.hub.syncWithServer(code);
    expect(teacher.hub.getParticipants().map((p) => p.nickname).sort()).toEqual(['Ani', 'Budi']);

    ani.hub.leaveCurrentClass();
    await until(() => rooms.get(code).participants.length === 1, 'relay memproses PARTICIPANT_LEFT');
    await teacher.hub.syncWithServer(code);

    expect(teacher.hub.getParticipants().map((p) => p.nickname)).toEqual(['Budi']);
    expect(ani.hub.getSession()).toBeNull(); // siswa tidak menyisakan sesi basi
    expect(ani.hub.getCurrentParticipant()).toBeNull();
    expect(ani.hub.getLockedRole()).toBe('student'); // tetap di Mode Siswa
    void budi;
  });

  it('siswa yang sudah mengumpulkan lalu keluar tetap tampil di tabel guru dengan nilainya (status "left")', async () => {
    const code = uniqueCode();
    const teacher = device();
    await startClass(teacher, code);
    const ani = await joinStudent(code, 'Ani');
    ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 80));
    await until(() => Boolean(rooms.get(code).submissions[ani.participant.id]), 'submission masuk relay');
    ani.hub.leaveCurrentClass();
    await until(() => rooms.get(code).participants[0]?.status === 'left', 'status left');

    await teacher.hub.syncWithServer(code);
    expect(teacher.hub.getParticipants()[0].status).toBe('left');
    expect(teacher.hub.getSubmissions()[ani.participant.id].score).toBe(80);
  });

  it('guru yang meng-"Keluarkan" siswa benar-benar mengeluarkannya di perangkat siswa (lintas perangkat)', async () => {
    const code = uniqueCode();
    const teacher = device();
    await startClass(teacher, code);
    const ani = await joinStudent(code, 'Ani');
    await ani.hub.syncWithServer(code);
    expect(ani.hub.getCurrentParticipant()).not.toBeNull();

    teacher.hub.kickParticipant(code, ani.participant.id);
    await until(() => rooms.get(code).participants.length === 0, 'relay memproses kick');

    await ani.hub.syncWithServer(code);
    await until(() => ani.events.some((e) => e.type === 'PARTICIPANT_KICKED'), 'event PARTICIPANT_KICKED di perangkat siswa');
    expect(ani.hub.getCurrentParticipant()).toBeNull();
    expect(ani.hub.getSession()).toBeNull();
  });
});

describe('Hub: kunci sesi, kode ganda, dan penolakan relay', () => {
  it('kelas terkunci menolak join: siswa di-rollback dan diberi tahu (RELAY_REJECTED)', async () => {
    const code = uniqueCode();
    const teacher = device();
    await startClass(teacher, code);
    teacher.hub.setStatus(code, 'locked');
    await until(() => rooms.get(code).session.status === 'locked', 'lock');

    const s = device();
    s.hub.setLockedRole('student');
    s.hub.joinClass(code, 'Terlambat');
    await until(() => s.events.some((e) => e.type === 'RELAY_REJECTED'), 'penolakan diterima');

    const rej = s.events.find((e) => e.type === 'RELAY_REJECTED') as Extract<ClassroomEvent, { type: 'RELAY_REJECTED' }>;
    expect(rej.eventType).toBe('PARTICIPANT_JOINED');
    expect(rej.status).toBe(403);
    expect(rej.message).toContain('dikunci');
    expect(s.hub.getCurrentParticipant()).toBeNull();
    expect(s.hub.getSession()).toBeNull();
    expect(rooms.get(code).participants).toHaveLength(0);
  });

  it('guru kedua dengan kode sama ditolak dan DI-ROLLBACK (tidak menjadi "kelas hantu"); guru pertama tidak terganggu', async () => {
    const code = uniqueCode();
    const t1 = device();
    const s1 = await startClass(t1, code);
    const t2 = device();
    t2.hub.setLockedRole('teacher');
    t2.hub.createClass('Kelas Kembar', code);
    await until(() => t2.events.some((e) => e.type === 'RELAY_REJECTED'), 'penolakan CLASS_CREATED');

    expect(t2.hub.getSession()).toBeNull();
    // polling guru kedua tidak boleh mengadopsi sesi/token guru pertama
    await t2.hub.syncWithServer(code);
    expect(t2.hub.getSession()).toBeNull();
    expect(rooms.get(code).hostToken).toBe(s1.hostToken);
    expect(rooms.get(code).session.title).toBe('Kelas Uji');
  });

  it('kode OTOMATIS yang bentrok diganti kode baru secara diam-diam (retry), tanpa error ke guru', async () => {
    const occupied = 'NET-1234';
    const t1 = device();
    await startClass(t1, occupied);
    const t2 = device();
    t2.hub.setLockedRole('teacher');

    // Dua panggilan Math.random pertama (kode lalu id sesi) menghasilkan NET-1234 yang sudah dipakai; sisanya NET-5500.
    let calls = 0;
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => (calls++ < 2 ? (1234 - 1000) / 9000 : 0.5));
    let created;
    try {
      created = t2.hub.createClass('Kelas Otomatis');
      expect(created.classCode).toBe(occupied);
      await until(() => t2.hub.getSession()?.classCode !== occupied && t2.hub.getSession() !== null, 'kode diganti', 4000);
    } finally {
      spy.mockRestore();
    }
    const finalCode = t2.hub.getSession()!.classCode;
    expect(finalCode).not.toBe(occupied);
    await until(() => rooms.has(finalCode), 'room kode baru ada di relay');
    expect(t2.events.some((e) => e.type === 'RELAY_REJECTED')).toBe(false);
    expect(rooms.get(occupied).hostToken).toBe(t1.hub.getSession()!.hostToken);
  });

  it('submission setelah kelas ditutup ditolak dan guru/siswa diberi tahu', async () => {
    const code = uniqueCode();
    const teacher = device();
    await startClass(teacher, code);
    const ani = await joinStudent(code, 'Ani');
    teacher.hub.closeClass(code);
    await until(() => rooms.get(code).session.status === 'closed', 'ditutup');

    ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 100));
    await until(() => ani.events.some((e) => e.type === 'RELAY_REJECTED'), 'penolakan submission');
    expect(rooms.get(code).submissions).toEqual({});
  });
});

describe('Hub: ronde, riwayat, kuota cek mandiri, dan impor', () => {
  it('soal baru memulai ronde baru: nilai lama diarsipkan, kuota cek mandiri kembali penuh', async () => {
    const code = uniqueCode();
    const teacher = device();
    await startClass(teacher, code, [EX('ex-1')]);
    const ani = await joinStudent(code, 'Ani');
    await ani.hub.syncWithServer(code);
    // pastikan sesi siswa sudah memuat ronde dari relay (polling pertama dari joinClass bisa masih berjalan)
    await until(() => ani.hub.getSession()?.round === 1, 'sesi siswa memuat ronde 1');

    ani.hub.incrementSelfCheckCount('ex-1');
    ani.hub.incrementSelfCheckCount('ex-1');
    expect(ani.hub.getSelfCheckCount('ex-1')).toBe(2);

    ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 90));
    await until(() => Boolean(rooms.get(code).submissions[ani.participant.id]), 'submission');

    teacher.hub.startExercises(code, [EX('ex-2')]);
    await until(() => rooms.get(code).round === 2, 'ronde baru di relay');

    await teacher.hub.syncWithServer(code);
    expect(teacher.hub.getHistory()).toHaveLength(1);
    expect(teacher.hub.getHistory()[0].submissions[ani.participant.id].score).toBe(90);
    expect(teacher.hub.getSubmissions()).toEqual({});

    await ani.hub.syncWithServer(code);
    expect(ani.hub.getSession()?.round).toBe(2);
    expect(ani.hub.getActiveExercises().map((e) => e.id)).toEqual(['ex-2']);
    expect(ani.hub.getSelfCheckCount('ex-2')).toBe(0);
    // kunci kuota memuat nomor ronde: soal yang sama pada ronde baru juga mulai dari nol
    expect(ani.hub.getSelfCheckCount('ex-1')).toBe(0);
  });

  it('kuota cek mandiri bertahan selama penyimpanan tab sama (tidak hilang seperti state React saat refresh)', async () => {
    const code = uniqueCode();
    const teacher = device();
    await startClass(teacher, code);
    const ani = await joinStudent(code, 'Ani');
    ani.hub.incrementSelfCheckCount('ex-1');
    // "refresh": hub baru di atas penyimpanan yang sama
    const reborn = new ClassroomHub({ localStorage: ani.local, sessionStorage: (ani.hub as unknown as { opts: { sessionStorage: KeyValueStore } }).opts.sessionStorage, fetch: globalThis.fetch });
    expect(reborn.getSelfCheckCount('ex-1')).toBe(1);
  });

  it('data impor .opsub tidak terhapus oleh sinkronisasi relay, dan peserta tidak digabung berdasarkan nickname', async () => {
    const code = uniqueCode();
    const teacher = device();
    await startClass(teacher, code);
    const ani = await joinStudent(code, 'Ani');
    ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 70));
    await until(() => Boolean(rooms.get(code).submissions[ani.participant.id]), 'submission relay');

    const count = teacher.hub.importSubmissions([
      fakeSubmission('offline-1', 'Ani', 55), // nickname sama dengan peserta relay, id berbeda
      fakeSubmission('offline-2', 'Ani', 65),
    ]);
    expect(count).toBe(2);
    await teacher.hub.syncWithServer(code);

    const ids = teacher.hub.getParticipants().map((p) => p.id).sort();
    expect(ids).toEqual([ani.participant.id, 'offline-1', 'offline-2'].sort());
    expect(Object.keys(teacher.hub.getSubmissions()).sort()).toEqual([ani.participant.id, 'offline-1', 'offline-2'].sort());
    expect(teacher.hub.getSubmissions()['offline-1'].score).toBe(55);
    expect(teacher.hub.getSubmissions()['offline-1'].imported).toBe(true);
  });
});

describe('Hub: latihan mandiri lokal (.oplab)', () => {
  it('sesi lokal tidak pernah menyentuh relay, sehingga siswa lain tidak saling menimpa', async () => {
    const before = rooms.size;
    const a = device();
    a.hub.setLockedRole('student');
    const sess = a.hub.createClass('Praktikum Mandiri', 'MANDIRI', undefined, undefined, { local: true });
    expect(sess.local).toBe(true);
    a.hub.startExercise('MANDIRI', EX('lab-alpha'));
    const p = a.hub.joinClass('MANDIRI', 'Siswa A')!;
    a.hub.submitWork('MANDIRI', fakeSubmission(p.id, 'Siswa A', 100));
    await new Promise((r) => setTimeout(r, 150));
    expect(rooms.has('MANDIRI')).toBe(false);
    expect(rooms.size).toBe(before);

    // polling pun tidak mengadopsi apa pun dari relay
    expect(await a.hub.syncWithServer('MANDIRI')).toBe(false);
    expect(a.hub.getActiveExercises().map((e) => e.id)).toEqual(['lab-alpha']);
  });
});

// ---------------------------------------------------------------------------
// Pemulihan otomatis setelah relay restart + snapshot untuk verifikasi guru
// ---------------------------------------------------------------------------

const SNAP = {
  nodes: [{ id: 'pc-1', type: 'deviceNode', data: { id: 'pc-1', label: 'PC-1', type: 'pc', ports: [{ id: 'fa0', name: 'Fa0', status: 'up', macAddress: 'aa:bb' }] } }],
  edges: [],
};

/** Simulasikan relay restart: seluruh room di memori hilang. */
const restartRelay = () => rooms.clear();

function deviceWithSession() {
  const local = new MemoryKV();
  const sessionKV = new MemoryKV();
  local.setItem(STORAGE_KEY_RELAY_URL, baseUrl);
  const hub = new ClassroomHub({ localStorage: local, sessionStorage: sessionKV, fetch: globalThis.fetch });
  const events: ClassroomEvent[] = [];
  hub.subscribe((e) => events.push(e));
  return { hub, local, sessionKV, events };
}

/** Peserta lama: lewati jeda 5 dtk "join yang baru berjalan" agar pemulihan boleh berjalan di test. */
function ageParticipant(d: ReturnType<typeof deviceWithSession>) {
  const p = d.hub.getCurrentParticipant()!;
  d.sessionKV.setItem('openpacket_current_participant', JSON.stringify({ ...p, joinedAt: p.joinedAt - 60_000 }));
  return d.hub.getCurrentParticipant()!;
}

describe('Hub: kelas pulih otomatis setelah relay restart', () => {
  it('guru mendaftarkan ulang kelas (ronde, status, soal, arsip) lalu siswa tersambung kembali dan mengirim ulang jawabannya', async () => {
    const code = uniqueCode('RST');
    const teacher = deviceWithSession();
    teacher.hub.setLockedRole('teacher');
    teacher.hub.createClass('Kelas Pulih', code, undefined, [EX('ex-1')]);
    await until(() => rooms.get(code)?.round === 1, 'kelas + ronde 1 di relay');

    const student = deviceWithSession();
    student.hub.setLockedRole('student');
    const p = student.hub.joinClass(code, 'Ani')!;
    await until(() => rooms.get(code).participants.length === 1, 'siswa tercatat');
    student.hub.submitWork(code, fakeSubmission(p.id, 'Ani', 80), SNAP as never);
    await until(() => Boolean(rooms.get(code).submissions[p.id]), 'jawaban tercatat');
    await teacher.hub.syncWithServer(code);

    // --- relay restart ---
    restartRelay();
    expect(rooms.has(code)).toBe(false);

    // guru: sinkronisasi menemukan kelas hilang -> daftar ulang otomatis
    await teacher.hub.syncWithServer(code);
    await until(() => rooms.has(code), 'kelas dipulihkan guru');
    expect(rooms.get(code).round).toBe(1);
    expect(rooms.get(code).session.title).toBe('Kelas Pulih');
    expect(rooms.get(code).hostToken).toBe(teacher.hub.getSession()!.hostToken);
    expect(rooms.get(code).activeExercises.map((e: { id: string }) => e.id)).toEqual(['ex-1']);
    expect(rooms.get(code).participants).toHaveLength(0); // peserta dipulihkan oleh siswa sendiri
    await until(() => teacher.events.some((e) => e.type === 'RELAY_RESTORED'), 'notifikasi guru');
    // data lokal guru tidak ikut direset oleh pemulihan, dan tabel tidak dikosongkan selama masa tenggang
    expect(teacher.hub.getParticipants()).toHaveLength(1);
    await teacher.hub.syncWithServer(code);
    expect(teacher.hub.getParticipants().map((x) => x.nickname)).toEqual(['Ani']);
    expect(teacher.hub.getSubmissions()[p.id].score).toBe(80);

    // siswa: relay mengenal kelas tetapi tidak mengenal dirinya -> bergabung kembali + kirim ulang jawaban
    ageParticipant(student);
    await student.hub.syncWithServer(code);
    await until(() => rooms.get(code).participants.some((x: { id: string }) => x.id === p.id), 'siswa tersambung kembali');
    await until(() => Boolean(rooms.get(code).submissions[p.id]), 'jawaban dikirim ulang');
    expect(rooms.get(code).submissions[p.id].score).toBe(80);
    expect(rooms.get(code).snapshots[p.id]).toBeDefined(); // snapshot ikut dikirim ulang
    await until(() => student.events.some((e) => e.type === 'RELAY_RESTORED'), 'notifikasi siswa');

    // guru melihat peserta + nilai kembali
    await teacher.hub.syncWithServer(code);
    expect(teacher.hub.getParticipants().map((x) => x.nickname)).toEqual(['Ani']);
    expect(teacher.hub.getSubmissions()[p.id].score).toBe(80);
  });

  it('ronde, status "locked", dan arsip nilai dipertahankan saat guru memulihkan kelas', async () => {
    const code = uniqueCode('RST');
    const teacher = deviceWithSession();
    teacher.hub.setLockedRole('teacher');
    teacher.hub.createClass('Kelas', code, undefined, [EX('ex-1')]);
    await until(() => rooms.get(code)?.round === 1, 'kelas + ronde 1 di relay'); // join sebelum kelas ada = 404
    const ani = await joinStudent(code, 'Ani');
    ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 70));
    await until(() => Boolean(rooms.get(code).submissions[ani.participant.id]), 'jawaban');
    await teacher.hub.syncWithServer(code);
    teacher.hub.startExercises(code, [EX('ex-2')]); // ronde 2, nilai ronde 1 diarsipkan
    await until(() => rooms.get(code).round === 2, 'ronde 2');
    teacher.hub.setStatus(code, 'locked');
    await until(() => rooms.get(code).session.status === 'locked', 'locked');
    await teacher.hub.syncWithServer(code);
    expect(teacher.hub.getHistory()).toHaveLength(1);

    restartRelay();
    await teacher.hub.syncWithServer(code);
    await until(() => rooms.has(code), 'dipulihkan');
    const room = rooms.get(code);
    expect(room.round).toBe(2);
    expect(room.session.status).toBe('locked');
    expect(room.history).toHaveLength(1);
    expect(room.history[0].submissions[ani.participant.id].score).toBe(70);
    expect(room.activeExercises.map((e: { id: string }) => e.id)).toEqual(['ex-2']);
  });

  it('kelas yang sudah ditutup tidak dihidupkan kembali', async () => {
    const code = uniqueCode('RST');
    const teacher = deviceWithSession();
    teacher.hub.setLockedRole('teacher');
    teacher.hub.createClass('Kelas', code);
    await until(() => rooms.has(code), 'dibuat');
    teacher.hub.closeClass(code);
    await until(() => rooms.get(code).session.status === 'closed', 'ditutup');
    restartRelay();
    await teacher.hub.syncWithServer(code);
    await new Promise((r) => setTimeout(r, 200));
    expect(rooms.has(code)).toBe(false);
  });

  it('kode kelas diambil guru lain saat relay restart: guru pertama diberi tahu, datanya tidak tertimpa, kelas lokal tetap', async () => {
    const code = uniqueCode('RST');
    const t1 = deviceWithSession();
    t1.hub.setLockedRole('teacher');
    t1.hub.createClass('Kelas Asli', code);
    await until(() => rooms.has(code), 'dibuat');

    restartRelay();
    const t2 = deviceWithSession();
    t2.hub.setLockedRole('teacher');
    t2.hub.createClass('Pengambil Alih', code); // memakai kode saat relay kosong
    await until(() => rooms.get(code)?.session.title === 'Pengambil Alih', 'guru lain mengambil kode');

    await t1.hub.syncWithServer(code);
    await until(() => t1.events.some((e) => e.type === 'RELAY_REJECTED'), 'pemberitahuan kode dipakai guru lain');
    const rej = t1.events.find((e) => e.type === 'RELAY_REJECTED') as Extract<ClassroomEvent, { type: 'RELAY_REJECTED' }>;
    expect(rej.message).toContain('dipakai guru lain');
    expect(t1.hub.getSession()?.title).toBe('Kelas Asli'); // judul/token lokal TIDAK tertimpa data guru lain
    expect(rooms.get(code).session.title).toBe('Pengambil Alih');
    expect(rooms.get(code).hostToken).toBe(t2.hub.getSession()!.hostToken);
  });

  it('siswa kelas lama TIDAK ikut masuk ke kelas guru lain yang memakai kode sama; sesinya diakhiri dengan alasan "replaced"', async () => {
    const code = uniqueCode('IPA');
    const guruA = deviceWithSession();
    guruA.hub.setLockedRole('teacher');
    guruA.hub.createClass('Kelas IPA 5 (Guru A)', code, undefined, [EX('ex-a')]);
    await until(() => rooms.get(code)?.round === 1, 'kelas A');

    const ani = deviceWithSession();
    ani.hub.setLockedRole('student');
    const p = ani.hub.joinClass(code, 'Ani')!;
    await until(() => rooms.get(code).participants.length === 1, 'Ani bergabung ke kelas A');
    await ani.hub.syncWithServer(code); // sesi lokal siswa kini memakai id sesi kelas A
    expect(ani.hub.getSession()?.id).toBe(guruA.hub.getSession()!.id);
    ani.hub.submitWork(code, { ...fakeSubmission(p.id, 'Ani', 80), exerciseId: 'ex-a' }, SNAP as never);
    await until(() => Boolean(rooms.get(code).submissions[p.id]), 'jawaban Ani di kelas A');

    restartRelay();
    const guruB = deviceWithSession();
    guruB.hub.setLockedRole('teacher');
    guruB.hub.createClass('Kelas IPA 5 (Guru B)', code, undefined, [EX('ex-b')]);
    await until(() => rooms.get(code)?.session.title === 'Kelas IPA 5 (Guru B)', 'guru B memakai kode');

    ageParticipant(ani);
    await ani.hub.syncWithServer(code);
    await new Promise((r) => setTimeout(r, 300));

    // relay: kelas B bersih dari peserta & jawaban kelas A
    expect(rooms.get(code).participants).toEqual([]);
    expect(rooms.get(code).submissions).toEqual({});
    // siswa: sesi diakhiri dengan alasan jelas, tidak mengadopsi judul/soal kelas B
    const ended = ani.events.find((e) => e.type === 'STUDENT_SESSION_ENDED') as Extract<ClassroomEvent, { type: 'STUDENT_SESSION_ENDED' }>;
    expect(ended?.reason).toBe('replaced');
    expect(ani.events.some((e) => e.type === 'RELAY_RESTORED')).toBe(false);
    expect(ani.hub.getSession()).toBeNull();
    expect(ani.hub.getCurrentParticipant()).toBeNull();
    // guru B tidak melihat siswa asing
    await guruB.hub.syncWithServer(code);
    expect(guruB.hub.getParticipants()).toEqual([]);
    expect(guruB.hub.getSubmissions()).toEqual({});
  });

  it('kelas yang dipulihkan guru yang SAMA tetap dikenali siswa (id sesi sama) sehingga siswa tersambung kembali', async () => {
    const code = uniqueCode('IPA');
    const guru = deviceWithSession();
    guru.hub.setLockedRole('teacher');
    guru.hub.createClass('Kelas IPA 5', code, undefined, [EX('ex-a')]);
    await until(() => rooms.get(code)?.round === 1, 'kelas');
    const ani = deviceWithSession();
    ani.hub.setLockedRole('student');
    const p = ani.hub.joinClass(code, 'Ani')!;
    await until(() => rooms.get(code).participants.length === 1, 'Ani bergabung');
    await ani.hub.syncWithServer(code);

    restartRelay();
    await guru.hub.syncWithServer(code);
    await until(() => rooms.has(code), 'guru memulihkan kelas');
    expect(rooms.get(code).session.id).toBe(guru.hub.getSession()!.id);

    ageParticipant(ani);
    await ani.hub.syncWithServer(code);
    await until(() => rooms.get(code).participants.some((x: { id: string }) => x.id === p.id), 'Ani tersambung kembali');
    expect(ani.events.some((e) => e.type === 'STUDENT_SESSION_ENDED')).toBe(false);
  });
});

describe('Hub: snapshot topologi untuk verifikasi guru', () => {
  it('relay preserves independent question snapshots only in the authenticated teacher snapshot endpoint', async () => {
    const code = uniqueCode('PACKET');
    const teacher = deviceWithSession();
    teacher.hub.setLockedRole('teacher');
    teacher.hub.createClass('Kelas', code, undefined, [EX('ex-1')]);
    await until(() => rooms.has(code), 'dibuat');
    const ani = await joinStudent(code, 'Ani');
    const packet = { ...SNAP, exerciseTopologies: { e1: SNAP, e2: { nodes: [], edges: [] } } };
    ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 50), packet as never);
    await until(() => Boolean(rooms.get(code).snapshots[ani.participant.id]), 'snapshot paket');
    const snapshot = await teacher.hub.fetchSnapshot(code, ani.participant.id);
    expect(snapshot?.exerciseTopologies?.e1.nodes[0].id).toBe('pc-1');
    expect(snapshot?.exerciseTopologies?.e2).toEqual({ nodes: [], edges: [] });
    const publicView = await fetch(`${baseUrl}/api/classroom/state?code=${code}`);
    expect(JSON.stringify(await publicView.json())).not.toContain('exerciseTopologies');
  });

  it('guru dapat mengambil snapshot siswa; siswa/anonim tidak; poll biasa tidak membawa snapshot', async () => {
    const code = uniqueCode('SNP');
    const teacher = deviceWithSession();
    teacher.hub.setLockedRole('teacher');
    teacher.hub.createClass('Kelas', code, undefined, [EX('ex-1')]);
    await until(() => rooms.has(code), 'dibuat');
    const ani = await joinStudent(code, 'Ani');
    const budi = await joinStudent(code, 'Budi');
    ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 90), SNAP as never);
    await until(() => Boolean(rooms.get(code).snapshots[ani.participant.id]), 'snapshot tersimpan');

    const got = await teacher.hub.fetchSnapshot(code, ani.participant.id);
    expect(got?.nodes[0].id).toBe('pc-1');
    expect(await teacher.hub.fetchSnapshot(code, budi.participant.id)).toBeNull(); // Budi belum mengumpulkan

    // siswa tidak punya token host: relay menolak
    const stolen = await fetch(`${baseUrl}/api/classroom/snapshot?code=${code}&participantId=${ani.participant.id}`, { headers: { 'X-Host-Token': 'bukan-token-host' } });
    expect(stolen.status).toBe(403);
    const noHeader = await fetch(`${baseUrl}/api/classroom/snapshot?code=${code}&participantId=${ani.participant.id}`);
    expect(noHeader.status).toBe(403);

    // snapshot tidak ikut dalam tampilan state mana pun
    await teacher.hub.syncWithServer(code);
    const hostView = await fetch(`${baseUrl}/api/classroom/state?code=${code}`, { headers: { 'X-Host-Token': teacher.hub.getSession()!.hostToken } });
    expect(JSON.stringify(await hostView.json())).not.toContain('"nodes"');
  });

  it('snapshot rusak/terlalu besar diabaikan tanpa menolak jawabannya; snapshot dibuang saat ronde baru', async () => {
    const code = uniqueCode('SNP');
    const teacher = deviceWithSession();
    teacher.hub.setLockedRole('teacher');
    teacher.hub.createClass('Kelas', code, undefined, [EX('ex-1')]);
    await until(() => rooms.has(code), 'dibuat');
    const ani = await joinStudent(code, 'Ani');
    const budi = await joinStudent(code, 'Budi');
    const cici = await joinStudent(code, 'Cici');

    ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 50), { nodes: 'rusak', edges: [] } as never);
    await until(() => Boolean(rooms.get(code).submissions[ani.participant.id]), 'jawaban diterima');
    expect(rooms.get(code).snapshots[ani.participant.id]).toBeUndefined();

    const huge = { nodes: [{ id: 'x', data: { blob: 'x'.repeat(400 * 1024) } }], edges: [] };
    budi.hub.submitWork(code, fakeSubmission(budi.participant.id, 'Budi', 55), huge as never);
    await until(() => Boolean(rooms.get(code).submissions[budi.participant.id]), 'jawaban Budi diterima');
    expect(rooms.get(code).submissions[budi.participant.id].score).toBe(55);
    expect(rooms.get(code).snapshots[budi.participant.id]).toBeUndefined();

    cici.hub.submitWork(code, fakeSubmission(cici.participant.id, 'Cici', 60), SNAP as never);
    await until(() => Boolean(rooms.get(code).snapshots[cici.participant.id]), 'snapshot valid');
    teacher.hub.startExercises(code, [EX('ex-2')]);
    await until(() => rooms.get(code).round === 2, 'ronde baru');
    expect(rooms.get(code).snapshots).toEqual({});
    expect(rooms.get(code).snapshotBytes).toBe(0);
  });

  it('impor .opsub membawa topologi: snapshot lokal dipakai tanpa relay', async () => {
    const teacher = deviceWithSession();
    teacher.hub.setLockedRole('teacher');
    teacher.hub.createClass('Kelas Lokal', uniqueCode('SNP'), undefined, undefined, { local: true });
    teacher.hub.importSubmissions([{ submission: fakeSubmission('off-1', 'Eka', 60), topology: SNAP as never }]);
    expect((await teacher.hub.fetchSnapshot('APA', 'off-1'))?.nodes[0].id).toBe('pc-1');
    expect(await teacher.hub.fetchSnapshot('APA', 'tidak-ada')).toBeNull();
  });
});

describe('Hub: Kirim Jawaban hanya satu kali per ronde', () => {
  /** Siswa dengan fetch yang dapat dikendalikan untuk POST SUBMISSION_RECEIVED (gagal jaringan / lambat). */
  async function studentWithControlledSubmit(code: string, nickname: string, mode: { fail?: boolean; delayMs?: number }) {
    const local = new MemoryKV();
    const sessionKV = new MemoryKV();
    local.setItem(STORAGE_KEY_RELAY_URL, baseUrl);
    const controlledFetch: typeof fetch = async (input, init) => {
      if (typeof init?.body === 'string' && init.body.includes('"SUBMISSION_RECEIVED"')) {
        if (mode.fail) throw new TypeError('Failed to fetch');
        if (mode.delayMs) await new Promise((r) => setTimeout(r, mode.delayMs));
      }
      return globalThis.fetch(input, init);
    };
    const hub = new ClassroomHub({ localStorage: local, sessionStorage: sessionKV, fetch: controlledFetch });
    const events: ClassroomEvent[] = [];
    hub.subscribe((e) => events.push(e));
    hub.setLockedRole('student');
    const participant = hub.joinClass(code, nickname)!;
    await until(() => rooms.get(code)?.participants.some((x: { id: string }) => x.id === participant.id), `relay menerima ${nickname}`);
    await hub.syncWithServer(code);
    return { hub, events, participant };
  }

  it('kiriman kedua diabaikan di perangkat (false) dan jawaban pertama tetap di relay', async () => {
    const code = uniqueCode('ONCE');
    const teacher = device();
    await startClass(teacher, code);
    const ani = await joinStudent(code, 'Ani');
    expect(ani.hub.getMySubmission()).toBeNull();

    expect(ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 40))).toBe(true);
    await until(() => Boolean(rooms.get(code).submissions[ani.participant.id]), 'jawaban pertama');
    expect(ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 100))).toBe(false);
    await new Promise((r) => setTimeout(r, 200));
    expect(rooms.get(code).submissions[ani.participant.id].score).toBe(40);
    await ani.hub.syncWithServer(code);
    expect(ani.hub.getMySubmission()?.score).toBe(40);
  });

  it('ronde baru dari guru membuka kembali kesempatan kirim', async () => {
    const code = uniqueCode('ONCE');
    const teacher = device();
    await startClass(teacher, code);
    const ani = await joinStudent(code, 'Ani');
    ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 40));
    await until(() => Boolean(rooms.get(code).submissions[ani.participant.id]), 'jawaban ronde 1');
    await ani.hub.syncWithServer(code);

    teacher.hub.startExercises(code, [EX('ex-2')]);
    await until(() => rooms.get(code).round === 2, 'ronde 2');
    await ani.hub.syncWithServer(code);
    expect(ani.hub.getMySubmission()).toBeNull();
    expect(ani.events.some((e) => e.type === 'RELAY_REJECTED')).toBe(false); // bukan "jawaban hilang"

    expect(ani.hub.submitWork(code, { ...fakeSubmission(ani.participant.id, 'Ani', 90), exerciseId: 'ex-2' })).toBe(true);
    await until(() => rooms.get(code).submissions[ani.participant.id]?.score === 90, 'jawaban ronde 2');
  });

  it('kiriman yang ditolak relay (soal sudah diganti) dibatalkan sehingga siswa dapat mengirim lagi', async () => {
    const code = uniqueCode('ONCE');
    const teacher = device();
    await startClass(teacher, code);
    const ani = await joinStudent(code, 'Ani');
    teacher.hub.updateClassExercises(code, [EX('ex-baru')]);
    await until(() => rooms.get(code).activeExercises[0]?.id === 'ex-baru', 'soal diganti');

    expect(ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 70))).toBe(true); // masih soal lama
    await until(() => ani.events.some((e) => e.type === 'RELAY_REJECTED'), 'penolakan');
    expect(ani.hub.getMySubmission()).toBeNull();
    expect(ani.hub.submitWork(code, { ...fakeSubmission(ani.participant.id, 'Ani', 70), exerciseId: 'ex-baru' })).toBe(true);
    await until(() => Boolean(rooms.get(code).submissions[ani.participant.id]), 'kiriman kedua diterima');
  });

  it('kiriman gagal karena jaringan: sinkronisasi berikutnya memberi tahu siswa dan tombol kirim aktif lagi', async () => {
    const code = uniqueCode('ONCE');
    const teacher = device();
    await startClass(teacher, code);
    const mode = { fail: true };
    const ani = await studentWithControlledSubmit(code, 'Ani', mode);

    expect(ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 80))).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(rooms.get(code).submissions[ani.participant.id]).toBeUndefined();
    await ani.hub.syncWithServer(code); // relay terjangkau tetapi tidak memegang jawaban ini
    expect(ani.hub.getMySubmission()).toBeNull();
    await until(() => ani.events.some((e) => e.type === 'RELAY_REJECTED' && e.message.includes('belum diterima server')), 'pemberitahuan');

    mode.fail = false;
    expect(ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 80))).toBe(true);
    await until(() => rooms.get(code).submissions[ani.participant.id]?.score === 80, 'kiriman ulang diterima');
  });

  it('jawaban yang masih di perjalanan tidak dihapus oleh polling', async () => {
    const code = uniqueCode('ONCE');
    const teacher = device();
    await startClass(teacher, code);
    const ani = await studentWithControlledSubmit(code, 'Ani', { delayMs: 400 });

    expect(ani.hub.submitWork(code, fakeSubmission(ani.participant.id, 'Ani', 80))).toBe(true);
    await ani.hub.syncWithServer(code); // relay belum menerima POST
    expect(rooms.get(code).submissions[ani.participant.id]).toBeUndefined();
    expect(ani.hub.getMySubmission()?.score).toBe(80);
    expect(ani.events.some((e) => e.type === 'RELAY_REJECTED')).toBe(false);
    await until(() => Boolean(rooms.get(code).submissions[ani.participant.id]), 'POST tiba');
    await ani.hub.syncWithServer(code);
    expect(ani.hub.getMySubmission()?.score).toBe(80);
  });
});
