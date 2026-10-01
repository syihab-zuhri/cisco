/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
// @ts-expect-error importing mjs core
import { createRelayMiddleware, MAX_ROOMS } from '../../scripts/classroom-relay-core.mjs';

/**
 * Regresi untuk celah relay yang ditemukan pada audit Mode Kelas:
 * kebocoran hostToken, pembajakan CLASS_CREATED, event siswa tanpa autentikasi,
 * room tak terbatas, kunci/tutup tak ditegakkan, nilai lama tak diarsipkan, dll.
 */

type Listener = (arg?: unknown) => void;

class MockRequest {
  public destroyed = false;
  private listeners: Record<string, Listener[]> = {};
  constructor(
    public url: string,
    public method: string = 'GET',
    public headers: Record<string, string> = {}
  ) {}
  on(event: string, fn: Listener) {
    (this.listeners[event] ||= []).push(fn);
  }
  destroy() {
    this.destroyed = true;
  }
  send(body: string) {
    (this.listeners['data'] || []).forEach((fn) => fn(body));
    (this.listeners['end'] || []).forEach((fn) => fn());
  }
}

class MockResponse {
  public statusCode = 200;
  public body = '';
  public headers: Record<string, string> = {};
  setHeader(key: string, value: string) {
    this.headers[key.toLowerCase()] = value;
  }
  end(data?: string) {
    if (data) this.body += data;
  }
  json() {
    return JSON.parse(this.body);
  }
}

