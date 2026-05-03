import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { getPlanCached } from "../plan/get-plan.js";
import { computeCustomerList } from "../metrics/customer-list.js";

export function metricsCustomerListRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const plan = await getPlanCached(c);
    const graphql = c.get("graphql");
    const result = await computeCustomerList(graphql, plan);
    return c.json(result);
  });

  return app;
}
