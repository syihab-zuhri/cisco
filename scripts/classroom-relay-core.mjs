/**
 * Core Classroom Relay Logic for OpenPacket.
 * Shared between standalone scripts/classroom-relay.mjs and vite.config.ts.
 *
 * Model keamanan (tanpa akun, tanpa server eksternal):
 * - `hostToken`  : rahasia guru. Disimpan di `room.hostToken`, TIDAK PERNAH dikirim
 *                  balik lewat GET /state, dan wajib untuk semua event guru.
 * - `participantToken` : rahasia per siswa, dikirim saat PARTICIPANT_JOINED. Wajib
 *                  untuk submission dan keluar-kelas atas nama siswa tersebut.
 * - Hanya CLASS_CREATED yang boleh membuat room. Semua input divalidasi dan dibatasi.
 * - GET /state mengembalikan tampilan berbeda: guru (lengkap), peserta (soal + nilai
 *   miliknya), anonim (hanya info publik kelas).
 */
import { URL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import { timingSafeEqual } from 'node:crypto';

export const MAX_BODY_BYTES = 1024 * 1024; // 1 MB limit
export const INACTIVE_ROOM_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const CLOSED_ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
export const MAX_ROOMS = 500;
export const MAX_PARTICIPANTS_PER_ROOM = 300;
export const MAX_EXERCISES_PER_ROOM = 50;
export const MAX_HISTORY_ROUNDS = 10;
/** Snapshot topologi jawaban siswa (untuk verifikasi ulang guru): batas per siswa dan per room. */
export const MAX_SNAPSHOT_BYTES = 300 * 1024;
export const MAX_ROOM_SNAPSHOT_BYTES = 12 * 1024 * 1024;
export const MIN_TOKEN_LENGTH = 8;
export const MAX_TOKEN_LENGTH = 128;

const CODE_PATTERN = /^[A-Z0-9_-]{2,32}$/;
const VALID_STATUSES = new Set(['open', 'locked', 'closed']);
const VALID_SUBMISSION_STATUSES = new Set(['passed', 'partial', 'failed']);

export const SENSITIVE_HOST_EVENTS = new Set([
  'CLASS_CLOSED',
  'EXERCISES_UPDATED',
  'EXERCISE_STARTED',
  'CLASS_STATUS_CHANGED',
  'CLASS_SETTINGS_CHANGED',
  'PARTICIPANT_KICKED',
]);

const KNOWN_EVENTS = new Set([
  'CLASS_CREATED',
  'PARTICIPANT_JOINED',
  'PARTICIPANT_LEFT',
  'SUBMISSION_RECEIVED',
  ...SENSITIVE_HOST_EVENTS,
]);

/**
 * Pembersihan berkala untuk room yang sudah tidak aktif atau sudah ditutup.
 */
export function cleanupStaleRooms(
  rooms,
  maxAgeMs = INACTIVE_ROOM_TTL_MS,
  closedMaxAgeMs = CLOSED_ROOM_TTL_MS
) {
  const now = Date.now();
  let purgedCount = 0;
  for (const [code, room] of rooms.entries()) {
    const age = now - (room.updatedAt || 0);
    const isClosed = room.session?.status === 'closed';
    if ((isClosed && age > closedMaxAgeMs) || age > maxAgeMs) {
      rooms.delete(code);
      purgedCount++;
    }
  }
  return purgedCount;
}

// ---------------------------------------------------------------------------
// Helper kecil
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizeCode(raw) {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

function isToken(value) {
  return typeof value === 'string' && value.length >= MIN_TOKEN_LENGTH && value.length <= MAX_TOKEN_LENGTH;
}

/** Perbandingan token dalam waktu konstan. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function clampInt(value, min, max, fallback) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cleanText(value, max, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
}

/** Room lama / hasil seed test mungkin belum punya semua field. */
function normalizeRoom(room) {
  room.participants = Array.isArray(room.participants) ? room.participants : [];
  room.participantTokens = room.participantTokens && typeof room.participantTokens === 'object' ? room.participantTokens : {};
  room.kicked = room.kicked && typeof room.kicked === 'object' ? room.kicked : {};
  room.submissions = room.submissions && typeof room.submissions === 'object' ? room.submissions : {};
  room.history = Array.isArray(room.history) ? room.history : [];
  room.snapshots = room.snapshots && typeof room.snapshots === 'object' ? room.snapshots : {};
  room.snapshotBytes = Number.isFinite(room.snapshotBytes) ? room.snapshotBytes : 0;
  room.activeExercises = Array.isArray(room.activeExercises) ? room.activeExercises : [];
  room.activeExercise = room.activeExercise ?? null;
  room.round = Number.isInteger(room.round) ? room.round : 0;
  room.rev = Number.isInteger(room.rev) ? room.rev : 0;
  return room;
}

/** Token guru yang sah, juga untuk room berformat lama (token di dalam session). */
function hostTokenOf(room) {
  return room.hostToken || room.session?.hostToken || '';
}

/** Salinan session untuk publik: tidak pernah memuat rahasia. */
function publicSession(room) {
  if (!room.session) return null;
  // eslint-disable-next-line no-unused-vars
  const { hostToken, ...rest } = room.session;
  return rest;
}

function touch(room) {
  room.updatedAt = Date.now();
  room.rev += 1;
}

function sanitizeExercises(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((ex) => ex && typeof ex === 'object' && typeof ex.id === 'string' && ex.id)
    .slice(0, MAX_EXERCISES_PER_ROOM);
}

/** Snapshot topologi: hanya { nodes[{id,type,data}], edges[...] } dengan batas ukuran; selain itu ditolak (null). */
function sanitizeSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;
  if (raw.nodes.length > 200 || raw.edges.length > 400) return null;
  const nodes = [];
  for (const n of raw.nodes) {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !n.data || typeof n.data !== 'object') return null;
    nodes.push({ id: n.id, type: typeof n.type === 'string' ? n.type : undefined, data: n.data });
  }
  const edges = [];
  for (const e of raw.edges) {
    if (!e || typeof e !== 'object' || typeof e.source !== 'string' || typeof e.target !== 'string') return null;
    edges.push({
      id: typeof e.id === 'string' ? e.id : undefined,
      source: e.source,
      target: e.target,
      sourceHandle: typeof e.sourceHandle === 'string' ? e.sourceHandle : undefined,
      targetHandle: typeof e.targetHandle === 'string' ? e.targetHandle : undefined,
      type: typeof e.type === 'string' ? e.type : undefined,
    });
  }
  return { nodes, edges };
}

