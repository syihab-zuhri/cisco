import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Lightweight Classroom Realtime Relay Middleware.
 * Memungkinkan sinkronisasi instan antar-perangkat fisik (Laptop, iPad, HP)
 * melalui jaringan LAN / internet tanpa dependensi eksternal.
 */
function classroomRelayPlugin(): Plugin {
  const rooms = new Map<
    string,
    {
      session: any;
      participants: any[];
      submissions: Record<string, any>;
      activeExercises: any[];
      activeExercise: any;
      updatedAt: number;
    }
  >();

  return {
    name: 'classroom-relay',
    configureServer(server) {
      server.middlewares.use('/api/classroom', (req, res, next) => {
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
          req.on('data', (chunk: any) => {
            body += chunk;
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
                    } else if (event.exercise) {
                      room.activeExercises = [event.exercise];
                      room.activeExercise = event.exercise;
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
                    break;
                }
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } catch (e: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: e.message }));
            }
          });
          return;
        }

        next();
      });
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