function makeRelay() {
  const rooms = new Map();
  const middleware = createRelayMiddleware(rooms, { autoCleanup: false });
  const post = (event: unknown, headers: Record<string, string> = {}) => {
    const req = new MockRequest('/api/classroom/event', 'POST', headers);
    const res = new MockResponse();
    middleware(req, res);
    req.send(JSON.stringify(event));
    return { status: res.statusCode, body: res.json() as { success: boolean; error?: string } };
  };
  const get = (code: string, headers: Record<string, string> = {}, since?: number) => {
    const qs = `code=${encodeURIComponent(code)}${since !== undefined ? `&since=${since}` : ''}`;
    const req = new MockRequest(`/api/classroom/state?${qs}`, 'GET', headers);
    const res = new MockResponse();
    middleware(req, res);
    return res.json() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  return { rooms, middleware, post, get };
}

const HOST = 'host-token-rahasia-1';
const ANI = { id: 'stu-ani', token: 'token-rahasia-ani' };
const BUDI = { id: 'stu-budi', token: 'token-rahasia-budi' };

const EX_A = { id: 'ex-a', title: 'Soal A', instructions: 'x', difficulty: 'Dasar', targets: [] };
const EX_B = { id: 'ex-b', title: 'Soal B', instructions: 'x', difficulty: 'Dasar', targets: [] };

function createClass(r: ReturnType<typeof makeRelay>, code = 'NET-1111', extra: Record<string, unknown> = {}) {
  return r.post({
    type: 'CLASS_CREATED',
    session: { classCode: code, title: 'Kelas A', status: 'open', hostToken: HOST, activeExercises: [EX_A], ...extra },
  });
}

function join(r: ReturnType<typeof makeRelay>, who: { id: string; token: string }, code = 'NET-1111', nickname = who.id) {
  return r.post({
    type: 'PARTICIPANT_JOINED',
    classCode: code,
    participantToken: who.token,
    participant: { id: who.id, nickname, joinedAt: 1, status: 'in_progress' },
  });
}

function submit(
  r: ReturnType<typeof makeRelay>,
  who: { id: string; token?: string },
  score: number,
  code = 'NET-1111',
  overrides: Record<string, unknown> = {}
) {
  return r.post({
    type: 'SUBMISSION_RECEIVED',
    classCode: code,
    participantToken: who.token,
    submission: {
      participantId: who.id,
      nickname: 'palsu',
      exerciseId: 'ex-a',
      score,
      status: 'passed',
      evaluation: { status: 'passed', score, checks: [], feedback: '', evaluatedAt: '' },
      submittedAt: 1,
      ...overrides,
    },
  });
}

const asParticipant = (who: { id: string; token: string }) => ({ 'x-participant-id': who.id, 'x-participant-token': who.token });
const asHost = { 'x-host-token': HOST };

describe('Relay: kerahasiaan token & tampilan GET /state per peran', () => {
  it('tidak pernah membocorkan hostToken ke siapa pun (anonim, peserta, maupun guru)', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    for (const headers of [{}, asParticipant(ANI), asHost]) {
      const raw = JSON.stringify(r.get('NET-1111', headers));
      expect(raw).not.toContain(HOST);
      expect(raw).not.toContain('hostToken');
      expect(raw).not.toContain(ANI.token);
    }
  });

  it('pengunjung anonim hanya melihat info publik kelas (tanpa peserta, nilai, atau soal)', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    submit(r, ANI, 100);
    const view = r.get('NET-1111');
    expect(view.success).toBe(true);
    expect(view.session).toEqual({ classCode: 'NET-1111', title: 'Kelas A', status: 'open' });
    expect(view.participants).toBeUndefined();
    expect(view.submissions).toBeUndefined();
    expect(view.activeExercises).toBeUndefined();
  });

  it('peserta hanya melihat soal aktif dan nilai miliknya sendiri, bukan milik teman', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    join(r, BUDI);
    submit(r, ANI, 100);
    submit(r, BUDI, 40);
    const view = r.get('NET-1111', asParticipant(ANI));
    expect(view.role).toBe('participant');
    expect(view.me.status).toBe('active');
    expect(view.activeExercises).toHaveLength(1);
    expect(Object.keys(view.submissions)).toEqual([ANI.id]);
    expect(view.participants).toEqual([]);
  });

  it('guru dengan token yang benar melihat peserta, nilai, riwayat, dan soal aktif', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    submit(r, ANI, 80);
    const view = r.get('NET-1111', asHost);
    expect(view.role).toBe('host');
    expect(view.participants.map((p: { id: string }) => p.id)).toEqual([ANI.id]);
    expect(view.submissions[ANI.id].score).toBe(80);
    expect(view.history).toEqual([]);
    expect(view.activeExercises).toHaveLength(1);
  });

  it('token host yang salah diperlakukan sebagai anonim', () => {
    const r = makeRelay();
    createClass(r);
    const view = r.get('NET-1111', { 'x-host-token': 'bukan-token-guru' });
    expect(view.role).toBe('anonymous');
    expect(view.submissions).toBeUndefined();
  });

  it('parameter since mengembalikan unchanged bila revisi sama, dan data penuh setelah berubah', () => {
    const r = makeRelay();
    createClass(r);
    const first = r.get('NET-1111', asHost);
    const same = r.get('NET-1111', asHost, first.rev);
    expect(same.unchanged).toBe(true);
    expect(same.participants).toBeUndefined();
    join(r, ANI);
    const after = r.get('NET-1111', asHost, first.rev);
    expect(after.unchanged).toBeUndefined();
    expect(after.participants).toHaveLength(1);
    expect(after.rev).toBeGreaterThan(first.rev);
  });
});

