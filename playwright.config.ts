import { defineConfig } from '@playwright/test';

// Catatan: CDN unduhan browser Playwright tidak terjangkau di jaringan ini,
// jadi E2E memakai browser berbasis Chromium yang sudah terinstal di sistem
// (channel msedge). `npx playwright install chromium` tetap berlaku bila
// jaringan mengizinkan.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'msedge',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: 'msedge', use: { browserName: 'chromium', channel: 'msedge' } }],
});
