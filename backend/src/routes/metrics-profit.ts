/**
 * GET /api/metrics/profit
 *
 * Computes profit metrics for the requested range. On the Free plan, the
 * range is clamped to the last 90 days (counted backward from `end`) and the
 * response includes `history_clamped_to` so the UI can explain the clamp.
 *
 * Auth: requires verified Shopify session token (parent router middleware).
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { computeProfit } from "../metrics/profit.js";
import { clampRangeForPlan } from "../metrics/history-clamp.js";
import { getPlanCached } from "../plan/get-plan.js";
import { BadRequest } from "../lib/errors.js";
import type { ComparisonMode, DateRangePreset } from "@fbc/shared";

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

const VALID_COMPARISONS: ComparisonMode[] = ["previous_period", "previous_year", "none"];

export function metricsProfitRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");
    const comparison = (c.req.query("comparison") ?? "previous_period") as ComparisonMode;
    if (!VALID_COMPARISONS.includes(comparison)) throw BadRequest("invalid comparison");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const result = await computeProfit(graphql, { range, comparison });
    if (historyClampedTo) {
      result.history_clamped_to = historyClampedTo;
    }
    return c.json(result);
  });

  return app;
}
