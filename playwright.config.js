import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  // Os dois specs compartilham o preview local e exercitam fixtures de estado;
  // manter um worker evita pressão de memória sem reduzir a cobertura dos 21 testes.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4320',
    browserName: 'chromium',
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'node scripts/serve-preview.mjs',
        url: 'http://127.0.0.1:4320/',
        reuseExistingServer: false,
        timeout: 30_000
      }
});
