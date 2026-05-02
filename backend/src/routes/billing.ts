/**
 * Billing routes — App Store requirement 1.2.x.
 *
 * This app uses Shopify Managed Pricing. Shopify owns the plan selection UI;
 * the app never calls appSubscriptionCreate directly. Both upgrade and
 * downgrade/cancel are handled by redirecting the merchant to Shopify's
 * pricing page at /admin/charges/{apiKey}/pricing_plans.
 *
 *   POST /api/billing/manage   return the Shopify Managed Pricing page URL
 *   GET  /api/billing/status   report the current resolved plan
 *
 * Plan resolution source of truth: Billing API via getPlanCached (KV-cached).
 * Shopify fires app_subscriptions/update webhooks on any plan change, which
 * invalidates the KV cache (handled in routes/webhooks.ts).
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { getPlanCached, invalidatePlanCache } from "../plan/get-plan.js";
import { log } from "../lib/logger.js";

export function billingRoutes(authOverride?: ReturnType<typeof requireSessionToken>) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", authOverride ?? requireSessionToken());

  /**
   * POST /api/billing/manage
   * Returns the Shopify Managed Pricing page URL. The frontend navigates
   * window.top there so the merchant can upgrade, downgrade, or cancel
   * entirely within Shopify's own billing UI.
   */
  app.post("/manage", async (c) => {
    const shopDomain = c.get("shopDomain");
    const apiKey = c.env.SHOPIFY_API_KEY;

    // Drop the cache so the next status read goes straight to the Billing API
    // and picks up whatever plan the merchant selects on the pricing page.
    await invalidatePlanCache(c.env.BULK_OPS_KV, shopDomain);

    // Return URL: use the admin.shopify.com embedded-app URL so the merchant
    // lands back inside Shopify admin (not the old myshopify.com path which
    // opens Shopify's own app-management page instead of the embedded app).
    // admin.shopify.com propagates query params into the iframe, so
    // consumeBillingReturnParam() in App.tsx detects ?billing=success.
    const shopAlias = shopDomain.replace(/\.myshopify\.com$/, "");
    const returnUrl = `https://admin.shopify.com/store/${shopAlias}/apps/firstbridge-analytics?billing=success`;
    const pricingUrl = `https://${shopDomain}/admin/charges/${apiKey}/pricing_plans?return_url=${encodeURIComponent(returnUrl)}`;
    log.info("billing.manage_redirect", { pricingUrl });
    return c.json({ pricingUrl });
  });

  /**
   * GET /api/billing/status
   * Cached plan lookup (KV → Billing API). The frontend uses this to render
   * the current plan badge and upgrade/manage CTAs.
   */
  app.get("/status", async (c) => {
    const plan = await getPlanCached(c);
    return c.json({ plan });
  });

  return app;
}
