/**
 * GET /api/metrics/sales/attribution?by=...
 *
 * F33 — Sales Attribution. Pivots line-items / orders by vendor / type /
 * channel / pos_location.
 *
 * Free: vendor / type / channel, 90-day clamp.
 * Pro:  + pos_location, unlimited.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { clampRangeForPlan } from "../metrics/history-clamp.js";
import { getPlanCached } from "../plan/get-plan.js";
import { computeSalesAttribution } from "../metrics/sales-attribution.js";
import {
  ORDERS_ATTRIBUTION_QUERY,
  type AttributionOrderNode,
} from "../metrics/queries.js";
import { BadRequest } from "../lib/errors.js";
import type { DateRangePreset, SalesAttributionGroupBy } from "@fbc/shared";

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

const VALID_BY: SalesAttributionGroupBy[] = ["vendor", "type", "channel", "pos_location"];

const PAGE_SIZE = 250;
const MAX_PAGES = 10;

type OrdersResp = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: AttributionOrderNode[];
  };
};

export function metricsSalesAttributionRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const by = (c.req.query("by") ?? "vendor") as SalesAttributionGroupBy;
    if (!VALID_BY.includes(by)) throw BadRequest("invalid by");
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const orders: AttributionOrderNode[] = [];
    let after: string | null = null;
    let pages = 0;
    let truncated = false;
    while (pages < MAX_PAGES) {
      const { data } = (await graphql<OrdersResp>(ORDERS_ATTRIBUTION_QUERY, {
        query: `processed_at:>='${range.start}' processed_at:<'${range.end}'`,
        first: PAGE_SIZE,
        after,
      })) as { data: OrdersResp };
      orders.push(...data.orders.nodes);
      pages += 1;
      if (!data.orders.pageInfo.hasNextPage) break;
      after = data.orders.pageInfo.endCursor;
      if (!after) break;
    }
    if (pages === MAX_PAGES) truncated = true;

    const result = computeSalesAttribution(
      orders,
      by,
      plan,
      range,
      truncated,
      historyClampedTo,
    );
    return c.json(result);
  });

  return app;
}