/** Arsip ronde yang dikirim guru saat memulihkan kelas setelah relay restart. */
function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const h of raw.slice(-MAX_HISTORY_ROUNDS)) {
    if (!h || typeof h !== 'object') continue;
    if (!h.submissions || typeof h.submissions !== 'object' || Object.keys(h.submissions).length > MAX_PARTICIPANTS_PER_ROOM) continue;
    out.push({
      round: clampInt(h.round, 0, 1_000_000, 0),
      endedAt: Number.isFinite(h.endedAt) ? h.endedAt : Date.now(),
      exercises: (Array.isArray(h.exercises) ? h.exercises : []).slice(0, MAX_EXERCISES_PER_ROOM)
        .filter((x) => x && typeof x.id === 'string')
        .map((x) => ({ id: x.id, title: cleanText(x.title, 200, x.id) })),
      participants: (Array.isArray(h.participants) ? h.participants : []).slice(0, MAX_PARTICIPANTS_PER_ROOM)
        .filter((x) => x && typeof x.id === 'string')
        .map((x) => ({ id: x.id, nickname: cleanText(x.nickname, 40, 'Siswa') })),
      submissions: h.submissions,
    });
  }
  return out;
}

function incomingHostToken(event, req) {
  const header = req.headers?.['x-host-token'];
  const auth = req.headers?.authorization;
  return (
    event.hostToken ||
    event.session?.hostToken ||
    (typeof header === 'string' ? header : '') ||
    (typeof auth === 'string' ? auth.replace(/^Bearer\s+/i, '') : '')
  );
}

// ---------------------------------------------------------------------------
// Tampilan GET /state per peran
// ---------------------------------------------------------------------------

