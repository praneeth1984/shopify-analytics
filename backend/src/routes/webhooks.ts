/**
 * Webhook handlers — mandatory + GDPR + plan/billing.
 *
 * Every handler follows the same pattern:
 *   1. Read the raw body (NOT parsed JSON yet).
 *   2. Verify HMAC against the raw body bytes.
 *   3. Parse JSON. Do work.
 *   4. Return 200. Failures other than HMAC return 200 with logging — Shopify
 *      retries on non-2xx, and we don't want a parsing bug to spam retries.
 *
 * Phase 1 holds no merchant PII; the GDPR/uninstall handlers are mostly acks.
 * The plan-related handlers (`app_subscriptions/update`, `app/uninstalled`)
 * keep the KV plan-resolution cache (`plan:{shop_domain}`) in sync so the
 * embedded app sees plan changes immediately rather than waiting for the
 * 30-second TTL to lapse.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { verifyWebhook } from "../shopify/webhook-verify.js";
import { log } from "../lib/logger.js";
import {
  PLAN_CACHE_TTL_SECONDS,
  derivePlan,
  invalidatePlanCache,
  planCacheKey,
} from "../plan/get-plan.js";

type AppSubscriptionPayload = {
  app_subscription?: {
    name?: string;
    status?: string;
  };
};

/**
 * Best-effort: scrub every shop-scoped KV key after uninstall. Right now
 * those are `plan:{shop}` and any `bulk:{shop}:*` cursors (Phase 1.5). Each
 * deletion is independent — failures are logged but never block the ack.
 */
async function clearShopScopedKv(kv: KVNamespace, shop: string): Promise<void> {
  await invalidatePlanCache(kv, shop);

  // List + delete `bulk:{shop}:*` cursors. KV.list() supports a prefix filter,
  // but list pagination is bounded; a single page is sufficient because we
  // expect at most a handful of in-flight cursors per shop.
  try {
    const prefix = `bulk:${shop}:`;
    const list = await kv.list({ prefix });
    await Promise.all(list.keys.map((k) => kv.delete(k.name)));
  } catch (err) {
    log.warn("webhook.kv_bulk_clear_failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}

export function webhookRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  // Generic compliance endpoint — Shopify routes all three GDPR topics to it via shopify.app.toml.
  app.post("/compliance", async (c) => {
    const env = c.env;
    const sig = c.req.header("x-shopify-hmac-sha256");
    const topic = c.req.header("x-shopify-topic") ?? "unknown";
    const raw = await c.req.arrayBuffer();
    await verifyWebhook({ rawBody: raw, signatureHeader: sig, apiSecret: env.SHOPIFY_API_SECRET });

    // We do not store customer or shop PII on our infrastructure. Redact requests
    // are satisfied by acknowledging the webhook. Data-request webhooks: we have
    // nothing to return; respond per Shopify's documented expectation (200 OK).
    log.info("webhook.compliance", { topic });
    return c.body(null, 200);
  });

  app.post("/app/uninstalled", async (c) => {
    const env = c.env;
    const sig = c.req.header("x-shopify-hmac-sha256");
    const raw = await c.req.arrayBuffer();
    // HMAC verify FIRST — non-negotiable. Body parsing happens after verification.
    await verifyWebhook({ rawBody: raw, signatureHeader: sig, apiSecret: env.SHOPIFY_API_SECRET });

    // Prefer the documented `x-shopify-shop-domain` header; fall back to body.
    let shop = c.req.header("x-shopify-shop-domain") ?? "";
    if (!shop) {
      try {
        const body = JSON.parse(new TextDecoder().decode(raw)) as { domain?: string };
        shop = body.domain ?? "";
      } catch {
        // ignore — we don't depend on body parse for ack.
      }
    }

    if (shop && env.BULK_OPS_KV) {
      await clearShopScopedKv(env.BULK_OPS_KV, shop);
    }
    log.info("webhook.app_uninstalled", { shop });
    return c.body(null, 200);
  });

  /**
   * `app_subscriptions/update` — fired on subscription create / activate /
   * cancel / expire / decline / frozen. We:
   *   1. HMAC-verify the raw body (always first).
   *   2. Derive the new plan from the payload's `app_subscription` block.
   *      Note: this single payload reflects ONE subscription. If the merchant
   *      has multiple, the next plan resolution will re-query Billing API; we
   *      conservatively only upgrade the cache when the payload explicitly
   *      indicates an active higher tier, otherwise we invalidate so the
   *      next embedded request re-derives from Billing API.
   */
  app.post("/app_subscriptions/update", async (c) => {
    const env = c.env;
    const sig = c.req.header("x-shopify-hmac-sha256");
    const raw = await c.req.arrayBuffer();
    await verifyWebhook({ rawBody: raw, signatureHeader: sig, apiSecret: env.SHOPIFY_API_SECRET });

    let shop = c.req.header("x-shopify-shop-domain") ?? "";
    let payload: AppSubscriptionPayload = {};
    try {
      payload = JSON.parse(new TextDecoder().decode(raw)) as AppSubscriptionPayload;
    } catch {
      // ignore — we still ack
    }
    if (!shop) {
      const maybeDomain = (payload as unknown as { domain?: string }).domain;
      if (typeof maybeDomain === "string") shop = maybeDomain;
    }

    if (!shop || !env.BULK_OPS_KV) {
      log.info("webhook.app_subscriptions_update_noop", { shop_present: Boolean(shop) });
      return c.body(null, 200);
    }

    const sub = payload.app_subscription;
    if (sub && typeof sub.name === "string" && typeof sub.status === "string") {
      const plan = derivePlan([{ name: sub.name, status: sub.status }]);
      // Re-cache derived plan with the same TTL so the embedded app reflects
      // the change on the next request without waiting on the old TTL.
      await env.BULK_OPS_KV.put(
        planCacheKey(shop),
        JSON.stringify({ plan, checkedAt: new Date().toISOString() }),
        { expirationTtl: PLAN_CACHE_TTL_SECONDS },
      );
      log.info("webhook.app_subscriptions_update_cached", { shop, plan });
    } else {
      // Unparseable payload — invalidate so the next request re-derives from Billing API.
      await invalidatePlanCache(env.BULK_OPS_KV, shop);
      log.info("webhook.app_subscriptions_update_invalidated", { shop });
    }

    return c.body(null, 200);
  });

  return app;
}
