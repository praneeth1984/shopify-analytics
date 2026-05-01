/**
 * GET /api/metrics/returns/by-product   (R-RET-1)
 * GET /api/metrics/returns/reasons      (R-RET-3)
 * GET /api/metrics/returns/resolution   (R-RET-4)
 *
 * All three endpoints share an order pagination pass via `fetchOrdersForRange`
 * and apply the Free-plan 90-day history clamp via `clampRangeForPlan`.
 *
 * Auth: requires verified Shopify session token (parent router middleware).
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { fetchOrdersForRange } from "../metrics/orders-fetch.js";
import { clampRangeForPlan } from "../metrics/history-clamp.js";
import { getPlanCached } from "../plan/get-plan.js";
import { computeReturnsByProduct } from "../metrics/returns-by-product.js";
import { fetchReturnReasons } from "../metrics/returns-reasons.js";
import { computeReturnResolution } from "../metrics/returns-resolution.js";
import { BadRequest } from "../lib/errors.js";
import type {
  DateRangePreset,
  ReturnReasonsResponse,
  ReturnResolutionResponse,
  ReturnsByProductResponse,
} from "@fbc/shared";

const VALID_PRESETS: DateRangePreset[] = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "month_to_date",
  "year_to_date",
  "custom",
];

function parsePreset(c: { req: { query: (k: string) => string | undefined } }): DateRangePreset {
  const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
  if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");
  return preset;
}

export function metricsReturnsRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/by-product", async (c) => {
    const preset = parsePreset(c);
    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const { orders, truncated } = await fetchOrdersForRange(graphql, range);
    const data = computeReturnsByProduct(orders, plan);

    const body: ReturnsByProductResponse = {
      range,
      products: data.products,
      excluded_low_volume_count: data.excluded_low_volume_count,
      truncated,
      history_clamped_to: historyClampedTo,
    };
    return c.json(body);
  });

  app.get("/reasons", async (c) => {
    const preset = parsePreset(c);
    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    let data: Awaited<ReturnType<typeof fetchReturnReasons>>;
    try {
      data = await fetchReturnReasons(graphql, range, plan);
    } catch {
      // Order.returns requires the read_returns scope. Return empty data
      // gracefully so the rest of the dashboard is unaffected.
      data = { reasons: [], total_returned_units: 0, truncated: false, scope_missing: true };
    }

    const body: ReturnReasonsResponse = {
      range,
      reasons: data.reasons,
      total_returned_units: data.total_returned_units,
      truncated: data.truncated,
      history_clamped_to: historyClampedTo,
    };
    return c.json(body);
  });

  app.get("/resolution", async (c) => {
    const preset = parsePreset(c);
    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const { orders, truncated } = await fetchOrdersForRange(graphql, range);
    const data = computeReturnResolution(orders);

    const body: ReturnResolutionResponse = {
      range,
      resolutions: data.resolutions,
      exchange_detection: data.exchange_detection,
      truncated,
      history_clamped_to: historyClampedTo,
    };
    return c.json(body);
  });

  return app;
}