function buildStateView(room, req, since) {
  const headers = req.headers || {};
  const hostHeader = typeof headers['x-host-token'] === 'string' ? headers['x-host-token'] : '';
  const participantId = typeof headers['x-participant-id'] === 'string' ? headers['x-participant-id'] : '';
  const participantToken = typeof headers['x-participant-token'] === 'string' ? headers['x-participant-token'] : '';

  const base = { success: true, rev: room.rev };
  const unchanged = Number.isInteger(since) && since === room.rev;

  if (hostHeader && safeEqual(hostHeader, hostTokenOf(room))) {
    if (unchanged) return { ...base, unchanged: true, role: 'host' };
    return {
      ...base,
      role: 'host',
      session: publicSession(room),
      participants: room.participants,
      submissions: room.submissions,
      history: room.history,
      activeExercises: room.activeExercises,
      activeExercise: room.activeExercise,
    };
  }

  if (participantId) {
    const kickedToken = room.kicked[participantId];
    if (kickedToken && safeEqual(participantToken, kickedToken)) {
      return { ...base, role: 'participant', me: { status: 'kicked' }, session: publicSession(room), activeExercises: [], activeExercise: null, participants: [], submissions: {} };
    }
    const knownToken = room.participantTokens[participantId];
    if (knownToken && safeEqual(participantToken, knownToken)) {
      const me = room.participants.find((p) => p.id === participantId);
      const meStatus = me?.status === 'left' ? 'left' : 'active';
      if (unchanged) return { ...base, unchanged: true, role: 'participant', me: { status: meStatus } };
      const own = room.submissions[participantId];
      return {
        ...base,
        role: 'participant',
        me: { status: meStatus },
        session: publicSession(room),
        participants: [],
        submissions: own ? { [participantId]: own } : {},
        activeExercises: room.activeExercises,
        activeExercise: room.activeExercise,
      };
    }
    // Token tidak dikenal: mungkin relay baru restart / belum sempat join.
    const session = publicSession(room);
    return {
      ...base,
      role: 'anonymous',
      me: { status: 'unknown' },
      session: session && { classCode: session.classCode, title: session.title, status: session.status },
    };
  }

  const session = publicSession(room);
  return {
    ...base,
    role: 'anonymous',
    session: session && { classCode: session.classCode, title: session.title, status: session.status },
  };
}

// ---------------------------------------------------------------------------
// Penanganan event (sinkron; melempar HttpError bila ditolak)
// ---------------------------------------------------------------------------

function requireRoom(rooms, code) {
  const room = rooms.get(code);
  if (!room || !room.session) throw new HttpError(404, 'Kelas tidak ditemukan.');
  return normalizeRoom(room);
}

function requireHost(room, event, req) {
  const expected = hostTokenOf(room);
  if (!expected || !safeEqual(String(incomingHostToken(event, req) || ''), expected)) {
    throw new HttpError(403, 'Forbidden: Tindakan ini memerlukan token host yang valid.');
  }
}

function requireParticipant(room, event, participantId) {
  const expected = room.participantTokens[participantId];
  if (!expected || !safeEqual(String(event.participantToken || ''), expected)) {
    throw new HttpError(403, 'Forbidden: Token peserta tidak valid.');
  }
}

function handleClassCreated(rooms, code, event) {
  const incoming = event.session;
  if (!incoming || typeof incoming !== 'object') throw new HttpError(400, 'session diperlukan');
  if (!isToken(incoming.hostToken)) {
    throw new HttpError(400, `hostToken wajib diisi (${MIN_TOKEN_LENGTH}-${MAX_TOKEN_LENGTH} karakter).`);
  }

  const existing = rooms.get(code);
  // Jangan izinkan pembajakan kelas yang masih aktif oleh host lain.
  if (
    existing &&
    existing.session &&
    existing.session.status !== 'closed' &&
    hostTokenOf(existing) &&
    !safeEqual(incoming.hostToken, hostTokenOf(existing))
  ) {
    throw new HttpError(403, 'Forbidden: Kelas dengan kode ini sedang aktif dan dimiliki oleh host lain.');
  }

  // Pemulihan tidak boleh menimpa room yang sudah hidup (mis. dua tab guru memulihkan bersamaan).
  if (event.restore === true && existing?.session && existing.session.status !== 'closed') return;

  if (!existing && rooms.size >= MAX_ROOMS) {
    cleanupStaleRooms(rooms);
    if (rooms.size >= MAX_ROOMS) throw new HttpError(503, 'Server relay penuh. Coba lagi nanti.');
  }

  const exercises = sanitizeExercises(incoming.activeExercises);
  const { hostToken, ...rest } = incoming;
  // Pemulihan: guru mendaftarkan ulang kelasnya setelah relay restart (room hilang dari memori).
  // Ronde, status, dan arsip nilai dipertahankan; peserta & jawaban dipulihkan oleh siswa sendiri.
  const restore = event.restore === true;
  const round = restore ? clampInt(rest.round, 0, 1_000_000, 0) : 0;
  const room = normalizeRoom({
    session: {
      ...rest,
      classCode: code,
      title: cleanText(rest.title, 120, 'Kelas Jaringan Komputer'),
      status: VALID_STATUSES.has(rest.status) ? rest.status : 'open',
      activeExercises: exercises,
      activeExerciseId: exercises[0]?.id ?? null,
      round,
    },
    hostToken,
    participants: [],
    participantTokens: {},
    kicked: {},
    submissions: {},
    history: restore ? sanitizeHistory(event.history) : [],
    snapshots: {},
    snapshotBytes: 0,
    activeExercises: exercises,
    activeExercise: exercises[0] ?? null,
    round,
    rev: (existing?.rev ?? 0) + 1,
    updatedAt: Date.now(),
  });
  rooms.set(code, room);
}

