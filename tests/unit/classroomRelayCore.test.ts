import { describe, it, expect } from 'vitest';
// @ts-expect-error importing mjs core
import { createRelayMiddleware, cleanupStaleRooms } from '../../scripts/classroom-relay-core.mjs';
import { EventEmitter } from 'node:events';

class MockRequest extends EventEmitter {
  public url: string;
  public method: string;
  public headers: Record<string, string>;
  public destroyed: boolean = false;

  constructor(url: string, method: string = 'GET', headers: Record<string, string> = {}) {
    super();
    this.url = url;
    this.method = method;
    this.headers = headers;
  }

  destroy() {
    this.destroyed = true;
  }

  sendData(chunk: string | Buffer) {
    this.emit('data', chunk);
  }

  finish() {
    this.emit('end');
  }
}

class MockResponse {
  public statusCode: number = 200;
  public headers: Record<string, string> = {};
  public body: string = '';
  public ended: boolean = false;

  setHeader(key: string, val: string) {
    this.headers[key] = val;
  }

  end(data?: string) {
    if (data) this.body += data;
    this.ended = true;
  }
}

describe('Classroom Relay Core Security & Hardening', () => {
  it('membersihkan room yang sudah expired atau closed lama (cleanupStaleRooms)', () => {
    const rooms = new Map();
    const now = Date.now();

    // Active room recent
    rooms.set('ACTIVE', {
      session: { status: 'open' },
      updatedAt: now - 1000,
    });

    // Inactive room > 24 hours
    rooms.set('OLD_INACTIVE', {
      session: { status: 'open' },
      updatedAt: now - (25 * 60 * 60 * 1000),
    });

    // Closed room > 2 hours
    rooms.set('OLD_CLOSED', {
      session: { status: 'closed' },
      updatedAt: now - (3 * 60 * 60 * 1000),
    });

    // Closed room recent < 2 hours
    rooms.set('RECENT_CLOSED', {
      session: { status: 'closed' },
      updatedAt: now - (30 * 60 * 1000),
    });

    const purged = cleanupStaleRooms(rooms);
    expect(purged).toBe(2);
    expect(rooms.has('ACTIVE')).toBe(true);
    expect(rooms.has('RECENT_CLOSED')).toBe(true);
    expect(rooms.has('OLD_INACTIVE')).toBe(false);
    expect(rooms.has('OLD_CLOSED')).toBe(false);
  });

  it('menolak payload POST yang melebihi batas ukuran (DoS protection: 413 Payload Too Large)', async () => {
    const rooms = new Map();
    const middleware = createRelayMiddleware(rooms, { maxBodyBytes: 1024, autoCleanup: false });

    const req = new MockRequest('/api/classroom/event', 'POST');
    const res = new MockResponse();

    middleware(req, res);

    const oversizedChunk = Buffer.alloc(2048, 'a');
    req.sendData(oversizedChunk);
    req.finish();

    expect(res.statusCode).toBe(413);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Payload Too Large');
    expect(req.destroyed).toBe(true);
  });

  it('mengizinkan pembuatan kelas dan menyimpan session dengan hostToken', async () => {
    const rooms = new Map();
    const middleware = createRelayMiddleware(rooms, { autoCleanup: false });

    const req = new MockRequest('/api/classroom/event', 'POST');
    const res = new MockResponse();

    middleware(req, res);

    const event = {
      type: 'CLASS_CREATED',
      classCode: 'NET-1001',
      session: {
        classCode: 'NET-1001',
        title: 'Kelas Jaringan Dasar',
        status: 'open',
        hostToken: 'secret-token-123',
        activeExercises: [],
      },
    };

    req.sendData(JSON.stringify(event));
    req.finish();

    expect(res.statusCode).toBe(200);
    expect(rooms.has('NET-1001')).toBe(true);
    const room = rooms.get('NET-1001');
    expect(room.session.hostToken).toBe('secret-token-123');
  });

  it('menolak pembajakan kelas yang sedang aktif oleh host lain (403 Forbidden)', async () => {
    const rooms = new Map();
    const middleware = createRelayMiddleware(rooms, { autoCleanup: false });

    // Host 1 membuat kelas
    rooms.set('NET-9999', {
      session: {
        classCode: 'NET-9999',
        status: 'open',
        hostToken: 'real-host-token',
      },
      participants: [],
      submissions: {},
      updatedAt: Date.now(),
    });

    const req = new MockRequest('/api/classroom/event', 'POST');
    const res = new MockResponse();

    middleware(req, res);

    const takeoverEvent = {
      type: 'CLASS_CREATED',
      classCode: 'NET-9999',
      session: {
        classCode: 'NET-9999',
        status: 'open',
        hostToken: 'attacker-token',
      },
    };

    req.sendData(JSON.stringify(takeoverEvent));
    req.finish();

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toContain('dimiliki oleh host lain');
  });

  it('menolak event sensitif guru (CLASS_CLOSED, EXERCISES_UPDATED) jika hostToken salah atau kosong (403 Forbidden)', async () => {
    const rooms = new Map();
    const middleware = createRelayMiddleware(rooms, { autoCleanup: false });

    rooms.set('NET-5555', {
      session: {
        classCode: 'NET-5555',
        status: 'open',
        hostToken: 'valid-host-token',
      },
      participants: [],
      submissions: {},
      updatedAt: Date.now(),
    });

    // Percobaan menutup kelas tanpa token
    const req1 = new MockRequest('/api/classroom/event', 'POST');
    const res1 = new MockResponse();
    middleware(req1, res1);

    req1.sendData(JSON.stringify({ type: 'CLASS_CLOSED', classCode: 'NET-5555' }));
    req1.finish();

    expect(res1.statusCode).toBe(403);
    expect(JSON.parse(res1.body).error).toContain('memerlukan token host');

    // Percobaan memperbarui soal dengan token palsu
    const req2 = new MockRequest('/api/classroom/event', 'POST');
    const res2 = new MockResponse();
    middleware(req2, res2);

    req2.sendData(JSON.stringify({
      type: 'EXERCISES_UPDATED',
      classCode: 'NET-5555',
      exercises: [],
      hostToken: 'wrong-token',
    }));
    req2.finish();

    expect(res2.statusCode).toBe(403);
    expect(JSON.parse(res2.body).error).toContain('memerlukan token host');
  });

  it('mengizinkan event sensitif jika hostToken valid dan mengizinkan event murid tanpa token', async () => {
    const rooms = new Map();
    const middleware = createRelayMiddleware(rooms, { autoCleanup: false });

    rooms.set('NET-7777', {
      session: {
        classCode: 'NET-7777',
        status: 'open',
        hostToken: 'guru-super-token',
      },
      participants: [],
      submissions: {},
      updatedAt: Date.now(),
    });

    // Guru dengan token valid menutup kelas
    const reqHost = new MockRequest('/api/classroom/event', 'POST');
    const resHost = new MockResponse();
    middleware(reqHost, resHost);

    reqHost.sendData(JSON.stringify({
      type: 'CLASS_CLOSED',
      classCode: 'NET-7777',
      hostToken: 'guru-super-token',
    }));
    reqHost.finish();

    expect(resHost.statusCode).toBe(200);
    expect(rooms.get('NET-7777').session.status).toBe('closed');

    // Murid bergabung (PARTICIPANT_JOINED) tidak memerlukan hostToken
    const reqStudent = new MockRequest('/api/classroom/event', 'POST');
    const resStudent = new MockResponse();
    middleware(reqStudent, resStudent);

    reqStudent.sendData(JSON.stringify({
      type: 'PARTICIPANT_JOINED',
      classCode: 'NET-7777',
      participant: {
        id: 'stu-1',
        nickname: 'Ahmad',
        joinedAt: Date.now(),
        status: 'in_progress',
      },
    }));
    reqStudent.finish();

    expect(resStudent.statusCode).toBe(200);
    expect(rooms.get('NET-7777').participants.length).toBe(1);
    expect(rooms.get('NET-7777').participants[0].nickname).toBe('Ahmad');
  });
});