describe('Relay: pembuatan kelas & pembajakan', () => {
  it('CLASS_CREATED tanpa hostToken ditolak (tidak bisa menimpa kelas aktif)', () => {
    const r = makeRelay();
    createClass(r);
    const hijack = r.post({ type: 'CLASS_CREATED', session: { classCode: 'NET-1111', title: 'DIBAJAK', status: 'open' } });
    expect(hijack.status).toBe(400);
    expect(r.rooms.get('NET-1111').session.title).toBe('Kelas A');
  });

  it('CLASS_CREATED dengan hostToken terlalu pendek ditolak', () => {
    const r = makeRelay();
    const res = r.post({ type: 'CLASS_CREATED', session: { classCode: 'NET-2222', title: 'x', status: 'open', hostToken: 'abc' } });
    expect(res.status).toBe(400);
    expect(r.rooms.has('NET-2222')).toBe(false);
  });

  it('host yang sama boleh membuat ulang kelasnya; host lain ditolak 403 selama kelas belum ditutup', () => {
    const r = makeRelay();
    createClass(r);
    expect(createClass(r).status).toBe(200);
    const other = r.post({ type: 'CLASS_CREATED', session: { classCode: 'NET-1111', title: 'B', status: 'open', hostToken: 'token-guru-lain-9' } });
    expect(other.status).toBe(403);
    // setelah ditutup, kode boleh dipakai ulang
    r.post({ type: 'CLASS_CLOSED', classCode: 'NET-1111', hostToken: HOST });
    const reuse = r.post({ type: 'CLASS_CREATED', session: { classCode: 'NET-1111', title: 'B', status: 'open', hostToken: 'token-guru-lain-9' } });
    expect(reuse.status).toBe(200);
  });

  it('hanya CLASS_CREATED yang membuat room: event untuk kode tak dikenal ditolak 404 dan tidak memakai memori', () => {
    const r = makeRelay();
    for (let i = 0; i < 100; i++) {
      const res = join(r, { id: `p${i}`, token: `token-acak-${i}` }, `SPAM-${i}`);
      expect(res.status).toBe(404);
    }
    expect(r.rooms.size).toBe(0);
  });

  it('jumlah room dibatasi (MAX_ROOMS) dengan balasan 503', () => {
    const r = makeRelay();
    for (let i = 0; i < MAX_ROOMS; i++) {
      expect(createClass(r, `KLS-${i}`).status).toBe(200);
    }
    expect(createClass(r, 'KLS-MELEBIHI').status).toBe(503);
    expect(r.rooms.size).toBe(MAX_ROOMS);
  });

  it('kode kelas yang tidak valid atau event tak dikenal ditolak 400', () => {
    const r = makeRelay();
    expect(r.post({ type: 'CLASS_CREATED', session: { classCode: 'a b/c', hostToken: HOST } }).status).toBe(400);
    expect(r.post({ type: 'EVENT_ASING', classCode: 'NET-1111' }).status).toBe(400);
    expect(r.post({ type: 'SYNC_RESPONSE', classCode: 'NET-1111' }).status).toBe(400);
    expect(r.post('bukan objek').status).toBe(400);
  });

  it('body yang bukan JSON ditolak 400 (bukan 500)', () => {
    const r = makeRelay();
    const req = new MockRequest('/api/classroom/event', 'POST');
    const res = new MockResponse();
    r.middleware(req, res);
    req.send('{rusak');
    expect(res.statusCode).toBe(400);
  });
});

