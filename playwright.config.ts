import { defineConfig, devices } from '@playwright/test';

const port = 4322;

export default defineConfig({
  testDir: 'site/tests/e2e',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Serves the production build that `mise run site:build` writes to site/dist.
  webServer: {
    command: `pnpm exec astro preview --root site --ignore-lock --port ${port}`,
    url: `http://localhost:${port}/robomania/`,
    reuseExistingServer: false,
  },
});
