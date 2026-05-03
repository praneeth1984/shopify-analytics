/**
 * GET /api/metrics/refunds
 *
 * F45 — Refund Report. Returns a summary (total refunded, refund count, avg
 * refund, % of gross revenue) plus a row-per-refund list. Free plan clamps
 * the requested window to 90 days.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { clampRangeForPlan } from "../metrics/history-clamp.js";
import { getPlanCached } from "../plan/get-plan.js";
import { computeRefundReport } from "../metrics/refunds.js";
import { BadRequest } from "../lib/errors.js";
import type { DateRangePreset } from "@fbc/shared";

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

export function metricsRefundsRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const fromQ = c.req.query("from");
    const toQ = c.req.query("to");
    const requested = fromQ && toQ
      ? resolveRange("custom", fromQ, toQ)
      : resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const result = await computeRefundReport(graphql, range);
    return c.json(result);
  });

  return app;
}
