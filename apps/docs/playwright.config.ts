import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:4321',
  },
  webServer: {
    command: 'pnpm preview',
    url: 'http://127.0.0.1:4321/lessons/javascript/functions/closure-private-state/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
