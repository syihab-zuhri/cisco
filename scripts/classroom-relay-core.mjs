/**
 * Core Classroom Relay Logic for OpenPacket.
 * Shared between standalone scripts/classroom-relay.mjs and vite.config.ts.
 */
import { URL } from 'node:url';

export const MAX_BODY_BYTES = 1024 * 1024; // 1 MB limit
export const INACTIVE_ROOM_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const CLOSED_ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export const SENSITIVE_HOST_EVENTS = new Set([
  'CLASS_CLOSED',
  'EXERCISES_UPDATED',
  'EXERCISE_STARTED',
  'CLASS_STATUS_CHANGED',
  'CLASS_SETTINGS_CHANGED',
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

  return function relayMiddleware(req, res, next) {
    const rawUrl = req.url || '';
    const parsedUrl = new URL(rawUrl, `http://${req.headers?.host || 'localhost'}`);
    let pathname = parsedUrl.pathname;

    // Normalisasi pathname jika dimount di prefix /api/classroom atau langsung
    if (pathname.startsWith('/api/classroom')) {
      pathname = pathname.slice('/api/classroom'.length) || '/';
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Host-Token');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    // Health check
    if (pathname === '/health' || (pathname === '/' && req.method === 'GET' && !parsedUrl.searchParams.has('code'))) {
      if (req.headers?.accept && req.headers.accept.includes('text/html') && next) {
        return next();
      }
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'openpacket-classroom-relay',
          activeRooms: rooms.size,
        })
      );
      return;
    }

    // GET /api/classroom/state?code=... (atau /state?code=...)
    if (req.method === 'GET' && (pathname === '/state' || pathname === '' || pathname === '/')) {
      const code = (parsedUrl.searchParams.get('code') || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (room) {
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, ...room }));
      } else {
        res.statusCode = 200;
        res.end(JSON.stringify({ success: false, error: 'Kelas belum ditemukan' }));
      }
      return;
    }

    // POST /api/classroom/event (atau /event)
    if (req.method === 'POST' && (pathname === '/event' || pathname === '' || pathname === '/')) {
      let body = '';
      let bodyLength = 0;
      let isDestroyed = false;

      req.on('data', (chunk) => {
        if (isDestroyed) return;
        bodyLength += chunk.length;
        if (bodyLength > maxBodyBytes) {
          isDestroyed = true;
          res.statusCode = 413;
          res.end(
            JSON.stringify({
              success: false,
              error: `Payload Too Large: Maksimum ukuran event adalah ${Math.round(maxBodyBytes / 1024)} KB`,
            })
          );
          if (typeof req.destroy === 'function') {
            req.destroy();
          }
          return;
        }
        body += chunk.toString();
      });

      req.on('end', () => {
        if (isDestroyed) return;
        try {
          const event = JSON.parse(body || '{}');
          const code = (event.classCode || event.session?.classCode || '').trim().toUpperCase();

          if (!code) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, error: 'classCode diperlukan' }));
            return;
          }

          const existingRoom = rooms.get(code);

          // Proteksi CLASS_CREATED: Jangan izinkan pembajakan kelas yang masih aktif oleh host lain
          if (event.type === 'CLASS_CREATED') {
            if (
              existingRoom &&
              existingRoom.session &&
              existingRoom.session.status !== 'closed' &&
              existingRoom.session.hostToken &&
              event.session?.hostToken &&
              existingRoom.session.hostToken !== event.session.hostToken
            ) {
              res.statusCode = 403;
              res.end(
                JSON.stringify({
                  success: false,
                  error: 'Forbidden: Kelas dengan kode ini sedang aktif dan dimiliki oleh host lain.',
                })
              );
              return;
            }
          }

          // Inisialisasi room bila belum ada
          if (!rooms.has(code)) {
            rooms.set(code, {
              session: null,
              participants: [],
              submissions: {},
              activeExercises: [],
              activeExercise: null,
              updatedAt: Date.now(),
            });
          }

          const room = rooms.get(code);
          room.updatedAt = Date.now();

          // Proteksi Event Sensitif (Host Only)
          if (SENSITIVE_HOST_EVENTS.has(event.type)) {
            const expectedToken = room.session?.hostToken;
            const incomingToken =
              event.hostToken ||
              event.session?.hostToken ||
              req.headers?.['x-host-token'] ||
              (req.headers?.authorization && req.headers.authorization.replace(/^Bearer\s+/i, ''));

            if (expectedToken && incomingToken !== expectedToken) {
              res.statusCode = 403;
              res.end(
                JSON.stringify({
                  success: false,
                  error: 'Forbidden: Tindakan ini memerlukan token host yang valid.',
                })
              );
              return;
            }
          }

          // Eksekusi mutasi state sesuai event
          switch (event.type) {
            case 'CLASS_CREATED':
              room.session = event.session;
              room.participants = [];
              room.submissions = {};
              if (event.session?.activeExercises) {
                room.activeExercises = event.session.activeExercises;
                room.activeExercise = event.session.activeExercises[0] || null;
              }
              break;

            case 'PARTICIPANT_JOINED':
              if (event.participant && !room.participants.some((p) => p.id === event.participant.id)) {
                room.participants.push(event.participant);
              }
              break;

            case 'EXERCISES_UPDATED':
            case 'EXERCISE_STARTED':
              if (event.exercises && event.exercises.length > 0) {
                room.activeExercises = event.exercises;
                room.activeExercise = event.exercises[0] || event.exercise || null;
                if (room.session) {
                  room.session.activeExerciseId = room.activeExercise?.id || null;
                  room.session.activeExercises = room.activeExercises;
                }
              } else if (event.exercise) {
                room.activeExercises = [event.exercise];
                room.activeExercise = event.exercise;
                if (room.session) {
                  room.session.activeExerciseId = event.exercise.id;
                  room.session.activeExercises = [event.exercise];
                }
              } else {
                room.activeExercises = [];
                room.activeExercise = null;
                if (room.session) {
                  room.session.activeExerciseId = null;
                  room.session.activeExercises = [];
                }
              }
              break;

            case 'SUBMISSION_RECEIVED':
              if (event.submission) {
                room.submissions[event.submission.participantId] = event.submission;
                const pIdx = room.participants.findIndex((p) => p.id === event.submission.participantId);
                if (pIdx !== -1) {
                  room.participants[pIdx].status = 'submitted';
                }
              }
              break;

            case 'CLASS_STATUS_CHANGED':
              if (room.session) room.session.status = event.status;
              break;

            case 'CLASS_SETTINGS_CHANGED':
              if (room.session) room.session.allowSelfCheck = event.allowSelfCheck;
              break;

            case 'CLASS_CLOSED':
              if (room.session) room.session.status = 'closed';
              room.activeExercises = [];
              room.activeExercise = null;
              break;
          }

          res.statusCode = 200;
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }));
        }
      });
      return;
    }

    if (next) {
      return next();
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ success: false, error: 'Not Found' }));
  };
}
