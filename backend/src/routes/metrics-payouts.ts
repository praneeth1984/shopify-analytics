import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { getPlanCached } from "../plan/get-plan.js";
import { computePayoutsReport } from "../metrics/payouts.js";

export function metricsPayoutsRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const plan = await getPlanCached(c);
    const graphql = c.get("graphql");
    const result = await computePayoutsReport(graphql, plan);
    return c.json(result);
  });

  return app;
}