function handleParticipantJoined(rooms, code, event) {
  const room = requireRoom(rooms, code);
  const status = room.session.status;
  if (status === 'closed') throw new HttpError(403, 'Kelas sudah ditutup oleh guru.');
  if (status === 'locked') throw new HttpError(403, 'Kelas sedang dikunci oleh guru. Peserta baru tidak dapat bergabung.');

  const p = event.participant;
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id || p.id.length > 64) {
    throw new HttpError(400, 'participant.id wajib diisi.');
  }
  if (!isToken(event.participantToken)) {
    throw new HttpError(400, 'participantToken wajib diisi.');
  }
  if (room.kicked[p.id]) throw new HttpError(403, 'Anda telah dikeluarkan dari kelas ini.');

  // Idempoten: join ulang dengan id yang sama tidak mengganti token pemiliknya.
  if (room.participants.some((x) => x.id === p.id)) {
    if (!safeEqual(event.participantToken, room.participantTokens[p.id] || '')) {
      throw new HttpError(403, 'Forbidden: Token peserta tidak valid.');
    }
    return;
  }
  if (room.participants.length >= MAX_PARTICIPANTS_PER_ROOM) {
    throw new HttpError(403, 'Kelas sudah penuh.');
  }

  room.participants.push({
    id: p.id,
    nickname: cleanText(p.nickname, 40, 'Siswa'),
    joinedAt: Number.isFinite(p.joinedAt) ? p.joinedAt : Date.now(),
    status: 'in_progress',
  });
  room.participantTokens[p.id] = event.participantToken;
  touch(room);
}

function handleParticipantLeft(rooms, code, event, req) {
  const room = requireRoom(rooms, code);
  const id = event.participantId;
  if (typeof id !== 'string' || !id) throw new HttpError(400, 'participantId wajib diisi.');

  // Siswa keluar dengan token miliknya; guru boleh menghapus siapa pun.
  const hostOk = safeEqual(String(incomingHostToken(event, req) || ''), hostTokenOf(room));
  if (!hostOk) requireParticipant(room, event, id);

  const idx = room.participants.findIndex((p) => p.id === id);
  if (idx === -1) return;
  if (room.submissions[id]) {
    // Nilai tetap tampil di tabel guru; peserta ditandai sudah keluar.
    room.participants[idx] = { ...room.participants[idx], status: 'left' };
  } else {
    room.participants.splice(idx, 1);
  }
  delete room.participantTokens[id];
  touch(room);
}

function handleParticipantKicked(rooms, code, event, req) {
  const room = requireRoom(rooms, code);
  requireHost(room, event, req);
  const id = event.participantId;
  if (typeof id !== 'string' || !id) throw new HttpError(400, 'participantId wajib diisi.');
  const token = room.participantTokens[id];
  if (token) room.kicked[id] = token; // hanya pemilik token yang boleh mengetahui statusnya
  room.participants = room.participants.filter((p) => p.id !== id);
  delete room.participantTokens[id];
  delete room.submissions[id];
  dropSnapshot(room, id);
  touch(room);
}

