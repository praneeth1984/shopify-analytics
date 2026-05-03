import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { getPlanCached } from "../plan/get-plan.js";
import { computeGiftCards } from "../metrics/gift-cards.js";

export function metricsGiftCardsRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const plan = await getPlanCached(c);
    const graphql = c.get("graphql");
    const result = await computeGiftCards(graphql, plan);
    return c.json(result);
  });

  return app;
}