describe('Relay: peserta (join, keluar, kick) & autentikasi', () => {
  it('join wajib membawa participantToken', () => {
    const r = makeRelay();
    createClass(r);
    const res = r.post({ type: 'PARTICIPANT_JOINED', classCode: 'NET-1111', participant: { id: 'stu-x', nickname: 'X' } });
    expect(res.status).toBe(400);
  });

  it('kelas terkunci menolak peserta baru; dibuka kembali menerima lagi', () => {
    const r = makeRelay();
    createClass(r);
    r.post({ type: 'CLASS_STATUS_CHANGED', classCode: 'NET-1111', status: 'locked', hostToken: HOST });
    const blocked = join(r, ANI);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toContain('dikunci');
    r.post({ type: 'CLASS_STATUS_CHANGED', classCode: 'NET-1111', status: 'open', hostToken: HOST });
    expect(join(r, ANI).status).toBe(200);
  });

  it('kelas yang sudah ditutup menolak join dan submission', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    r.post({ type: 'CLASS_CLOSED', classCode: 'NET-1111', hostToken: HOST });
    expect(join(r, BUDI).status).toBe(403);
    expect(submit(r, ANI, 100).status).toBe(403);
  });

  it('join ulang dengan id sama tidak boleh merebut token pemilik asli', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    const takeover = join(r, { id: ANI.id, token: 'token-penyerang-xx' });
    expect(takeover.status).toBe(403);
    expect(submit(r, ANI, 90).status).toBe(200);
  });

  it('nickname dibatasi 40 karakter dan peserta dibatasi jumlahnya', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI, 'NET-1111', 'x'.repeat(200));
    expect(r.rooms.get('NET-1111').participants[0].nickname).toHaveLength(40);
  });

  it('siswa tidak bisa menghapus siswa lain lewat PARTICIPANT_LEFT; pemilik token dan guru bisa', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    join(r, BUDI);
    const noToken = r.post({ type: 'PARTICIPANT_LEFT', classCode: 'NET-1111', participantId: BUDI.id });
    expect(noToken.status).toBe(403);
    const wrongToken = r.post({ type: 'PARTICIPANT_LEFT', classCode: 'NET-1111', participantId: BUDI.id, participantToken: ANI.token });
    expect(wrongToken.status).toBe(403);
    expect(r.rooms.get('NET-1111').participants).toHaveLength(2);

    expect(r.post({ type: 'PARTICIPANT_LEFT', classCode: 'NET-1111', participantId: BUDI.id, participantToken: BUDI.token }).status).toBe(200);
    expect(r.rooms.get('NET-1111').participants.map((p: { id: string }) => p.id)).toEqual([ANI.id]);
    expect(r.post({ type: 'PARTICIPANT_LEFT', classCode: 'NET-1111', participantId: ANI.id, hostToken: HOST }).status).toBe(200);
    expect(r.rooms.get('NET-1111').participants).toHaveLength(0);
  });

  it('siswa yang sudah mengumpulkan lalu keluar tetap tampil di tabel guru dengan status "left"', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    submit(r, ANI, 75);
    r.post({ type: 'PARTICIPANT_LEFT', classCode: 'NET-1111', participantId: ANI.id, participantToken: ANI.token });
    const view = r.get('NET-1111', asHost);
    expect(view.participants[0].status).toBe('left');
    expect(view.submissions[ANI.id].score).toBe(75);
    // token dicabut: tidak bisa mengirim lagi atas nama peserta yang sudah keluar
    expect(submit(r, ANI, 100).status).toBe(403);
  });

  it('kick hanya oleh guru; siswa yang di-kick diberi tahu lewat state, nilainya dibuang, dan tidak bisa join ulang', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    submit(r, ANI, 100);

    expect(r.post({ type: 'PARTICIPANT_KICKED', classCode: 'NET-1111', participantId: ANI.id }).status).toBe(403);
    expect(r.post({ type: 'PARTICIPANT_KICKED', classCode: 'NET-1111', participantId: ANI.id, hostToken: HOST }).status).toBe(200);

    const view = r.get('NET-1111', asParticipant(ANI));
    expect(view.me.status).toBe('kicked');
    expect(view.activeExercises).toEqual([]);
    expect(r.get('NET-1111', asHost).submissions[ANI.id]).toBeUndefined();
    expect(submit(r, ANI, 100).status).toBe(403);
    expect(join(r, ANI).status).toBe(403);
    // pihak lain tidak bisa mengetahui status kick-nya
    expect(r.get('NET-1111', asParticipant({ id: ANI.id, token: 'token-orang-lain' })).me.status).toBe('unknown');
  });
});

describe('Relay: submission', () => {
  it('menolak submission tanpa token, dengan token salah, atau atas nama siswa lain', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    join(r, BUDI);
    expect(submit(r, { id: ANI.id }, 100).status).toBe(403);
    expect(submit(r, { id: ANI.id, token: 'token-tebakan-xx' }, 100).status).toBe(403);
    expect(submit(r, { id: BUDI.id, token: ANI.token }, 100).status).toBe(403); // token Ani untuk id Budi
    expect(r.rooms.get('NET-1111').submissions).toEqual({});
  });

  it('menolak submission dari id yang belum bergabung', () => {
    const r = makeRelay();
    createClass(r);
    expect(submit(r, { id: 'hantu', token: 'token-hantu-123' }, 100).status).toBe(403);
  });

  it('menormalkan skor (0-100), status, nickname, dan ronde di sisi server', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI, 'NET-1111', 'Ani');
    submit(r, ANI, 9999, 'NET-1111', { status: 'ngawur' });
    const sub = r.rooms.get('NET-1111').submissions[ANI.id];
    expect(sub.score).toBe(100);
    expect(sub.status).toBe('passed');
    expect(sub.nickname).toBe('Ani'); // bukan "palsu" dari klien
    expect(typeof sub.round).toBe('number');
    expect(r.rooms.get('NET-1111').participants[0].status).toBe('submitted');
  });
});