function handleExercises(rooms, code, event, req, isStart) {
  const room = requireRoom(rooms, code);
  requireHost(room, event, req);

  let exercises = [];
  if (Array.isArray(event.exercises) && event.exercises.length > 0) exercises = sanitizeExercises(event.exercises);
  else if (event.exercise) exercises = sanitizeExercises([event.exercise]);

  if (isStart && exercises.length > 0) {
    // Ronde baru: arsipkan nilai ronde sebelumnya, lalu mulai dari nol.
    if (Object.keys(room.submissions).length > 0) {
      room.history.push({
        round: room.round,
        endedAt: Date.now(),
        exercises: room.activeExercises.map((ex) => ({ id: ex.id, title: ex.title })),
        participants: room.participants.map((p) => ({ id: p.id, nickname: p.nickname })),
        submissions: room.submissions,
      });
      if (room.history.length > MAX_HISTORY_ROUNDS) room.history.splice(0, room.history.length - MAX_HISTORY_ROUNDS);
    }
    room.submissions = {};
    room.snapshots = {};
    room.snapshotBytes = 0;
    room.participants = room.participants.map((p) => (p.status === 'left' ? p : { ...p, status: 'in_progress' }));
    room.round += 1;
  }

  room.activeExercises = exercises;
  room.activeExercise = exercises[0] ?? null;
  room.session.activeExercises = exercises;
  room.session.activeExerciseId = exercises[0]?.id ?? null;
  room.session.round = room.round;
  touch(room);
}

function handleSubmission(rooms, code, event) {
  const room = requireRoom(rooms, code);
  if (room.session.status === 'closed') throw new HttpError(403, 'Kelas sudah ditutup. Jawaban tidak diterima.');

  const sub = event.submission;
  if (!sub || typeof sub !== 'object' || typeof sub.participantId !== 'string') {
    throw new HttpError(400, 'submission.participantId wajib diisi.');
  }
  requireParticipant(room, event, sub.participantId);
  const idx = room.participants.findIndex((p) => p.id === sub.participantId);
  if (idx === -1) throw new HttpError(403, 'Peserta tidak terdaftar di kelas ini.');

  const score = clampInt(sub.score, 0, 100, 0);
  const status = VALID_SUBMISSION_STATUSES.has(sub.status)
    ? sub.status
    : score === 100
    ? 'passed'
    : score > 0
    ? 'partial'
    : 'failed';

  // `snapshot` dibuang dari objek submission (ia hanya boleh dibaca guru lewat /snapshot, bukan di poll biasa).
  // eslint-disable-next-line no-unused-vars
  const { snapshot: _ignored, ...subRest } = sub;
  room.submissions[sub.participantId] = {
    ...subRest,
    nickname: room.participants[idx].nickname,
    score,
    status,
    round: room.round,
    submittedAt: Date.now(),
  };
  room.participants[idx] = { ...room.participants[idx], status: 'submitted' };

  // Snapshot topologi untuk verifikasi ulang oleh guru. Gagal/terlalu besar = jawaban tetap diterima tanpa snapshot.
  dropSnapshot(room, sub.participantId);
  const snap = event.snapshot !== undefined ? sanitizeSnapshot(event.snapshot) : null;
  if (snap) {
    const bytes = JSON.stringify(snap).length;
    if (bytes <= MAX_SNAPSHOT_BYTES && room.snapshotBytes + bytes <= MAX_ROOM_SNAPSHOT_BYTES) {
      room.snapshots[sub.participantId] = { round: room.round, snapshot: snap, bytes };
      room.snapshotBytes += bytes;
    }
  }
  touch(room);
}

function dropSnapshot(room, participantId) {
  const old = room.snapshots[participantId];
  if (old) {
    room.snapshotBytes = Math.max(0, room.snapshotBytes - (old.bytes || 0));
    delete room.snapshots[participantId];
  }
}

function handleStatus(rooms, code, event, req) {
  const room = requireRoom(rooms, code);
  requireHost(room, event, req);
  if (!VALID_STATUSES.has(event.status)) throw new HttpError(400, 'status harus open, locked, atau closed.');
  room.session.status = event.status;
  touch(room);
}

