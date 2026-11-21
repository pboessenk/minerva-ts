import { defineConfig, devices } from '@playwright/test';

const CI = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.ts',
  globalSetup: './test/global-setup.ts',
  // Every test gets its own server and workspace copy, so all of them can run at once.
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
});
