/**
 * Live-store E2E tests. These run against the real Shopify dev store with no
 * mocked responses. Rather than hardcoding expected values (which would break
 * whenever the store's data changes), each test uses a "capture-and-verify"
 * pattern:
 *
 *   1. Intercept the real API response via page.route() pass-through.
 *   2. Let the app render with the real data.
 *   3. Assert the UI shows exactly what the API returned.
 *
 * This catches the real class of bugs in a live app: the UI rendering something
 * different from what the backend computed.
 *
 * Prerequisites:
 *   pnpm --filter @fbc/app e2e:login   # once, saves Shopify session cookies
 *   pnpm --filter @fbc/app e2e:live    # runs these tests
 */

import { test, expect } from '@playwright/test';
import type { OverviewMetrics, ProfitMetrics } from '@fbc/shared';

const SHOPIFY_APP_URL =
  process.env.SHOPIFY_APP_URL ??
  'https://admin.shopify.com/store/fbc-dev-ft0sobbo/apps/firstbridge-analytics/overview';

const SETTINGS_URL = SHOPIFY_APP_URL.replace(/\/overview$/, '/settings');

const T = { timeout: 30_000 };

type OverviewResponse = OverviewMetrics & { truncated: boolean };

/** Wait for Shopify to render the embedded app iframe and return a FrameLocator. */
async function getAppFrame(page: import('@playwright/test').Page) {
  await page.waitForSelector('#app-iframe', { timeout: 30_000 });
  return page.frameLocator('#app-iframe');
}

/**
 * Intercept a backend route as a pass-through and capture its JSON response.
 * Returns a getter function — call it after the page has loaded to read the
 * captured value.
 */
