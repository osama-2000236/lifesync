import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/qa',
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'output/qa/playwright/html', open: 'never' }],
    ['json', { outputFile: 'output/qa/playwright/results.json' }],
    ['junit', { outputFile: 'output/qa/playwright/results.xml' }],
  ],
  use: {
    baseURL: process.env.QA_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  outputDir: 'output/qa/playwright/artifacts',
});
