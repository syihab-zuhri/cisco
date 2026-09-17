import { defineConfig, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
// @ts-expect-error importing .mjs helper
import { createRelayMiddleware } from './scripts/classroom-relay-core.mjs';

/**
 * Lightweight Classroom Realtime Relay Middleware.
 * Memungkinkan sinkronisasi instan antar-perangkat fisik (Laptop, iPad, HP)
 * melalui jaringan LAN / internet tanpa dependensi eksternal.
 */
function classroomRelayPlugin(): Plugin {
  const rooms = new Map();
  const middleware = createRelayMiddleware(rooms);

  return {
    name: 'classroom-relay',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res, next);
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
    hmr: {
      clientPort: 443,
    },
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@xyflow')) {
            return 'vendor-xyflow';
          }
          if (id.includes('node_modules/lucide-react') || id.includes('node_modules/@remixicon')) {
            return 'vendor-icons';
          }
          if (id.includes('src/data/topologyTemplates')) {
            return 'data-templates';
          }
        },
      },
    },
  },
  test: {
    // Spesifikasi Playwright dijalankan lewat `npm run e2e`, bukan Vitest.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
