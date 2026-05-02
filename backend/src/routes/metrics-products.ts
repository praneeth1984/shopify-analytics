import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { fetchOrdersForRange } from "../metrics/orders-fetch.js";
import { computeProductsPerformance } from "../metrics/products-performance.js";
import { computeAffinity } from "../metrics/affinity.js";
import { computeBundles } from "../metrics/bundles.js";
import { computePriceAnalysis } from "../metrics/price-analysis.js";
import { computeInventory } from "../metrics/inventory.js";
import { clampRangeForPlan } from "../metrics/history-clamp.js";
import { getPlanCached } from "../plan/get-plan.js";
import { readCogsState } from "../cogs/store.js";
import { buildLookup } from "../cogs/lookup.js";
import { BadRequest } from "../lib/errors.js";
import type { DateRangePreset } from "@fbc/shared";

const VALID_PRESETS: DateRangePreset[] = [
  "today", "yesterday", "last_7_days", "last_30_days",
  "last_90_days", "month_to_date", "year_to_date", "custom",
];

const SHOP_CURRENCY_QUERY = /* GraphQL */ `query { shop { currencyCode } }`;

export function metricsProductsRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/performance", async (c) => {
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
    const [cogs, prefs] = await Promise.all([
      readCogsState(graphql, currency),
      import("./preferences.js").then((m) => m.readPreferences(graphql)),
    ]);
    const lookup = buildLookup(cogs.meta, cogs.entries);
    const gatewayRates = prefs.gatewayRates ?? [];

    const result = computeProductsPerformance(orders, lookup, currency, plan, range, truncated, gatewayRates);
    if (historyClampedTo) result.history_clamped_to = historyClampedTo;
    return c.json(result);
  });

  app.get("/inventory", async (c) => {
    const plan = await getPlanCached(c);
    const graphql = c.get("graphql");
    const result = await computeInventory(graphql, plan);
    return c.json(result);
  });

  app.get("/affinity", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const { orders, truncated } = await fetchOrdersForRange(graphql, range);

    const result = computeAffinity(orders, plan, range, truncated, historyClampedTo);
    return c.json(result);
  });

  app.get("/bundles", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const { orders, truncated } = await fetchOrdersForRange(graphql, range);

    const result = computeBundles(orders, plan, range, truncated, historyClampedTo);
    return c.json(result);
  });

  app.get("/price-analysis", async (c) => {
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
    const cogs = await readCogsState(graphql, currency);
    const lookup = buildLookup(cogs.meta, cogs.entries);

    const result = computePriceAnalysis(orders, lookup, currency, range, truncated, historyClampedTo);
    return c.json(result);
  });

  return app;
}
