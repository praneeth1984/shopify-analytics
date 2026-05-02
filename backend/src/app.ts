/**
 * Hono app factory. Composes routes and shared error handling.
 * Exported separately from the Worker entry so unit tests can call
 * `app.request(req)` directly without the Workers runtime.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { metricsRoutes } from "./routes/metrics.js";
import { metricsProfitRoutes } from "./routes/metrics-profit.js";
import { metricsReturnsRoutes } from "./routes/metrics-returns.js";
import { metricsGeographyRoutes } from "./routes/metrics-geography.js";
import { metricsProductsRoutes } from "./routes/metrics-products.js";
import { metricsDiscountsRoutes } from "./routes/metrics-discounts.js";
import { metricsCustomersRoutes } from "./routes/metrics-customers.js";
import { metricsPaymentsRoutes } from "./routes/metrics-payments.js";
import { exportsRoutes } from "./routes/exports.js";
import { cogsRoutes } from "./routes/cogs.js";
import { preferencesRoutes } from "./routes/preferences.js";
import { billingRoutes } from "./routes/billing.js";
import { expensesRoutes } from "./routes/expenses.js";
import { devSeedRoutes } from "./routes/dev-seed.js";
import { HttpError } from "./lib/errors.js";
import { log } from "./lib/logger.js";

// Allowed origins for CORS. The embedded app is served from Cloudflare Pages;
// Shopify admin iframes it so fetch() requests carry the Pages origin.
const ALLOWED_ORIGINS = [
  "https://firstbridge-analytics.pages.dev",
  "https://fbc-shopify-app.pages.dev",   // legacy, keep during transition
  "https://admin.shopify.com",
  // Dev origins
  "http://localhost:5173",
  "http://localhost:5174",
];

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  // CORS — must come before all routes so OPTIONS preflights are handled first.
  app.use(
    "/api/*",
    cors({
      origin: (origin) => {
        if (ALLOWED_ORIGINS.includes(origin)) return origin;
        // Allow Cloudflare Pages preview deployments
        if (/^https:\/\/[a-z0-9-]+\.firstbridge-analytics\.pages\.dev$/.test(origin)) return origin;
        if (/^https:\/\/[a-z0-9-]+\.fbc-shopify-app\.pages\.dev$/.test(origin)) return origin;
        // Allow any *.trycloudflare.com tunnel (dev CLI)
        if (/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)) return origin;
        return null;
      },
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type"],
      maxAge: 86400,
    }),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/auth", authRoutes());
  app.route("/webhooks", webhookRoutes());
  // More specific routes first so they take precedence in Hono's matcher.
  app.route("/api/metrics/profit", metricsProfitRoutes());
  app.route("/api/metrics/returns", metricsReturnsRoutes());
  app.route("/api/metrics/geography", metricsGeographyRoutes());
  app.route("/api/metrics/products", metricsProductsRoutes());
  app.route("/api/metrics/discounts", metricsDiscountsRoutes());
  app.route("/api/metrics/customers", metricsCustomersRoutes());
  app.route("/api/metrics/payments", metricsPaymentsRoutes());
  app.route("/api/metrics", metricsRoutes());
  app.route("/api/exports", exportsRoutes());
  app.route("/api/billing", billingRoutes());
  app.route("/api/cogs", cogsRoutes());
  app.route("/api/preferences", preferencesRoutes());
  app.route("/api/expenses", expensesRoutes());

  // Dev-only seeding endpoint — guarded inside the route by ENVIRONMENT check
  app.route("/api/dev", devSeedRoutes());

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      log.warn("http_error", { code: err.code, status: err.status, internal: err.message });
      return c.json(
        { error: err.code, message: err.publicMessage },
        err.status as ContentfulStatusCode,
      );
    }
    log.error("unhandled_error", { message: err.message });
    return c.json({ error: "internal_error", message: "Internal server error" }, 500);
  });

  app.notFound((c) => c.json({ error: "not_found", message: "Not found" }, 404));

  return app;
}
