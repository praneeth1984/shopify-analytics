/**
 * GET /api/metrics/tags?type=order|product|customer
 *
 * F49 — Tag Reports.
 *
 * Free: order + product tags, top 10 each. Pro: customer tags + full list.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { clampRangeForPlan } from "../metrics/history-clamp.js";
import { getPlanCached } from "../plan/get-plan.js";
import { computeTagReport } from "../metrics/tag-attribution.js";
import { ORDERS_TAGS_QUERY, type TagsOrderNode } from "../metrics/queries.js";
import { BadRequest } from "../lib/errors.js";
import type { DateRangePreset, TagReportType } from "@fbc/shared";

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

const VALID_TYPES: TagReportType[] = ["order", "product", "customer"];
const PAGE_SIZE = 250;
const MAX_PAGES = 10;

type OrdersResp = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: TagsOrderNode[];
  };
};

export function metricsTagsRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const type = (c.req.query("type") ?? "order") as TagReportType;
    if (!VALID_TYPES.includes(type)) throw BadRequest("invalid type");
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const orders: TagsOrderNode[] = [];
    let after: string | null = null;
    let pages = 0;
    let truncated = false;
    while (pages < MAX_PAGES) {
      const { data } = (await graphql<OrdersResp>(ORDERS_TAGS_QUERY, {
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

    const result = computeTagReport({
      orders,
      type,
      plan,
      range,
      truncated,
      historyClampedTo,
    });
    return c.json(result);
  });

  return app;
}
