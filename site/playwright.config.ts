import { defineConfig, devices } from '@playwright/test';

const port = 4322;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Serves a production build of its own, made with a fixture manifest so that flashable pages exist without building
  // images. It goes to site/dist-e2e, so site/dist keeps the real build.
  webServer: {
    command: `pnpm exec astro build && pnpm exec astro preview --ignore-lock --port ${port}`,
    env: {
      ROBOMANIA_FIRMWARE_MANIFEST: 'tests/e2e/fixtures/firmware-manifest.json',
      ROBOMANIA_OUT_DIR: 'dist-e2e',
    },
    url: `http://localhost:${port}/robomania/`,
    reuseExistingServer: false,
  },
});
