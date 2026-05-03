/**
 * GET /api/metrics/live
 *
 * Returns "today so far" — orders in the last 24h, gross revenue, AOV.
 * No plan gating; always free. No date range parameters.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { computeLiveMetrics } from "../metrics/live.js";

export function metricsLiveRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const graphql = c.get("graphql");
    const result = await computeLiveMetrics(graphql);
    return c.json(result);
  });

  return app;
}