function handleSettings(rooms, code, event, req) {
  const room = requireRoom(rooms, code);
  requireHost(room, event, req);
  room.session.allowSelfCheck = Boolean(event.allowSelfCheck);
  if (event.selfCheckLimit !== undefined) {
    room.session.selfCheckLimit = clampInt(event.selfCheckLimit, 1, 99, 5);
  }
  touch(room);
}

function handleClosed(rooms, code, event, req) {
  const room = requireRoom(rooms, code);
  requireHost(room, event, req);
  room.session.status = 'closed';
  room.session.activeExercises = [];
  room.session.activeExerciseId = null;
  room.activeExercises = [];
  room.activeExercise = null;
  touch(room);
}

function processEvent(rooms, event, req) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new HttpError(400, 'Event tidak valid.');
  if (typeof event.type !== 'string' || !KNOWN_EVENTS.has(event.type)) {
    throw new HttpError(400, `Tipe event tidak dikenal: ${String(event.type).slice(0, 40)}`);
  }

  const code = normalizeCode(event.classCode || event.session?.classCode);
  if (!code) throw new HttpError(400, 'classCode diperlukan');
  if (!CODE_PATTERN.test(code)) throw new HttpError(400, 'classCode hanya boleh berisi huruf, angka, "-" atau "_" (2-32 karakter).');

  switch (event.type) {
    case 'CLASS_CREATED':
      return handleClassCreated(rooms, code, event);
    case 'PARTICIPANT_JOINED':
      return handleParticipantJoined(rooms, code, event);
    case 'PARTICIPANT_LEFT':
      return handleParticipantLeft(rooms, code, event, req);
    case 'PARTICIPANT_KICKED':
      return handleParticipantKicked(rooms, code, event, req);
    case 'EXERCISES_UPDATED':
      return handleExercises(rooms, code, event, req, false);
    case 'EXERCISE_STARTED':
      return handleExercises(rooms, code, event, req, true);
    case 'SUBMISSION_RECEIVED':
      return handleSubmission(rooms, code, event);
    case 'CLASS_STATUS_CHANGED':
      return handleStatus(rooms, code, event, req);
    case 'CLASS_SETTINGS_CHANGED':
      return handleSettings(rooms, code, event, req);
    case 'CLASS_CLOSED':
      return handleClosed(rooms, code, event, req);
    default:
      throw new HttpError(400, 'Tipe event tidak dikenal.');
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Host-Token, X-Participant-Id, X-Participant-Token'
  );
}

/**
 * Header JSON/CORS hanya dipasang pada respons yang benar-benar dibuat relay. Sebelumnya dipasang di
 * awal untuk SEMUA request, sehingga saat dipasang di `vite preview` berkas JS/HTML aplikasi ikut
 * disajikan sebagai application/json dan aplikasi tidak termuat.
 */
function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json');
  setCors(res);
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

/**
 * Middleware factory yang bekerja untuk Node.js http.createServer maupun Connect middleware Vite.
 */
