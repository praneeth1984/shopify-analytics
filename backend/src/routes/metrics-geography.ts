/**
 * GET /api/metrics/geography
 *
 * Returns pre-clustered heat-map data and a hierarchical region table.
 * Free plan: country centroids + country/province rows, 90-day history cap.
 * Pro plan:  0.1° grid clusters + city-level rows, unlimited history.
 *
 * Auth: requires verified Shopify session token (parent router middleware).
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { clampRangeForPlan } from "../metrics/history-clamp.js";
import { getPlanCached } from "../plan/get-plan.js";
import { computeGeography } from "../metrics/geography.js";
import { BadRequest } from "../lib/errors.js";
import type { DateRangePreset, GeographyResponse } from "@fbc/shared";
import type { GraphQLClient } from "../shopify/graphql-client.js";
import { ORDERS_GEOGRAPHY_QUERY } from "../metrics/queries.js";
import type { GeoOrderNode } from "../metrics/queries.js";
import { PAGE_SIZE, MAX_PAGES } from "../metrics/orders-fetch.js";

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

type GeoOrdersResp = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: GeoOrderNode[];
  };
};

async function fetchGeoOrdersForRange(
  graphql: GraphQLClient,
  range: { start: string; end: string },
): Promise<{ orders: GeoOrderNode[]; truncated: boolean }> {
  const q = `processed_at:>='${range.start}' processed_at:<'${range.end}'`;
  const out: GeoOrderNode[] = [];
  let after: string | null = null;
  let pages = 0;
  let truncated = false;

  while (pages < MAX_PAGES) {
    const { data } = (await graphql<GeoOrdersResp>(ORDERS_GEOGRAPHY_QUERY, {
      query: q,
      first: PAGE_SIZE,
      after,
    })) as { data: GeoOrdersResp };

    out.push(...data.orders.nodes);
    pages += 1;
    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
    if (!after) break;
  }

  if (pages === MAX_PAGES) truncated = true;
  return { orders: out, truncated };
}

export function metricsGeographyRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const { orders, truncated } = await fetchGeoOrdersForRange(graphql, range);
    const data = computeGeography(orders, plan);

    const body: GeographyResponse = {
      range,
      clusters: data.clusters,
      regions: data.regions,
      no_location_count: data.no_location_count,
      no_location_revenue: data.no_location_revenue,
      truncated,
      history_clamped_to: historyClampedTo,
      cluster_precision: data.cluster_precision,
    };
    return c.json(body);
  });

  return app;
}