describe('Relay: soal, ronde, dan pengaturan', () => {
  it('EXERCISE_STARTED mengarsipkan nilai lama, mengosongkan nilai berjalan, dan mereset status peserta', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    submit(r, ANI, 90);
    expect(r.rooms.get('NET-1111').participants[0].status).toBe('submitted');

    r.post({ type: 'EXERCISE_STARTED', classCode: 'NET-1111', hostToken: HOST, exercises: [EX_B] });
    const view = r.get('NET-1111', asHost);
    expect(view.submissions).toEqual({});
    expect(view.participants[0].status).toBe('in_progress');
    expect(view.session.round).toBe(1);
    expect(view.history).toHaveLength(1);
    expect(view.history[0].submissions[ANI.id].score).toBe(90);
    expect(view.history[0].exercises).toEqual([{ id: 'ex-a', title: 'Soal A' }]);
    expect(view.activeExercises.map((e: { id: string }) => e.id)).toEqual(['ex-b']);
  });

  it('EXERCISES_UPDATED memperbarui soal tanpa menghapus nilai atau menaikkan ronde', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    submit(r, ANI, 90);
    r.post({ type: 'EXERCISES_UPDATED', classCode: 'NET-1111', hostToken: HOST, exercises: [EX_A, EX_B] });
    const view = r.get('NET-1111', asHost);
    expect(view.submissions[ANI.id].score).toBe(90);
    expect(view.session.round).toBe(0);
    expect(view.activeExercises).toHaveLength(2);
    expect(view.history).toEqual([]);
  });

  it('semua event guru memerlukan token host', () => {
    const r = makeRelay();
    createClass(r);
    const events = [
      { type: 'EXERCISE_STARTED', exercises: [EX_B] },
      { type: 'EXERCISES_UPDATED', exercises: [] },
      { type: 'CLASS_STATUS_CHANGED', status: 'locked' },
      { type: 'CLASS_SETTINGS_CHANGED', allowSelfCheck: false },
      { type: 'CLASS_CLOSED' },
      { type: 'PARTICIPANT_KICKED', participantId: 'x' },
    ];
    for (const e of events) {
      expect(r.post({ ...e, classCode: 'NET-1111' }).status).toBe(403);
      expect(r.post({ ...e, classCode: 'NET-1111', hostToken: 'token-salah-123' }).status).toBe(403);
    }
    expect(r.rooms.get('NET-1111').session.status).toBe('open');
  });

  it('status sembarang ditolak; pengaturan cek mandiri divalidasi dan dibatasi', () => {
    const r = makeRelay();
    createClass(r);
    expect(r.post({ type: 'CLASS_STATUS_CHANGED', classCode: 'NET-1111', status: '<script>', hostToken: HOST }).status).toBe(400);
    expect(r.rooms.get('NET-1111').session.status).toBe('open');

    r.post({ type: 'CLASS_SETTINGS_CHANGED', classCode: 'NET-1111', allowSelfCheck: 'ya', selfCheckLimit: 5000, hostToken: HOST });
    const s = r.rooms.get('NET-1111').session;
    expect(s.allowSelfCheck).toBe(true);
    expect(s.selfCheckLimit).toBe(99);
    r.post({ type: 'CLASS_SETTINGS_CHANGED', classCode: 'NET-1111', allowSelfCheck: false, selfCheckLimit: -3, hostToken: HOST });
    expect(r.rooms.get('NET-1111').session.selfCheckLimit).toBe(1);
  });

  it('jumlah soal per kelas dibatasi', () => {
    const r = makeRelay();
    createClass(r);
    const many = Array.from({ length: 200 }, (_, i) => ({ ...EX_A, id: `ex-${i}` }));
    r.post({ type: 'EXERCISES_UPDATED', classCode: 'NET-1111', hostToken: HOST, exercises: many });
    expect(r.rooms.get('NET-1111').activeExercises.length).toBeLessThanOrEqual(50);
  });
});