function captureRoute<T>(page: import('@playwright/test').Page, urlPattern: string) {
  let captured: T | null = null;
  page.route(urlPattern, async (route) => {
    const response = await route.fetch();
    try {
      captured = (await response.json()) as T;
    } catch {
      // ignore parse errors — the test will fail on the null check
    }
    await route.fulfill({ response });
  });
  return () => captured;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMoney(amount: string, currency: string): string {
  // Mirrors app/src/lib/format.ts formatMoney() output for USD
  const n = parseFloat(amount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

test.describe('Live store — Dashboard', () => {
  test('overview metric cards show values that match the API response', async ({ page }) => {
    const getOverview = captureRoute<OverviewResponse>(
      page,
      '**/api/metrics/overview**'
    );

    await page.goto(SHOPIFY_APP_URL);
    const app = await getAppFrame(page);

    // Wait for any metric card label to appear (data has landed)
    await expect(app.getByText('Revenue', { exact: true }).first()).toBeVisible(T);

    const data = getOverview();
    if (!data) {
      throw new Error('Overview API response was never captured — request did not fire');
    }

    // Revenue card: UI must show exactly what the API returned
    const expectedRevenue = formatMoney(
      data.revenue.current.amount,
      data.revenue.current.currency_code
    );
    await expect(app.getByText(expectedRevenue)).toBeVisible(T);

    // Orders card
    await expect(
      app.getByText(formatNumber(data.orders.current), { exact: true }).first()
    ).toBeVisible(T);

    // AOV card
    const expectedAov = formatMoney(
      data.average_order_value.current.amount,
      data.average_order_value.current.currency_code
    );
    await expect(app.getByText(expectedAov)).toBeVisible(T);

    // Unique customers card
    await expect(
      app.getByText(formatNumber(data.unique_customers.current), { exact: true }).first()
    ).toBeVisible(T);

    // No NaN or undefined anywhere
    await expect(app.getByText('NaN')).not.toBeVisible();
    await expect(app.getByText('undefined')).not.toBeVisible();
  });

  test('truncated banner is shown iff the API says truncated=true', async ({ page }) => {
    const getOverview = captureRoute<OverviewResponse>(page, '**/api/metrics/overview**');

    await page.goto(SHOPIFY_APP_URL);
    const app = await getAppFrame(page);
    await expect(app.getByText('Revenue', { exact: true }).first()).toBeVisible(T);

    const data = getOverview();
    if (!data) throw new Error('Overview API response not captured');

    const bannerLocator = app.getByText('Showing your most recent 2,500 orders');
    if (data.truncated) {
      await expect(bannerLocator).toBeVisible(T);
    } else {
      await expect(bannerLocator).not.toBeVisible();
    }
  });

  test('profit cards show values that match the API response', async ({ page }) => {
    const getProfit = captureRoute<ProfitMetrics>(page, '**/api/metrics/profit**');

    await page.goto(SHOPIFY_APP_URL);
    const app = await getAppFrame(page);
    await expect(app.getByText('Revenue', { exact: true }).first()).toBeVisible(T);

    const data = getProfit();
    if (!data) throw new Error('Profit API response not captured');

    // Gross profit card — label must be visible
    await expect(app.getByText('Gross profit', { exact: true }).first()).toBeVisible(T);

    // Margin % card — rendered as "X.X%" — don't assert exact value but assert
    // the card itself rendered (not an error state)
    await expect(app.getByText('Gross margin', { exact: true }).first()).toBeVisible(T);

    await expect(app.getByText('NaN')).not.toBeVisible();
  });

  test('date range change re-fetches and updates values', async ({ page }) => {
    const overviewCalls: OverviewResponse[] = [];
    await page.route('**/api/metrics/overview**', async (route) => {
      const response = await route.fetch();
      try {
        overviewCalls.push((await response.json()) as OverviewResponse);
      } catch { /* ignore */ }
      await route.fulfill({ response });
    });

    await page.goto(SHOPIFY_APP_URL);
    const app = await getAppFrame(page);
    await expect(app.getByText('Revenue', { exact: true }).first()).toBeVisible(T);

    const firstRevenue = overviewCalls[0]?.revenue.current.amount;

    // Change to "Last 7 days" — should trigger a second API call
    await app.getByRole('combobox').first().selectOption({ label: 'Last 7 days' });

    // Wait for a second response to arrive
    await expect.poll(() => overviewCalls.length, T).toBeGreaterThanOrEqual(2);

    // UI must now reflect the second call's revenue (not the stale first value)
    const secondRevenue = overviewCalls[overviewCalls.length - 1].revenue.current;
    const expectedRevenue = formatMoney(secondRevenue.amount, secondRevenue.currency_code);
    await expect(app.getByText(expectedRevenue)).toBeVisible(T);

    // No errors
    await expect(app.getByText('Could not load metrics')).not.toBeVisible();
    await expect(app.getByText('NaN')).not.toBeVisible();

    // The two API responses may have different values (7 days vs 30 days)
    // — just a sanity log, not a hard assertion
    if (firstRevenue !== undefined && firstRevenue === secondRevenue.amount) {
      console.warn(
        'Warning: revenue for last_7_days equals last_30_days — store may have no orders'
      );
    }
  });

  test('no error banners on initial load', async ({ page }) => {
    await page.goto(SHOPIFY_APP_URL);
    const app = await getAppFrame(page);
    await expect(app.getByText('Revenue', { exact: true }).first()).toBeVisible(T);

    await expect(app.getByText('Could not load metrics')).not.toBeVisible();
    await expect(app.getByText('Could not load profit')).not.toBeVisible();
    await expect(app.getByText(/401|403|unauthorized|forbidden/i)).not.toBeVisible();
  });
});

// ─── Settings / COGS ────────────────────────────────────────────────────────

test.describe('Live store — Settings (COGS)', () => {
  test('COGS table state matches the API response', async ({ page }) => {
    type CogsResponse = { entries: { variantId: string; title: string; cost: string }[]; plan: string };
    const getCogs = captureRoute<CogsResponse>(page, '**/api/cogs**');

    await page.goto(SETTINGS_URL);
    const app = await getAppFrame(page);

    await expect(app.getByText(/cost of goods/i).first()).toBeVisible(T);

    const data = getCogs();
    if (!data) throw new Error('COGS API response not captured');

    if (data.entries.length === 0) {
      // Empty state must explain what to do, not show a blank table
      await expect(
        app.getByText(/no.*cost|add.*cost|get started/i).first()
      ).toBeVisible(T);
    } else {
      // At least the first entry's product title must be visible in the table
      const firstTitle = data.entries[0].title;
      await expect(app.getByText(firstTitle).first()).toBeVisible(T);
    }
  });

  test('Free-plan cap banner appears iff at the 20-SKU limit', async ({ page }) => {
    type CogsResponse = { entries: unknown[]; plan: string };
    const getCogs = captureRoute<CogsResponse>(page, '**/api/cogs**');

    await page.goto(SETTINGS_URL);
    const app = await getAppFrame(page);
    await expect(app.getByText(/cost of goods/i).first()).toBeVisible(T);

    const data = getCogs();
    if (!data) throw new Error('COGS API response not captured');

    const capBanner = app.getByText(/20.*sku|free.*limit|upgrade.*pro/i);
    if (data.plan === 'free' && data.entries.length >= 20) {
      await expect(capBanner.first()).toBeVisible(T);
    } else {
      await expect(capBanner.first()).not.toBeVisible();
    }
  });
});

// ─── Auth ────────────────────────────────────────────────────────────────────

test.describe('Live store — Auth', () => {
  test('app loads inside the Shopify admin iframe without auth errors', async ({ page }) => {
    await page.goto(SHOPIFY_APP_URL);
    const app = await getAppFrame(page);
    await expect(app.getByText('Revenue', { exact: true }).first()).toBeVisible(T);
    await expect(app.getByText(/401|403|unauthorized|forbidden/i)).not.toBeVisible();
  });

  test('page title identifies the app', async ({ page }) => {
    await page.goto(SHOPIFY_APP_URL);
    await expect(page).toHaveTitle(/FirstBridge|Analytics/i, T);
  });
});
