/**
 * F31 + F48 — Fulfillment Operations.
 *
 * Five views, all driven off `ORDERS_FULFILLMENT_QUERY`:
 *   - unfulfilled  — live operational list (no date range)
 *   - stuck        — paid but unfulfilled (live)
 *   - partial      — partially shipped (live)
 *   - performance  — date-range aggregate: median fulfillment time + thresholds
 *   - shipping     — date-range table: shipping charged vs carrier cost
 *
 * Each view runs its own search query against Shopify so we don't paginate
 * unrelated orders. Pagination uses the same MAX_PAGES budget as the rest of
 * the app for consistency.
 */

import type { GraphQLClient } from "../shopify/graphql-client.js";
import type {
  FulfillmentPerformance,
  FulfillmentResponse,
  FulfillmentView,
  ShippingRow,
  UnfulfilledOrderRow,
} from "@fbc/shared";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";
import { ORDERS_FULFILLMENT_QUERY } from "./queries.js";
import type { FulfillmentOrderNode } from "./queries.js";

const PAGE_SIZE = 250;
const MAX_PAGES = 10; // 2,500-order budget — matches the rest of the app.
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type OrdersResp = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: FulfillmentOrderNode[];
  };
};

async function fetchFulfillmentOrders(
  graphql: GraphQLClient,
  searchQuery: string,
): Promise<{ orders: FulfillmentOrderNode[]; truncated: boolean }> {
  const out: FulfillmentOrderNode[] = [];
  let after: string | null = null;
  let pages = 0;
  while (pages < MAX_PAGES) {
    const { data } = (await graphql<OrdersResp>(ORDERS_FULFILLMENT_QUERY, {
      query: searchQuery,
      first: PAGE_SIZE,
      after,
    })) as { data: OrdersResp };
    out.push(...data.orders.nodes);
    pages += 1;
    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
    if (!after) break;
  }
  return { orders: out, truncated: pages === MAX_PAGES };
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.floor(ms / MS_PER_DAY));
}

export function nodeToUnfulfilledRow(o: FulfillmentOrderNode): UnfulfilledOrderRow {
  const currency = o.totalPriceSet.shopMoney.currencyCode || "USD";
  const totalMinor = moneyToMinor(o.totalPriceSet.shopMoney.amount);
  return {
    order_id: o.id.split("/").pop() ?? o.id,
    gid: o.id,
    name: o.name,
    created_at: o.createdAt,
    days_waiting: daysBetween(o.createdAt, new Date().toISOString()),
    item_count: o.currentSubtotalLineItemsQuantity,
    total_price: minorToMoney(totalMinor, currency),
    financial_status: o.displayFinancialStatus,
  };
}

/**
 * Median fulfillment time + percentage-fulfilled-within-N-days. Only orders
 * with at least one fulfillment are counted.
 */
export function buildPerformance(orders: FulfillmentOrderNode[]): FulfillmentPerformance {
  const fulfillmentDays: number[] = [];
  for (const o of orders) {
    const f = o.fulfillments[0];
    if (!f) continue;
    const ms = new Date(f.createdAt).getTime() - new Date(o.createdAt).getTime();
    if (ms < 0) continue;
    fulfillmentDays.push(ms / MS_PER_DAY);
  }
  const total = fulfillmentDays.length;
  if (total === 0) {
    return {
      median_fulfillment_days: null,
      pct_within_1d: 0,
      pct_within_3d: 0,
      pct_within_7d: 0,
      total_fulfilled: 0,
    };
  }
  const sorted = [...fulfillmentDays].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);
  const within = (limit: number) =>
    fulfillmentDays.filter((d) => d <= limit).length / total;
  return {
    median_fulfillment_days: Number(median.toFixed(2)),
    pct_within_1d: within(1),
    pct_within_3d: within(3),
    pct_within_7d: within(7),
    total_fulfilled: total,
  };
}

export function nodeToShippingRow(o: FulfillmentOrderNode): ShippingRow {
  const slEdge = o.shippingLines.edges[0];
  const sl = slEdge?.node ?? null;
  const currency = sl?.discountedPriceSet?.shopMoney?.currencyCode || "USD";
  const chargedMinor = sl ? moneyToMinor(sl.discountedPriceSet.shopMoney.amount) : 0n;
  // Carrier cost is not exposed via the Admin API in Phase 1. We surface null
  // and let the UI explain that "Est. cost" requires a carrier-cost source
  // (e.g. ShipStation) once integrations land in Phase 3.
  const carrierCost: bigint | null = null;
  const pnl: bigint | null = carrierCost === null ? null : chargedMinor - carrierCost;
  return {
    order_id: o.id.split("/").pop() ?? o.id,
    gid: o.id,
    name: o.name,
    carrier: sl?.carrierIdentifier ?? sl?.source ?? null,
    service: sl?.title ?? null,
    shipping_charged: minorToMoney(chargedMinor, currency),
    carrier_cost: carrierCost === null ? null : minorToMoney(carrierCost, currency),
    shipping_pnl: pnl === null ? null : minorToMoney(pnl, currency),
  };
}

function buildSearchForView(view: FulfillmentView, range: { start: string; end: string } | null): string {
  switch (view) {
    case "unfulfilled":
      return "fulfillment_status:unfulfilled";
    case "stuck":
      return "fulfillment_status:unfulfilled financial_status:paid";
    case "partial":
      return "fulfillment_status:partial";
    case "performance":
    case "shipping":
      if (!range) throw new Error("date range required");
      return `processed_at:>='${range.start}' processed_at:<'${range.end}'`;
  }
}

export async function computeFulfillment(args: {
  graphql: GraphQLClient;
  view: FulfillmentView;
  range: { start: string; end: string } | null;
}): Promise<FulfillmentResponse> {
  const search = buildSearchForView(args.view, args.range);
  const { orders, truncated } = await fetchFulfillmentOrders(args.graphql, search);

  if (args.view === "performance") {
    return {
      view: "performance",
      performance: buildPerformance(orders),
      truncated,
      history_clamped_to: null,
    };
  }
  if (args.view === "shipping") {
    return {
      view: "shipping",
      rows: orders.map(nodeToShippingRow),
      truncated,
      history_clamped_to: null,
    };
  }
  // unfulfilled / stuck / partial
  const rows = orders
    .map(nodeToUnfulfilledRow)
    .sort((a, b) => b.days_waiting - a.days_waiting);
  return {
    view: args.view,
    rows,
    truncated,
    history_clamped_to: null,
  };
}

// Exported for unit tests
export const _internal = {
  nodeToUnfulfilledRow,
  buildPerformance,
  nodeToShippingRow,
  buildSearchForView,
};
