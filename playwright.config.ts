import { defineConfig } from '@playwright/test';

// Catatan channel browser: E2E di mesin pengembang memakai msedge (Chromium
// bawaan Windows, karena CDN unduhan Playwright tidak selalu terjangkau).
// Di CI (ubuntu-latest) channel msedge tidak ada — pakai chromium hasil
// `npx playwright install`. Override manual: E2E_CHANNEL=<channel>.
const channel = process.env.E2E_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    ...(channel ? { channel } : {}),
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: channel ?? 'chromium', use: { browserName: 'chromium', ...(channel ? { channel } : {}) } }],
});
