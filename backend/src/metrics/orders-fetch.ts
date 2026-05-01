/**
 * Shared order pagination loop used by all metric aggregators
 * (overview, profit, returns). Pulls up to MAX_PAGES * PAGE_SIZE orders for the
 * requested range; flags `truncated` when the budget is hit so callers can
 * surface a "partial results" banner.
 *
 * Phase 1.5 will swap this for a bulk-operations path when the budget is
 * exceeded; the response shape is intentionally stable across both.
 */

import type { GraphQLClient } from "../shopify/graphql-client.js";
import { ORDERS_OVERVIEW_QUERY } from "./queries.js";
import type { OrderNode } from "./queries.js";

export const PAGE_SIZE = 250;
export const MAX_PAGES = 10; // 2,500 orders per range — safe budget for Phase 1.

type OrdersResp = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: OrderNode[];
  };
};

export async function fetchOrdersForRange(
  graphql: GraphQLClient,
  range: { start: string; end: string },
): Promise<{ orders: OrderNode[]; truncated: boolean }> {
  const q = `processed_at:>='${range.start}' processed_at:<'${range.end}'`;
  const out: OrderNode[] = [];
  let after: string | null = null;
  let pages = 0;
  let truncated = false;

  while (pages < MAX_PAGES) {
    const { data } = (await graphql<OrdersResp>(ORDERS_OVERVIEW_QUERY, {
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

  if (pages === MAX_PAGES) truncated = true;
  return { orders: out, truncated };
}
