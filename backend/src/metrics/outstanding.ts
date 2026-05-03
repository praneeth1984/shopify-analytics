/**
 * F53 — Outstanding Customer Payments.
 *
 * Always live — no date range. Walks orders where financial_status is one of
 * `pending | authorized | partially_paid` and sums `totalOutstandingSet`.
 */

import type {
  Money,
  OutstandingOrderRow,
  OutstandingPaymentsResponse,
} from "@fbc/shared";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";
import type { GraphQLClient } from "../shopify/graphql-client.js";
import { ORDERS_OUTSTANDING_QUERY } from "./queries.js";
import type { OutstandingOrderNode } from "./queries.js";

const PAGE_SIZE = 250;
const MAX_PAGES = 4; // 1,000-order budget — outstanding orders are operational

const SEARCH_QUERY =
  "financial_status:pending OR financial_status:authorized OR financial_status:partially_paid";

type OrdersResp = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: OutstandingOrderNode[];
  };
};

export function nodeToRow(o: OutstandingOrderNode): OutstandingOrderRow {
  const currency = o.totalOutstandingSet.shopMoney.currencyCode || "USD";
  const amountMinor = moneyToMinor(o.totalOutstandingSet.shopMoney.amount);
  return {
    order_id: o.id.split("/").pop() ?? o.id,
    gid: o.id,
    name: o.name,
    created_at: o.createdAt,
    customer_id: o.customer?.id ?? null,
    financial_status: o.displayFinancialStatus,
    total_outstanding: minorToMoney(amountMinor, currency),
  };
}

export function summarize(rows: OutstandingOrderRow[]): {
  total: Money;
  count: number;
} {
  let total = 0n;
  let currency = "USD";
  for (const r of rows) {
    total += moneyToMinor(r.total_outstanding.amount);
    currency = r.total_outstanding.currency_code || currency;
  }
  return {
    total: minorToMoney(total, currency),
    count: rows.length,
  };
}

export async function computeOutstandingPayments(
  graphql: GraphQLClient,
): Promise<OutstandingPaymentsResponse> {
  const orders: OutstandingOrderNode[] = [];
  let after: string | null = null;
  let pages = 0;
  let truncated = false;
  while (pages < MAX_PAGES) {
    const { data } = (await graphql<OrdersResp>(ORDERS_OUTSTANDING_QUERY, {
      query: SEARCH_QUERY,
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

  const rows = orders.map(nodeToRow);
  const summary = summarize(rows);
  return {
    summary: {
      total_outstanding: summary.total,
      order_count: summary.count,
    },
    orders: rows,
    truncated,
  };
}

// Exported for unit tests
export const _internal = { nodeToRow, summarize };