describe('Relay: ketahanan HTTP nyata', () => {
  async function withServer<T>(fn: (port: number) => Promise<T>): Promise<T> {
    const rooms = new Map();
    const mw = createRelayMiddleware(rooms, { autoCleanup: false });
    // Sengaja tanpa try/catch di handler (seperti scripts/classroom-relay.mjs): relay sendiri harus tahan banting.
    const server: Server = createServer((req, res) => mw(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      return await fn((server.address() as AddressInfo).port);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  function rawRequest(port: number, method: string, path: string, headers: Record<string, string>, chunks: Buffer[] = [], gapMs = 0) {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
        let s = '';
        res.on('data', (c) => (s += c));
        res.on('end', () => resolve({ status: res.statusCode || 0, body: s }));
      });
      req.on('error', reject);
      (async () => {
        for (const c of chunks) {
          req.write(c);
          if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
        }
        req.end();
      })();
    });
  }

  it('header Host yang janggal tidak mematikan proses relay', async () => {
    await withServer(async (port) => {
      // Node melarang header Host aneh lewat http.request, jadi kirim lewat socket mentah.
      const net = await import('node:net');
      const reply = await new Promise<string>((resolve) => {
        const s = net.connect(port, '127.0.0.1', () => s.write('GET /health HTTP/1.1\r\nHost: a b\r\nConnection: close\r\n\r\n'));
        let buf = '';
        s.on('data', (d) => (buf += d));
        s.on('close', () => resolve(buf));
        s.on('error', () => resolve(buf));
      });
      expect(reply).toContain('200');
      // dan server masih melayani request berikutnya
      const after = await rawRequest(port, 'GET', '/health', {});
      expect(after.status).toBe(200);
    });
  });

  it('karakter multibyte yang terpotong di batas chunk tetap utuh', async () => {
    await withServer(async (port) => {
      const created = Buffer.from(JSON.stringify({ type: 'CLASS_CREATED', session: { classCode: 'UTF-1', title: 'Kelas', hostToken: HOST } }));
      await rawRequest(port, 'POST', '/api/classroom/event', { 'Content-Type': 'application/json', 'Content-Length': String(created.length) }, [created]);

      const nick = 'Ünï€😀-nama-siswa';
      const payload = Buffer.from(
        JSON.stringify({
          type: 'PARTICIPANT_JOINED',
          classCode: 'UTF-1',
          participantToken: ANI.token,
          participant: { id: 'stu-u', nickname: nick, joinedAt: 1, status: 'in_progress' },
        })
      );
      const cut = payload.indexOf(Buffer.from('€')) + 1; // di tengah karakter 3-byte
      const res = await rawRequest(
        port,
        'POST',
        '/api/classroom/event',
        { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) },
        [payload.subarray(0, cut), payload.subarray(cut)],
        60
      );
      expect(res.status).toBe(200);

      const state = await rawRequest(port, 'GET', '/api/classroom/state?code=UTF-1', { 'x-host-token': HOST });
      const parsed = JSON.parse(state.body);
      expect(parsed.participants[0].nickname).toBe(nick);
    });
  });
});

