import { test, expect } from '@playwright/test';

const money = (amount: string) => ({ amount, currency_code: 'USD' });
const metricValue = <T>(v: T) => ({ current: v, previous: v, delta_pct: 0 });

const overviewFixture = {
  range: { preset: 'last_7_days', start: '2026-04-24', end: '2026-05-01' },
  comparison: 'previous_period',
  revenue: metricValue(money('12345.67')),
  orders: metricValue(42),
  average_order_value: metricValue(money('293.94')),
  unique_customers: metricValue(38),
  conversion_rate_pct: null,
  pending_returns: { count: 0, value: null },
  granularity: 'day',
  revenue_series: [],
  orders_series: [],
  revenue_by_dow: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
    dow,
    label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow],
    revenue_minor: 0,
    orders: 0,
  })),
  return_rate_series: [],
  new_customers: 30,
  returning_customers: 8,
  new_customer_revenue: money('9000.00'),
  returning_customer_revenue: money('3345.67'),
  new_customer_aov: money('300.00'),
  returning_customer_aov: money('418.21'),
  truncated: false,
};

const liveFixture = {
  orders: 3,
  gross_revenue: money('450.00'),
  aov: money('150.00'),
  as_of: '2026-05-01T12:00:00Z',
  window_start: '2026-04-30T12:00:00Z',
  window_end: '2026-05-01T12:00:00Z',
};

// Stub every API route the Dashboard touches so no call leaks to the real backend.
async function stubAllRoutes(page: import('@playwright/test').Page, overviewOverride = {}) {
  await page.route('**/api/metrics/overview**', (route) =>
    route.fulfill({ json: { ...overviewFixture, ...overviewOverride } })
  );
  await page.route('**/api/metrics/profit**', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/metrics/live**', (route) =>
    route.fulfill({ json: liveFixture })
  );
  await page.route('**/api/metrics/returns/**', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/preferences**', (route) =>
    route.fulfill({ json: {} })
  );
}

const TIMEOUT = { timeout: 10000 };

test.describe('Dashboard smoke tests', () => {
  test('renders all four metric cards', async ({ page }) => {
    await stubAllRoutes(page);
    await page.goto('/');

    await expect(page.getByText('Revenue', { exact: true }).first()).toBeVisible(TIMEOUT);
    await expect(page.getByText('Orders', { exact: true }).first()).toBeVisible(TIMEOUT);
    await expect(page.getByText('Average order value', { exact: true }).first()).toBeVisible(TIMEOUT);
    await expect(page.getByText('Unique customers', { exact: true }).first()).toBeVisible(TIMEOUT);
  });

  test('does NOT show partial-results banner when truncated=false', async ({ page }) => {
    await stubAllRoutes(page, { truncated: false });
    await page.goto('/');

    // Wait for data to arrive before asserting absence
    await expect(page.getByText('Revenue')).toBeVisible(TIMEOUT);
    await expect(page.getByText('Showing your most recent 2,500 orders')).not.toBeVisible();
  });

  test('shows partial-results banner when truncated=true', async ({ page }) => {
    await stubAllRoutes(page, { truncated: true });
    await page.goto('/');

    await expect(page.getByText('Showing your most recent 2,500 orders')).toBeVisible(TIMEOUT);
  });

  test('shows skeleton cards while overview is loading', async ({ page }) => {
    let unblock: () => void;
    const blocker = new Promise<void>((r) => { unblock = r; });

    // Block only the overview; let everything else resolve immediately
    await page.route('**/api/metrics/overview**', async (route) => {
      await blocker;
      await route.fulfill({ json: overviewFixture });
    });
    await page.route('**/api/metrics/profit**', (route) => route.fulfill({ json: {} }));
    await page.route('**/api/metrics/live**', (route) => route.fulfill({ json: liveFixture }));
    await page.route('**/api/metrics/returns/**', (route) => route.fulfill({ json: {} }));
    await page.route('**/api/preferences**', (route) => route.fulfill({ json: {} }));

    await page.goto('/');

    // While blocked: skeleton label text should be present (SkeletonCard renders the label)
    await expect(page.getByText('Revenue').first()).toBeVisible(TIMEOUT);
    // The actual MetricCard value ("$12,345.67") should NOT be visible yet
    await expect(page.getByText('$12,345.67')).not.toBeVisible();

    unblock!();

    // After unblocking: the real value should appear
    await expect(page.getByText('$12,345.67')).toBeVisible(TIMEOUT);
  });
});
