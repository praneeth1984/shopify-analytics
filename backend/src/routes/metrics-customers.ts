import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { fetchOrdersForRange } from "../metrics/orders-fetch.js";
import { computeTopCustomers } from "../metrics/top-customers.js";
import { computeRepeatRate } from "../metrics/repeat-rate.js";
import { computeCohortRetention, computeLtvByCohort } from "../metrics/cohort.js";
import { computeRfm } from "../metrics/rfm.js";
import { clampRangeForPlan } from "../metrics/history-clamp.js";
import { getPlanCached } from "../plan/get-plan.js";
import { BadRequest } from "../lib/errors.js";
import type { DateRangePreset, ComparisonMode, DateRange } from "@fbc/shared";

const VALID_PRESETS: DateRangePreset[] = [
  "today", "yesterday", "last_7_days", "last_30_days",
  "last_90_days", "month_to_date", "year_to_date", "custom",
];
const VALID_COMPARISONS: ComparisonMode[] = ["previous_period", "previous_year", "none"];

const SHOP_CURRENCY_QUERY = /* GraphQL */ `query { shop { currencyCode } }`;

function priorRange(range: DateRange, mode: ComparisonMode): DateRange | null {
  if (mode === "none") return null;
  const start = new Date(range.start);
  const end = new Date(range.end);
  const lengthMs = end.getTime() - start.getTime();
  if (mode === "previous_period") {
    return {
      preset: "custom",
      start: new Date(start.getTime() - lengthMs).toISOString(),
      end: new Date(start.getTime()).toISOString(),
    };
  }
  const yearMs = 365 * 24 * 60 * 60 * 1000;
  return {
    preset: "custom",
    start: new Date(start.getTime() - yearMs).toISOString(),
    end: new Date(end.getTime() - yearMs).toISOString(),
  };
}

export function metricsCustomersRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/top", async (c) => {
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

    const result = computeTopCustomers(orders, currency, plan, range, truncated);
    if (historyClampedTo) result.history_clamped_to = historyClampedTo;
    return c.json(result);
  });

  app.get("/repeat-rate", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");
    const comparison = (c.req.query("comparison") ?? "previous_period") as ComparisonMode;
    if (!VALID_COMPARISONS.includes(comparison)) throw BadRequest("invalid comparison");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const prior = priorRange(range, comparison);

    const [{ orders, truncated }, shopResp] = await Promise.all([
      fetchOrdersForRange(graphql, range),
      graphql<{ shop: { currencyCode: string } }>(SHOP_CURRENCY_QUERY),
    ]);
    const currency = shopResp.data.shop.currencyCode;

    const previousOrders = prior ? (await fetchOrdersForRange(graphql, prior)).orders : null;
    const result = computeRepeatRate(orders, previousOrders, plan, range, truncated);
    if (historyClampedTo) result.history_clamped_to = historyClampedTo;
    return c.json(result);
  });

  app.get("/cohort", async (c) => {
    const preset = (c.req.query("preset") ?? "last_90_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const { orders, truncated } = await fetchOrdersForRange(graphql, range);

    const result = computeCohortRetention(orders, plan, range, truncated, historyClampedTo);
    return c.json(result);
  });

  app.get("/ltv", async (c) => {
    const preset = (c.req.query("preset") ?? "last_90_days") as DateRangePreset;
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

    const result = computeLtvByCohort(orders, currency, plan, range, truncated, historyClampedTo);
    return c.json(result);
  });

  app.get("/rfm", async (c) => {
    const preset = (c.req.query("preset") ?? "last_90_days") as DateRangePreset;
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

    const result = computeRfm(orders, currency, range, truncated, historyClampedTo);
    return c.json(result);
  });

  return app;
}