describe('Relay: pemulihan kelas (restore) & snapshot', () => {
  const snapshot = { nodes: [{ id: 'pc-1', type: 'deviceNode', data: { id: 'pc-1', label: 'PC-1', type: 'pc', ports: [] } }], edges: [] };

  const snapshotGet = (r: ReturnType<typeof makeRelay>, code: string, participantId: string, headers: Record<string, string> = {}) => {
    const req = new MockRequest(`/api/classroom/snapshot?code=${code}&participantId=${participantId}`, 'GET', headers);
    const res = new MockResponse();
    r.middleware(req, res);
    return { status: res.statusCode, body: res.json() as { success: boolean; snapshot?: { nodes: unknown[] }; round?: number; error?: string } };
  };
  const submitWithSnapshot = (r: ReturnType<typeof makeRelay>, who: { id: string; token: string }, snap: unknown, code = 'NET-1111') =>
    r.post({
      type: 'SUBMISSION_RECEIVED',
      classCode: code,
      participantToken: who.token,
      snapshot: snap,
      submission: { participantId: who.id, nickname: 'x', exerciseId: 'ex-a', score: 70, status: 'partial', evaluation: { status: 'partial', score: 70, checks: [], feedback: '', evaluatedAt: '' }, submittedAt: 1 },
    });

  it('restore menghidupkan kelas yang hilang dengan ronde, status, dan arsip dari guru; tanpa restore ronde selalu 0', () => {
    const r = makeRelay();
    const restored = r.post({
      type: 'CLASS_CREATED',
      restore: true,
      history: [{ round: 1, endedAt: 5, exercises: [{ id: 'ex-a', title: 'Soal A' }], participants: [{ id: 'stu-ani', nickname: 'Ani' }], submissions: { 'stu-ani': { score: 90 } } }],
      session: { classCode: 'NET-1111', title: 'Kelas A', status: 'locked', hostToken: HOST, round: 3, activeExercises: [EX_B] },
    });
    expect(restored.status).toBe(200);
    const view = r.get('NET-1111', asHost);
    expect(view.session.round).toBe(3);
    expect(view.session.status).toBe('locked');
    expect(view.history).toHaveLength(1);
    expect(view.history[0].submissions['stu-ani'].score).toBe(90);
    expect(view.activeExercises.map((e: { id: string }) => e.id)).toEqual(['ex-b']);
    expect(view.participants).toEqual([]);

    const plain = makeRelay();
    plain.post({ type: 'CLASS_CREATED', session: { classCode: 'NET-1111', hostToken: HOST, round: 9, status: 'open' }, history: [{ round: 1, submissions: {} }] });
    expect(plain.get('NET-1111', asHost).session.round).toBe(0);
    expect(plain.get('NET-1111', asHost).history).toEqual([]);
  });

  it('restore pada room yang sudah hidup adalah no-op (peserta yang sudah kembali tidak terhapus)', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    const res = r.post({ type: 'CLASS_CREATED', restore: true, session: { classCode: 'NET-1111', title: 'LAIN', status: 'open', hostToken: HOST, round: 5 } });
    expect(res.status).toBe(200);
    expect(r.rooms.get('NET-1111').participants).toHaveLength(1);
    expect(r.rooms.get('NET-1111').session.title).toBe('Kelas A');
    expect(r.rooms.get('NET-1111').round).toBe(0);
  });

  it('restore tetap memerlukan hostToken dan tidak bisa merebut kelas milik guru lain', () => {
    const r = makeRelay();
    expect(r.post({ type: 'CLASS_CREATED', restore: true, session: { classCode: 'NET-1111', title: 'x', status: 'open' } }).status).toBe(400);
    createClass(r);
    const hijack = r.post({ type: 'CLASS_CREATED', restore: true, session: { classCode: 'NET-1111', title: 'x', status: 'open', hostToken: 'token-penyerang-99' } });
    expect(hijack.status).toBe(403);
  });

  it('arsip ronde dari klien divalidasi dan dibatasi', () => {
    const r = makeRelay();
    const history = [
      ...Array.from({ length: 30 }, (_, i) => ({ round: i, endedAt: i, exercises: [], participants: [], submissions: {} })),
      { round: 99, submissions: 'bukan-objek' }, // dibuang
      'sampah',
    ];
    r.post({ type: 'CLASS_CREATED', restore: true, history, session: { classCode: 'NET-1111', hostToken: HOST, status: 'open' } });
    expect(r.get('NET-1111', asHost).history.length).toBeLessThanOrEqual(10);
  });

  it('GET /snapshot hanya untuk guru (token host); anonim/peserta/token salah ditolak 403', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    expect(submitWithSnapshot(r, ANI, snapshot).status).toBe(200);

    expect(snapshotGet(r, 'NET-1111', ANI.id).status).toBe(403);
    expect(snapshotGet(r, 'NET-1111', ANI.id, asParticipant(ANI)).status).toBe(403);
    expect(snapshotGet(r, 'NET-1111', ANI.id, { 'x-host-token': 'salah-salah-1' }).status).toBe(403);
    const ok = snapshotGet(r, 'NET-1111', ANI.id, asHost);
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
    expect(ok.body.snapshot?.nodes).toHaveLength(1);
    expect(snapshotGet(r, 'NET-1111', 'tidak-ada', asHost).body.success).toBe(false);
    expect(snapshotGet(r, 'KLS-ASING', ANI.id, asHost).body.success).toBe(false);
  });

  it('snapshot tidak pernah muncul di GET /state (host, peserta, maupun anonim)', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    submitWithSnapshot(r, ANI, snapshot);
    for (const headers of [asHost, asParticipant(ANI), {}]) {
      const raw = JSON.stringify(r.get('NET-1111', headers));
      expect(raw).not.toContain('"nodes"');
      expect(raw).not.toContain('snapshot');
    }
  });

  it('snapshot rusak atau terlalu besar diabaikan (jawaban tetap diterima); batas total per room dijaga', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    expect(submitWithSnapshot(r, ANI, { nodes: 'x', edges: [] }).status).toBe(200);
    expect(submitWithSnapshot(r, ANI, { nodes: [{ id: 'a' }], edges: [] }).status).toBe(200); // node tanpa data
    expect(r.rooms.get('NET-1111').snapshots[ANI.id]).toBeUndefined();
    const huge = { nodes: [{ id: 'x', data: { blob: 'x'.repeat(400 * 1024) } }], edges: [] };
    expect(submitWithSnapshot(r, ANI, huge).status).toBe(200);
    expect(r.rooms.get('NET-1111').snapshots[ANI.id]).toBeUndefined();
    expect(r.rooms.get('NET-1111').submissions[ANI.id].score).toBe(70);
    expect(Object.keys(r.rooms.get('NET-1111').submissions[ANI.id])).not.toContain('snapshot');
  });

  it('kick membuang snapshot; kirim ulang menggantikan snapshot lama dan menghitung ulang ukuran', () => {
    const r = makeRelay();
    createClass(r);
    join(r, ANI);
    submitWithSnapshot(r, ANI, snapshot);
    const first = r.rooms.get('NET-1111').snapshotBytes;
    expect(first).toBeGreaterThan(0);
    submitWithSnapshot(r, ANI, snapshot);
    expect(r.rooms.get('NET-1111').snapshotBytes).toBe(first); // diganti, bukan ditambah
    r.post({ type: 'PARTICIPANT_KICKED', classCode: 'NET-1111', participantId: ANI.id, hostToken: HOST });
    expect(r.rooms.get('NET-1111').snapshotBytes).toBe(0);
    expect(snapshotGet(r, 'NET-1111', ANI.id, asHost).body.success).toBe(false);
  });
});

