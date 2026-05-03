/**
 * One-time Shopify auth setup. Opens a real browser window, waits for you to log
 * into Shopify admin, then saves the session cookies so all live-store tests can
 * reuse them without logging in again.
 *
 * Run this once (or whenever your session expires):
 *   pnpm --filter @fbc/app exec playwright test --project=setup
 *
 * The saved state lives at app/playwright/.auth/shopify.json (gitignored).
 */

import { test as setup } from '@playwright/test';
import path from 'path';

const SHOPIFY_APP_URL =
  process.env.SHOPIFY_APP_URL ??
  'https://admin.shopify.com/store/fbc-dev-ft0sobbo/apps/firstbridge-analytics/overview';

const AUTH_STATE = path.join(__dirname, '../playwright/.auth/shopify.json');

setup('authenticate with Shopify admin', async ({ page }) => {
  console.log('\n─────────────────────────────────────────────');
  console.log('  ACTION REQUIRED: Log in to Shopify admin');
  console.log('─────────────────────────────────────────────');
  console.log(`  URL: ${SHOPIFY_APP_URL}`);
  console.log('  1. Complete the Shopify login in the browser that just opened.');
  console.log('  2. Wait until the FirstBridge Analytics dashboard is fully loaded.');
  console.log('  3. This script will save your session and close automatically.');
  console.log('─────────────────────────────────────────────\n');

  await page.goto(SHOPIFY_APP_URL);

  // Wait until the embedded app iframe is present and the app has loaded inside it.
  // Shopify renders the embedded app in <iframe id="app-iframe" ...>.
  // We wait for the iframe to appear, then wait for content inside it.
  const appFrame = page.frameLocator('#app-iframe');

  // The app renders "Overview" as the page heading once it has loaded.
  // Generous 3-minute timeout to allow for 2FA, email code entry, etc.
  await appFrame
    .getByText('Overview', { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout: 180_000 });

  console.log('  App loaded. Saving session cookies...');

  // Save cookies + localStorage for all Shopify domains so subsequent tests
  // skip the login screen entirely.
  await page.context().storageState({ path: AUTH_STATE });

  console.log(`  Session saved to: ${AUTH_STATE}`);
  console.log('  You can now run live-store tests with:');
  console.log('    pnpm --filter @fbc/app exec playwright test --project=shopify\n');
});
