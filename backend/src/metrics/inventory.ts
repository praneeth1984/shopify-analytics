import type { GraphQLClient } from "../shopify/graphql-client.js";
import { INVENTORY_VARIANTS_QUERY, type InventoryVariantNode } from "./queries.js";
import { fetchOrdersForRange } from "./orders-fetch.js";
import type { InventoryResponse, InventoryRow, InventoryStatus } from "@fbc/shared";

const PAGE_SIZE = 250;
const MAX_PAGES = 40; // 10,000 variants budget
const FREE_CAP = 20; // at-risk variants only on Free
const LEAD_TIME_DAYS = 14; // default; used to define "at_risk" threshold

function statusFor(daysRemaining: number | null, stock: number): InventoryStatus {
  if (stock === 0) return "out_of_stock";
  if (daysRemaining === null) return "healthy"; // zero sell rate
  if (daysRemaining < LEAD_TIME_DAYS) return "critical";
  if (daysRemaining < LEAD_TIME_DAYS * 1.5) return "at_risk";
  if (daysRemaining < 60) return "watch";
  return "healthy";
}

async function fetchAllVariants(graphql: GraphQLClient): Promise<InventoryVariantNode[]> {
  const variants: InventoryVariantNode[] = [];
  let cursor: string | null = null;
  let page = 0;

  while (page < MAX_PAGES) {
    const variables: Record<string, unknown> = { first: PAGE_SIZE };
    if (cursor) variables["after"] = cursor;

    const { data } = await graphql<{
      productVariants: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: InventoryVariantNode[];
      };
    }>(INVENTORY_VARIANTS_QUERY, variables);

    variants.push(...data.productVariants.nodes);
    if (!data.productVariants.pageInfo.hasNextPage) break;
    cursor = data.productVariants.pageInfo.endCursor;
    page++;
  }

  return variants;
}

export async function computeInventory(
  graphql: GraphQLClient,
  plan: string,
): Promise<InventoryResponse> {
  const now = new Date();
  // 30-day sell window for velocity calculation
  const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const range = {
    preset: "custom" as const,
    start: windowStart.toISOString(),
    end: now.toISOString(),
  };

  const [variants, { orders }] = await Promise.all([
    fetchAllVariants(graphql),
    fetchOrdersForRange(graphql, range),
  ]);

  // Count units sold per variant in last 30 days
  const soldUnits = new Map<string, number>();
  for (const order of orders) {
    for (const edge of order.lineItems.edges) {
      const item = edge.node;
      if (!item.variant?.id) continue;
      soldUnits.set(item.variant.id, (soldUnits.get(item.variant.id) ?? 0) + item.quantity);
    }
  }

  const rows: InventoryRow[] = [];
  for (const v of variants) {
    if (!v.product || v.product.status !== "ACTIVE") continue;
    const stock = v.inventoryQuantity ?? 0;
    const unitsSold = soldUnits.get(v.id) ?? 0;
    const dailyRate = unitsSold / 30;
    const daysRemaining = dailyRate > 0 ? Math.floor(stock / dailyRate) : null;
    const status = statusFor(daysRemaining, stock);
    rows.push({
      variant_id: v.id,
      product_id: v.product.id,
      product_title: v.product.title,
      variant_title: v.title,
      sku: v.sku,
      stock,
      units_sold_30d: unitsSold,
      daily_sell_rate: Math.round(dailyRate * 100) / 100,
      days_remaining: daysRemaining,
      status,
    });
  }

  // Sort: most at-risk first (lowest days_remaining)
  rows.sort((a, b) => {
    if (a.days_remaining === null && b.days_remaining === null) return 0;
    if (a.days_remaining === null) return 1;
    if (b.days_remaining === null) return -1;
    if (a.status === "out_of_stock" && b.status !== "out_of_stock") return -1;
    if (b.status === "out_of_stock" && a.status !== "out_of_stock") return 1;
    return a.days_remaining - b.days_remaining;
  });

  const total = rows.length;

  const isFree = plan === "free";
  let cappedRows = rows;
  if (isFree) {
    cappedRows = rows
      .filter((r) => r.status !== "healthy" && r.status !== "watch")
      .slice(0, FREE_CAP);
  }

  return {
    rows: cappedRows,
    computed_at: now.toISOString(),
    total_count: total,
    plan_capped_to: isFree ? FREE_CAP : null,
  };
}
