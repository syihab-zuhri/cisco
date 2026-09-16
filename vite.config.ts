import { defineConfig, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface ClassroomRoomState {
  session: Record<string, unknown> | null;
  participants: Array<Record<string, unknown>>;
  submissions: Record<string, Record<string, unknown>>;
  activeExercises: Array<Record<string, unknown>>;
  activeExercise: Record<string, unknown> | null;
  updatedAt: number;
}

/**
 * Lightweight Classroom Realtime Relay Middleware.
 * Memungkinkan sinkronisasi instan antar-perangkat fisik (Laptop, iPad, HP)
 * melalui jaringan LAN / internet tanpa dependensi eksternal.
 */
function classroomRelayPlugin(): Plugin {
  const rooms = new Map<string, ClassroomRoomState>();

  const middleware: Connect.NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const parsedUrl = new URL(req.url || '', 'http://localhost');
    const pathname = parsedUrl.pathname;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    // GET /api/classroom/state?code=...
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

    // POST /api/classroom/event
    if (req.method === 'POST' && (pathname === '/event' || pathname === '' || pathname === '/')) {
      let body = '';
      req.on('data', (chunk: Buffer | string) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const event = JSON.parse(body || '{}');
          const code = (event.classCode || event.session?.classCode || '').trim().toUpperCase();
          if (code) {
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
            const room = rooms.get(code)!;
            room.updatedAt = Date.now();

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
          }
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true }));
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          res.statusCode = 400;
          res.end(JSON.stringify({ success: false, error: errMsg }));
        }
      });
      return;
    }

    next();
  };

  return {
    name: 'classroom-relay',
    configureServer(server) {
      server.middlewares.use('/api/classroom', middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/classroom', middleware);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), classroomRelayPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    hmr: {
      clientPort: 443,
    },
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
  test: {
    // Spesifikasi Playwright dijalankan lewat `npm run e2e`, bukan Vitest.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
