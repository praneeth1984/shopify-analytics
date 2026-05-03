/**
 * Order-sync webhook handlers — keep D1 analytics tables in sync with Shopify.
 *
 * Pattern (same as webhooks.ts):
 *   1. Read raw body FIRST.
 *   2. HMAC-verify. Reject with 401 on HMAC failure only.
 *   3. Parse JSON. Do work. Return 200 even on processing errors (log + ack).
 *
 * Shopify REST order webhooks are snake_case; we map to our SyncOrder type
 * via webhookPayloadToSync() so the sync helper stays GraphQL-shaped.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { verifyWebhook } from "../shopify/webhook-verify.js";
import { upsertOrderToD1, deleteOrderFromD1, type SyncOrder } from "../sync/order-to-d1.js";
import { log } from "../lib/logger.js";

type OrderPayload = {
  id: number;
  created_at: string;
  cancelled_at: string | null;
  landing_site?: string | null;
  referring_site?: string | null;
  total_price: string;
  currency: string;
  tax_lines: Array<{ title: string; rate: number; price: string }>;
  shipping_address?: { country_code?: string; province_code?: string } | null;
  line_items: Array<{
    product_id: number | null;
    variant_id: number | null;
    quantity: number;
    price: string;
  }>;
};

function numericGid(type: string, id: number | null): string | null {
  if (id === null) return null;
  return `gid://shopify/${type}/${id}`;
}

function webhookPayloadToSync(p: OrderPayload): SyncOrder {
  return {
    id: numericGid("Order", p.id) ?? String(p.id),
    createdAt: p.created_at,
    cancelledAt: p.cancelled_at,
    landingPageUrl: p.landing_site ?? null,
    referringSite: p.referring_site ?? null,
    totalPriceSet: { shopMoney: { amount: p.total_price, currencyCode: p.currency } },
    taxLines: (p.tax_lines ?? []).map((tl) => ({
      title: tl.title,
      rate: tl.rate,
      priceSet: { shopMoney: { amount: tl.price, currencyCode: p.currency } },
    })),
    shippingAddress: p.shipping_address
      ? { countryCode: p.shipping_address.country_code, province: p.shipping_address.province_code }
      : null,
    lineItems: {
      edges: (p.line_items ?? []).map((li) => ({
        node: {
          product: li.product_id ? { id: numericGid("Product", li.product_id)! } : null,
          variant: li.variant_id ? { id: numericGid("ProductVariant", li.variant_id)! } : null,
          quantity: li.quantity,
          originalTotalPriceSet: {
            shopMoney: {
              amount: String(parseFloat(li.price) * li.quantity),
              currencyCode: p.currency,
            },
          },
        },
      })),
    },
  };
}

export function webhooksD1Routes() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/orders/create", async (c) => {
    const sig = c.req.header("x-shopify-hmac-sha256");
    const shop = c.req.header("x-shopify-shop-domain") ?? "";
    const raw = await c.req.arrayBuffer();
    await verifyWebhook({ rawBody: raw, signatureHeader: sig, apiSecret: c.env.SHOPIFY_API_SECRET });
    try {
      if (shop) {
        const payload = JSON.parse(new TextDecoder().decode(raw)) as OrderPayload;
        await upsertOrderToD1(c.env.FEEDBACK_DB, shop, webhookPayloadToSync(payload));
        log.info("webhook.d1.order_create", { shop, orderId: payload.id });
      }
    } catch (err) {
      log.warn("webhook.d1.order_create_failed", { message: err instanceof Error ? err.message : "unknown" });
    }
    return c.body(null, 200);
  });

  app.post("/orders/updated", async (c) => {
    const sig = c.req.header("x-shopify-hmac-sha256");
    const shop = c.req.header("x-shopify-shop-domain") ?? "";
    const raw = await c.req.arrayBuffer();
    await verifyWebhook({ rawBody: raw, signatureHeader: sig, apiSecret: c.env.SHOPIFY_API_SECRET });
    try {
      if (shop) {
        const payload = JSON.parse(new TextDecoder().decode(raw)) as OrderPayload;
        await upsertOrderToD1(c.env.FEEDBACK_DB, shop, webhookPayloadToSync(payload));
        log.info("webhook.d1.order_updated", { shop, orderId: payload.id });
      }
    } catch (err) {
      log.warn("webhook.d1.order_updated_failed", { message: err instanceof Error ? err.message : "unknown" });
    }
    return c.body(null, 200);
  });

  app.post("/orders/cancelled", async (c) => {
    const sig = c.req.header("x-shopify-hmac-sha256");
    const shop = c.req.header("x-shopify-shop-domain") ?? "";
    const raw = await c.req.arrayBuffer();
    await verifyWebhook({ rawBody: raw, signatureHeader: sig, apiSecret: c.env.SHOPIFY_API_SECRET });
    try {
      if (shop) {
        const payload = JSON.parse(new TextDecoder().decode(raw)) as OrderPayload;
        await upsertOrderToD1(c.env.FEEDBACK_DB, shop, webhookPayloadToSync(payload));
        log.info("webhook.d1.order_cancelled", { shop, orderId: payload.id });
      }
    } catch (err) {
      log.warn("webhook.d1.order_cancelled_failed", { message: err instanceof Error ? err.message : "unknown" });
    }
    return c.body(null, 200);
  });

  app.post("/orders/delete", async (c) => {
    const sig = c.req.header("x-shopify-hmac-sha256");
    const shop = c.req.header("x-shopify-shop-domain") ?? "";
    const raw = await c.req.arrayBuffer();
    await verifyWebhook({ rawBody: raw, signatureHeader: sig, apiSecret: c.env.SHOPIFY_API_SECRET });
    try {
      if (shop) {
        const payload = JSON.parse(new TextDecoder().decode(raw)) as { id: number };
        const orderId = numericGid("Order", payload.id) ?? String(payload.id);
        await deleteOrderFromD1(c.env.FEEDBACK_DB, shop, orderId);
        log.info("webhook.d1.order_delete", { shop, orderId: payload.id });
      }
    } catch (err) {
      log.warn("webhook.d1.order_delete_failed", { message: err instanceof Error ? err.message : "unknown" });
    }
    return c.body(null, 200);
  });

  return app;
}
