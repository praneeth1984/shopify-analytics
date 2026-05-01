/**
 * Hono app factory. Composes routes and shared error handling.
 * Exported separately from the Worker entry so unit tests can call
 * `app.request(req)` directly without the Workers runtime.
 */

import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { metricsRoutes } from "./routes/metrics.js";
import { metricsProfitRoutes } from "./routes/metrics-profit.js";
import { metricsReturnsRoutes } from "./routes/metrics-returns.js";
import { cogsRoutes } from "./routes/cogs.js";
import { preferencesRoutes } from "./routes/preferences.js";
import { HttpError } from "./lib/errors.js";
import { log } from "./lib/logger.js";

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/auth", authRoutes());
  app.route("/webhooks", webhookRoutes());
  // More specific routes first so they take precedence in Hono's matcher.
  app.route("/api/metrics/profit", metricsProfitRoutes());
  app.route("/api/metrics/returns", metricsReturnsRoutes());
  app.route("/api/metrics", metricsRoutes());
  app.route("/api/cogs", cogsRoutes());
  app.route("/api/preferences", preferencesRoutes());

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
