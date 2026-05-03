import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:8787';

const ROUTES = [
  '/api/metrics/overview?from=2026-04-01&to=2026-04-30',
  '/api/metrics/profit?from=2026-04-01&to=2026-04-30',
  '/api/metrics/returns/by-product?from=2026-04-01&to=2026-04-30',
  '/api/metrics/returns/net-revenue?from=2026-04-01&to=2026-04-30',
  '/api/metrics/returns/reasons?from=2026-04-01&to=2026-04-30',
  '/api/metrics/returns/resolution?from=2026-04-01&to=2026-04-30',
  '/api/cogs',
  '/api/cogs/export',
  '/api/preferences',
];

test.describe('Backend auth guards', () => {
  for (const route of ROUTES) {
    test(`rejects unauthenticated GET ${route}`, async ({ request }) => {
      const res = await request.get(`${BACKEND}${route}`);
      expect(res.status()).toBe(401);
    });

    test(`rejects tampered JWT on GET ${route}`, async ({ request }) => {
      const res = await request.get(`${BACKEND}${route}`, {
        headers: { Authorization: 'Bearer tampered.jwt.payload' },
      });
      expect(res.status()).toBe(401);
    });
  }

  test('rejects POST /api/cogs/upsert without JWT', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/cogs/upsert`, {
      data: { variantId: 'gid://shopify/ProductVariant/1', cost: '5.00' },
    });
    expect(res.status()).toBe(401);
  });

  test('rejects GDPR webhook with tampered HMAC', async ({ request }) => {
    const res = await request.post(`${BACKEND}/webhooks/compliance`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Topic': 'customers/data_request',
        'X-Shopify-Hmac-Sha256': 'invalidsignature==',
        'X-Shopify-Shop-Domain': 'test.myshopify.com',
      },
      data: JSON.stringify({ shop_id: 1, orders_requested: [] }),
    });
    expect(res.status()).toBe(401);
  });

  test('rejects app/uninstalled webhook with tampered HMAC', async ({ request }) => {
    const res = await request.post(`${BACKEND}/webhooks/app/uninstalled`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Topic': 'app/uninstalled',
        'X-Shopify-Hmac-Sha256': 'invalidsignature==',
        'X-Shopify-Shop-Domain': 'test.myshopify.com',
      },
      data: JSON.stringify({ id: 12345 }),
    });
    expect(res.status()).toBe(401);
  });
});
