/**
 * OAuth install routes.
 *
 * Modern embedded apps configured with `embedded_app_direct_api_access = true` use
 * Shopify's managed install — Shopify handles the install UI and the merchant lands
 * back in our embedded app. These routes exist for the legacy / direct-link case.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { isValidShopDomain } from "../shopify/shop-domain.js";
import { installRedirectUrl, verifyOAuthCallback, exchangeCodeForToken } from "../shopify/oauth.js";
import { registerRuntimeWebhooks } from "../shopify/webhook-register.js";
import { BadRequest } from "../lib/errors.js";
import { log } from "../lib/logger.js";

const SCOPES = "read_products,read_orders,read_all_orders,read_customers,read_inventory,read_reports,read_returns";

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  return hex;
}

export function authRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/install", (c) => {
    const shop = c.req.query("shop");
    if (!isValidShopDomain(shop)) throw BadRequest("invalid shop param");
    const env = c.env;
    const state = randomState();
    const redirectUri = `${env.SHOPIFY_APP_URL}/auth/callback`;
    const url = installRedirectUrl({
      shopDomain: shop,
      apiKey: env.SHOPIFY_API_KEY,
      scopes: SCOPES,
      redirectUri,
      state,
    });
    return c.redirect(url, 302);
  });

  app.get("/callback", async (c) => {
    const env = c.env;
    const url = new URL(c.req.url);
    await verifyOAuthCallback({ query: url.searchParams, apiSecret: env.SHOPIFY_API_SECRET });

    const shop = url.searchParams.get("shop");
    const code = url.searchParams.get("code");
    if (!isValidShopDomain(shop)) throw BadRequest("invalid shop param");
    if (!code) throw BadRequest("missing code");

    // We do NOT persist this offline token in Phase 1 — embedded app requests use
    // Token Exchange. The presence of a successful code exchange just confirms the
    // install succeeded. Future phases that need background API calls will store
    // the encrypted token in KV.
    const tokenRes = await exchangeCodeForToken({
      shopDomain: shop,
      code,
      apiKey: env.SHOPIFY_API_KEY,
      apiSecret: env.SHOPIFY_API_SECRET,
    });

    // Register runtime webhooks (uninstall + subscription updates). Managed-install
    // flows declare the same subscriptions in shopify.app.toml; this is the
    // belt-and-braces path for direct-link installs that hit /auth/callback.
    await registerRuntimeWebhooks({
      env,
      shopDomain: shop,
      accessToken: tokenRes.access_token,
    });

    log.info("oauth.install_completed", { shop });
    const adminUrl = `https://${shop}/admin/apps/${env.SHOPIFY_API_KEY}`;
    return c.redirect(adminUrl, 302);
  });

  return app;
}
