#!/usr/bin/env node
/**
 * Standalone Classroom Relay Server for OpenPacket.
 * Runs on Node.js / Bun without Vite dependencies.
 * Default port: 5174 (or PORT env var).
 */
import { createServer } from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT) || 5174;
const HOST = process.env.HOST || '0.0.0.0';

const rooms = new Map();

const server = createServer((req, res) => {
  const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
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

  // Health check
  if (pathname === '/health' || pathname === '/') {
    res.statusCode = 200;
    res.end(JSON.stringify({ status: 'ok', service: 'openpacket-classroom-relay', activeRooms: rooms.size }));
    return;
  }

  // GET /api/classroom/state?code=...
  if (req.method === 'GET' && pathname === '/api/classroom/state') {
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
  if (req.method === 'POST' && pathname === '/api/classroom/event') {
    let body = '';
    req.on('data', (chunk) => {
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
          const room = rooms.get(code);
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
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }));
      }
    });
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ success: false, error: 'Not Found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`[OpenPacket] Standalone Classroom Relay running at http://${HOST}:${PORT}`);
});
