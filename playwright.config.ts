import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  timeout: 180000,
  expect: { timeout: 30000 },
  workers: 1,
  reporter: 'list',
  outputDir: '.expo/test-results',
  use: {
    baseURL: process.env.UI_TEST_URL || 'http://localhost:8083',
    viewport: { width: 1365, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