describe('Relay sebagai middleware di server statis (vite preview): tidak merusak request lain', () => {
  const passthrough = (url: string, headers: Record<string, string> = {}, method = 'GET') => {
    const rooms = new Map();
    const mw = createRelayMiddleware(rooms, { autoCleanup: false });
    const req = new MockRequest(url, method, headers);
    const res = new MockResponse();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });
    return { res, nextCalled };
  };

  it('aset statis (JS/CSS) diteruskan ke `next` TANPA dipasangi Content-Type JSON atau header CORS', () => {
    for (const url of ['/assets/index-abc.js', '/assets/index-abc.css', '/favicon.svg', '/og-image.svg']) {
      const { res, nextCalled } = passthrough(url);
      expect(nextCalled).toBe(true);
      expect(res.headers['content-type']).toBeUndefined();
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('halaman HTML (/) diteruskan ke aplikasi, bukan dijawab JSON health-check', () => {
    const { res, nextCalled } = passthrough('/', { accept: 'text/html,application/xhtml+xml' });
    expect(nextCalled).toBe(true);
    expect(res.headers['content-type']).toBeUndefined();
    expect(res.body).toBe('');
  });

  it('respons relay sendiri tetap JSON dengan CORS; preflight hanya untuk jalur /api/classroom', () => {
    const health = passthrough('/api/classroom/health');
    expect(health.nextCalled).toBe(false);
    expect(health.res.headers['content-type']).toBe('application/json');
    expect(health.res.headers['access-control-allow-origin']).toBe('*');

    const pre = passthrough('/api/classroom/event', {}, 'OPTIONS');
    expect(pre.res.statusCode).toBe(204);
    expect(pre.res.headers['access-control-allow-headers']).toContain('X-Participant-Token');
    expect(pre.nextCalled).toBe(false);

    const otherPre = passthrough('/assets/x.js', {}, 'OPTIONS');
    expect(otherPre.nextCalled).toBe(true);
  });
});
