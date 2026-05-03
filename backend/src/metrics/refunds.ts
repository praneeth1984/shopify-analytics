/**
 * F45 — Refund Report transformer.
 *
 * Fetches orders in the requested range using `ORDERS_REFUNDS_QUERY`,
 * iterates each order's refunds[] and projects them as merchant-friendly
 * RefundRow entries. Computes a summary: total refunded, refund count, avg
 * refund value, and percentage of gross revenue refunded.
 *
 * "Restocked" reflects whether *any* refund line item carried a non-NO_RESTOCK
 * `restockType` value. Shopify's restockType values include `RETURN`, `CANCEL`,
 * `LEGACY_RESTOCK`, and `NO_RESTOCK`.
 *
 * Capped at MAX_PAGES * PAGE_SIZE orders (matches the synchronous budget used
 * elsewhere). When the cap is hit we set `truncated` so the UI can tell the
 * merchant they're seeing partial results.
 */

import type {
  Money,
  RefundReportResponse,
  RefundRow,
  RefundSummary,
} from "@fbc/shared";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";
import type { GraphQLClient } from "../shopify/graphql-client.js";
import { ORDERS_REFUNDS_QUERY } from "./queries.js";
import type { RefundReportOrderNode } from "./queries.js";

const PAGE_SIZE = 250;
const MAX_PAGES = 10;

type OrdersResp = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: RefundReportOrderNode[];
  };
};

async function fetchAllOrdersWithRefunds(
  graphql: GraphQLClient,
  range: { start: string; end: string },
): Promise<{ orders: RefundReportOrderNode[]; truncated: boolean }> {
  const q = `processed_at:>='${range.start}' processed_at:<'${range.end}'`;
  const out: RefundReportOrderNode[] = [];
  let after: string | null = null;
  let pages = 0;
  while (pages < MAX_PAGES) {
    const { data } = (await graphql<OrdersResp>(ORDERS_REFUNDS_QUERY, {
      query: q,
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

function detectCurrency(orders: RefundReportOrderNode[]): string {
  for (const o of orders) {
    const code = o.totalPriceSet.shopMoney.currencyCode;
    if (code) return code;
  }
  return "USD";
}

export function buildRefundRows(
  orders: RefundReportOrderNode[],
): { rows: RefundRow[]; totalRefundedMinor: bigint; grossMinor: bigint; currency: string } {
  const currency = detectCurrency(orders);
  const rows: RefundRow[] = [];
  let totalRefundedMinor = 0n;
  let grossMinor = 0n;

  for (const order of orders) {
    grossMinor += moneyToMinor(order.totalPriceSet.shopMoney.amount);

    for (const refund of order.refunds) {
      const refundMinor = moneyToMinor(refund.totalRefundedSet.shopMoney.amount);
      totalRefundedMinor += refundMinor;

      let lineItemsRefunded = 0;
      let restocked = false;
      for (const edge of refund.refundLineItems.edges) {
        lineItemsRefunded += edge.node.quantity;
        const rt = edge.node.restockType;
        if (rt && rt !== "NO_RESTOCK") restocked = true;
      }

      const refundCurrency = refund.totalRefundedSet.shopMoney.currencyCode || currency;
      rows.push({
        refund_id: refund.id.split("/").pop() ?? refund.id,
        order_id: order.id.split("/").pop() ?? order.id,
        order_name: order.name,
        refunded_at: refund.createdAt,
        amount: minorToMoney(refundMinor, refundCurrency),
        line_items_refunded: lineItemsRefunded,
        restocked,
        note: refund.note,
      });
    }
  }

  // Newest first
  rows.sort((a, b) => (a.refunded_at < b.refunded_at ? 1 : -1));

  return { rows, totalRefundedMinor, grossMinor, currency };
}

export function buildRefundSummary(
  rows: RefundRow[],
  totalRefundedMinor: bigint,
  grossMinor: bigint,
  currency: string,
): RefundSummary {
  const count = rows.length;
  const avgMinor = count > 0 ? totalRefundedMinor / BigInt(count) : 0n;
  const pct =
    grossMinor > 0n
      ? Number((totalRefundedMinor * 10_000n) / grossMinor) / 10_000
      : 0;
  const total: Money = minorToMoney(totalRefundedMinor, currency);
  const avg: Money = minorToMoney(avgMinor, currency);
  return {
    total_refunded: total,
    refund_count: count,
    avg_refund: avg,
    pct_of_gross_revenue: pct,
  };
}

export async function computeRefundReport(
  graphql: GraphQLClient,
  range: { start: string; end: string },
): Promise<RefundReportResponse> {
  const { orders, truncated } = await fetchAllOrdersWithRefunds(graphql, range);
  const { rows, totalRefundedMinor, grossMinor, currency } = buildRefundRows(orders);
  const summary = buildRefundSummary(rows, totalRefundedMinor, grossMinor, currency);
  return { summary, refunds: rows, truncated };
}

// Exported for unit tests
export const _internal = { buildRefundRows, buildRefundSummary };
