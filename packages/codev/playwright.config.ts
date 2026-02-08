/**
 * Playwright configuration for dashboard E2E tests.
 *
 * Run with: npx playwright test
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/agent-farm/__tests__/e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4200',
  },
  // Dashboard must be started manually before running these tests:
  //   af dash start --no-browser
  // Or use the webServer option below for CI:
  // webServer: {
  //   command: 'af dash start --no-browser',
  //   port: 4200,
  //   reuseExistingServer: true,
  // },
});
