/**
 * GET /api/metrics/orders
 *
 * F43 — Order Report. Cursor-paginated raw order rows with optional status
 * and fulfillment filters. Free plan clamps the requested window to 90 days.
 *
 * Query params:
 *   from           — ISO date (UTC), inclusive
 *   to             — ISO date (UTC), exclusive
 *   status         — all | paid | pending | refunded | cancelled (default all)
 *   fulfillment    — all | fulfilled | unfulfilled | partial (default all)
 *   cursor         — opaque page cursor (return value of previous page)
 *   preset         — DateRangePreset alternative to from/to
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { clampRangeForPlan } from "../metrics/history-clamp.js";
import { getPlanCached } from "../plan/get-plan.js";
import { fetchOrderReportPage, VALID_ORDER_SORTS, VALID_PAGE_SIZES } from "../metrics/orders-report.js";
import { computeOutstandingPayments } from "../metrics/outstanding.js";
import { BadRequest } from "../lib/errors.js";
import type {
  DateRangePreset,
  FulfillmentFilter,
  OrderStatusFilter,
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

const VALID_STATUSES: OrderStatusFilter[] = [
  "all",
  "paid",
  "pending",
  "refunded",
  "cancelled",
];

const VALID_FULFILLMENT: FulfillmentFilter[] = [
  "all",
  "fulfilled",
  "unfulfilled",
  "partial",
];

export function metricsOrdersRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");
    const status = (c.req.query("status") ?? "all") as OrderStatusFilter;
    if (!VALID_STATUSES.includes(status)) throw BadRequest("invalid status");
    const fulfillment = (c.req.query("fulfillment") ?? "all") as FulfillmentFilter;
    if (!VALID_FULFILLMENT.includes(fulfillment)) throw BadRequest("invalid fulfillment");

    const cursor = c.req.query("cursor") ?? null;
    const search = c.req.query("search") ?? "";
    const sort = c.req.query("sort") ?? "date_desc";
    if (!VALID_ORDER_SORTS.includes(sort as typeof VALID_ORDER_SORTS[number])) {
      throw BadRequest("invalid sort");
    }
    const limitRaw = Number(c.req.query("limit") ?? 10);
    const limit = (VALID_PAGE_SIZES as readonly number[]).includes(limitRaw) ? limitRaw : 10;
    const fromQ = c.req.query("from");
    const toQ = c.req.query("to");

    // Allow either a preset or explicit from/to. If from/to are present they
    // win and we treat the request as a custom range.
    const requested = fromQ && toQ
      ? resolveRange("custom", fromQ, toQ)
      : resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const result = await fetchOrderReportPage(graphql, {
      start: range.start,
      end: range.end,
      status,
      fulfillment,
      cursor,
      search,
      sort,
      limit,
    });
    return c.json(result);
  });

  app.get("/outstanding", async (c) => {
    const graphql = c.get("graphql");
    const result = await computeOutstandingPayments(graphql);
    return c.json(result);
  });

  return app;
}
