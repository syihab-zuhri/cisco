#!/usr/bin/env node
/**
 * Standalone Classroom Relay Server for OpenPacket.
 * Runs on Node.js / Bun without Vite dependencies.
 * Default port: 5174 (or PORT env var).
 */
import { createServer } from 'node:http';
import { createRelayMiddleware } from './classroom-relay-core.mjs';

const PORT = Number(process.env.PORT) || 5174;
const HOST = process.env.HOST || '0.0.0.0';

const rooms = new Map();
const relayMiddleware = createRelayMiddleware(rooms);

const server = createServer((req, res) => {
  relayMiddleware(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`[OpenPacket] Standalone Classroom Relay running at http://${HOST}:${PORT}`);
});