export function createRelayMiddleware(rooms = new Map(), options = {}) {
  const maxBodyBytes = options.maxBodyBytes || MAX_BODY_BYTES;
  const allowCleanup = options.autoCleanup !== false;

  // Interval pembersihan otomatis setiap 30 menit
  let cleanupTimer = null;
  if (allowCleanup && typeof setInterval !== 'undefined') {
    cleanupTimer = setInterval(() => {
      cleanupStaleRooms(rooms);
    }, 30 * 60 * 1000);
    if (cleanupTimer && typeof cleanupTimer.unref === 'function') {
      cleanupTimer.unref();
    }
  }

  function relay(req, res, next) {
    const rawUrl = req.url || '';
    // Host dari klien tidak dipercaya: basis URL dibuat tetap supaya header janggal
    // tidak bisa membuat parsing melempar error (dan mematikan proses relay).
    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl, 'http://relay.local');
    } catch {
      return sendJson(res, 400, { success: false, error: 'URL tidak valid.' });
    }
    let pathname = parsedUrl.pathname;

    // Normalisasi pathname jika dimount di prefix /api/classroom atau langsung
    if (pathname.startsWith('/api/classroom')) {
      pathname = pathname.slice('/api/classroom'.length) || '/';
    }

    // Preflight CORS: dijawab relay hanya untuk jalur relay (atau untuk relay mandiri tanpa `next`).
    if (req.method === 'OPTIONS' && (!next || rawUrl.startsWith('/api/classroom'))) {
      setCors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    const wantsHtml = Boolean(req.headers?.accept && req.headers.accept.includes('text/html') && next);

    // Health check
    if (pathname === '/health' || (pathname === '/' && req.method === 'GET' && !parsedUrl.searchParams.has('code'))) {
      if (wantsHtml) return next();
      return sendJson(res, 200, {
        status: 'ok',
        service: 'openpacket-classroom-relay',
        activeRooms: rooms.size,
      });
    }

    // GET /api/classroom/snapshot?code=...&participantId=... — khusus guru (token host)
    if (req.method === 'GET' && pathname === '/snapshot') {
      const code = normalizeCode(parsedUrl.searchParams.get('code') || '');
      const room = rooms.get(code);
      if (!room || !room.session) return sendJson(res, 200, { success: false, error: 'Kelas belum ditemukan' });
      normalizeRoom(room);
      const hostHeader = typeof req.headers?.['x-host-token'] === 'string' ? req.headers['x-host-token'] : '';
      if (!safeEqual(hostHeader, hostTokenOf(room))) {
        return sendJson(res, 403, { success: false, error: 'Forbidden: Tindakan ini memerlukan token host yang valid.' });
      }
      const entry = room.snapshots[parsedUrl.searchParams.get('participantId') || ''];
      if (!entry) return sendJson(res, 200, { success: false, error: 'Snapshot topologi tidak tersedia untuk peserta ini.' });
      return sendJson(res, 200, { success: true, round: entry.round, snapshot: entry.snapshot });
    }

    // GET /api/classroom/state?code=... (atau /state?code=...)
    if (req.method === 'GET' && (pathname === '/state' || pathname === '' || pathname === '/')) {
      if (pathname === '/' && wantsHtml) return next();
      const code = normalizeCode(parsedUrl.searchParams.get('code') || '');
      const room = rooms.get(code);
      if (!room || !room.session) {
        return sendJson(res, 200, { success: false, error: 'Kelas belum ditemukan' });
      }
      const sinceRaw = parsedUrl.searchParams.get('since');
      const since = sinceRaw !== null && sinceRaw !== '' ? Number(sinceRaw) : NaN;
      return sendJson(res, 200, buildStateView(normalizeRoom(room), req, since));
    }

    // POST /api/classroom/event (atau /event)
    if (req.method === 'POST' && (pathname === '/event' || pathname === '' || pathname === '/')) {
      const decoder = new StringDecoder('utf8');
      let body = '';
      let bodyLength = 0;
      let isDestroyed = false;

      req.on('data', (chunk) => {
        if (isDestroyed) return;
        bodyLength += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        if (bodyLength > maxBodyBytes) {
          isDestroyed = true;
          sendJson(res, 413, {
            success: false,
            error: `Payload Too Large: Maksimum ukuran event adalah ${Math.round(maxBodyBytes / 1024)} KB`,
          });
          if (typeof req.destroy === 'function') {
            req.destroy();
          }
          return;
        }
        // StringDecoder menjaga karakter multibyte yang terpotong di batas chunk.
        body += typeof chunk === 'string' ? chunk : decoder.write(chunk);
      });

      req.on('end', () => {
        if (isDestroyed) return;
        try {
          body += decoder.end();
          let event;
          try {
            event = JSON.parse(body || '{}');
          } catch {
            throw new HttpError(400, 'Body bukan JSON yang valid.');
          }
          processEvent(rooms, event, req);
          sendJson(res, 200, { success: true });
        } catch (e) {
          if (e instanceof HttpError) {
            sendJson(res, e.status, { success: false, error: e.message });
          } else {
            sendJson(res, 500, { success: false, error: 'Kesalahan internal relay.' });
          }
        }
      });
      return;
    }

    if (next) {
      return next();
    }

    sendJson(res, 404, { success: false, error: 'Not Found' });
  }

  // Pengaman terakhir: kegagalan tak terduga tidak boleh menjatuhkan proses relay.
  return function relayMiddleware(req, res, next) {
    try {
      return relay(req, res, next);
    } catch {
      try {
        sendJson(res, 500, { success: false, error: 'Kesalahan internal relay.' });
      } catch {
        // koneksi sudah tertutup
      }
    }
  };
}
