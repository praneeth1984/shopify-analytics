import { defineConfig, devices } from '@playwright/test';

const SHOPIFY_APP_URL =
  process.env.SHOPIFY_APP_URL ??
  'https://admin.shopify.com/store/fbc-dev-ft0sobbo/apps/firstbridge-analytics/overview';

export default defineConfig({
  testDir: './e2e',

  // Auth setup must run before the 'shopify' project.
  // Run mocked tests always; run live-store tests only when the auth state exists
  // or when explicitly requested with --project=shopify.
  projects: [
    {
      name: 'setup',
      testMatch: '**/shopify-login.setup.ts',
      use: { ...devices['Desktop Chrome'], headless: false },
    },
    {
      name: 'mocked',
      testMatch: ['**/auth-guards.spec.ts', '**/dashboard-smoke.spec.ts'],
      use: { ...devices['Desktop Chrome'], headless: true },
    },
    {
      name: 'shopify',
      testMatch: '**/realstore.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        storageState: 'playwright/.auth/shopify.json',
      },
    },
  ],

  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Expose the store URL to tests via env
  globalSetup: undefined,
  webServer: [
    {
      command: 'pnpm --filter @fbc/backend dev',
      url: 'http://localhost:8787/health',
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: 'pnpm --filter @fbc/app dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],

  // Make the store URL available as process.env inside tests
  reporter: [['list'], ['html', { open: 'never' }]],
});

export { SHOPIFY_APP_URL };
