/**
 * GET /api/metrics/fulfillment?view=...
 *
 * F31 + F48 — Fulfillment Operations + Shipping Report.
 *
 * Views:
 *   - unfulfilled / stuck / partial — live operational, no date range
 *   - performance / shipping        — date-range aggregates (Free clamps 90d)
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { clampRangeForPlan } from "../metrics/history-clamp.js";
import { getPlanCached } from "../plan/get-plan.js";
import { computeFulfillment } from "../metrics/fulfillment.js";
import { BadRequest } from "../lib/errors.js";
import type { DateRangePreset, FulfillmentView } from "@fbc/shared";

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

const LIVE_VIEWS: FulfillmentView[] = ["unfulfilled", "stuck", "partial"];
const RANGE_VIEWS: FulfillmentView[] = ["performance", "shipping"];
const VALID_VIEWS: FulfillmentView[] = [...LIVE_VIEWS, ...RANGE_VIEWS];

export function metricsFulfillmentRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const view = (c.req.query("view") ?? "unfulfilled") as FulfillmentView;
    if (!VALID_VIEWS.includes(view)) throw BadRequest("invalid view");

    const graphql = c.get("graphql");

    if (LIVE_VIEWS.includes(view)) {
      const result = await computeFulfillment({ graphql, view, range: null });
      return c.json(result);
    }

    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");
    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);
    const result = await computeFulfillment({
      graphql,
      view,
      range: { start: range.start, end: range.end },
    });
    if (historyClampedTo) {
      // The performance/shipping union variants both have history_clamped_to.
      (result as { history_clamped_to: typeof historyClampedTo }).history_clamped_to = historyClampedTo;
    }
    return c.json(result);
  });

  return app;
}
