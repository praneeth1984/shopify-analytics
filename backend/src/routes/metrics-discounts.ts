import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { fetchOrdersForRange } from "../metrics/orders-fetch.js";
import { computeDiscountCodes } from "../metrics/discount-codes.js";
import { clampRangeForPlan } from "../metrics/history-clamp.js";
import { getPlanCached } from "../plan/get-plan.js";
import { BadRequest } from "../lib/errors.js";
import type { DateRangePreset } from "@fbc/shared";

const VALID_PRESETS: DateRangePreset[] = [
  "today", "yesterday", "last_7_days", "last_30_days",
  "last_90_days", "month_to_date", "year_to_date", "custom",
];

const SHOP_CURRENCY_QUERY = /* GraphQL */ `query { shop { currencyCode } }`;

export function metricsDiscountsRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const [{ orders, truncated }, shopResp] = await Promise.all([
      fetchOrdersForRange(graphql, range),
      graphql<{ shop: { currencyCode: string } }>(SHOP_CURRENCY_QUERY),
    ]);
    const currency = shopResp.data.shop.currencyCode;

    const result = computeDiscountCodes(orders, currency, plan, range, truncated);
    if (historyClampedTo) result.history_clamped_to = historyClampedTo;
    return c.json(result);
  });

  return app;
}
