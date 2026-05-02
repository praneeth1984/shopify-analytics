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

// Retry budget for transient Shopify HTTP errors (e.g. 429 from concurrent token
// exchanges in dev, or brief 5xx from the Admin API). Only the first page of
// each pagination round is retried; subsequent pages use a fresh cursor anyway.
const RETRY_DELAY_MS = 600;
const MAX_RETRIES = 1;

type OrdersResp = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: OrderNode[];
  };
};

async function fetchPage(
  graphql: GraphQLClient,
  variables: { query: string; first: number; after: string | null },
): Promise<OrdersResp> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = (await graphql<OrdersResp>(ORDERS_OVERVIEW_QUERY, variables)) as {
        data: OrdersResp;
      };
      return data;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise<void>((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }
  // unreachable — TypeScript requires a return path
  throw new Error("unreachable");
}

export async function fetchOrdersForRange(
  graphql: GraphQLClient,
  range: { start: string; end: string },
  tags: string[] = [],
): Promise<{ orders: OrderNode[]; truncated: boolean }> {
  let q = `processed_at:>='${range.start}' processed_at:<'${range.end}'`;
  if (tags.length > 0) {
    const tagClause = tags.map((t) => `tag:'${t.replace(/'/g, "")}'`).join(" OR ");
    q += ` AND (${tagClause})`;
  }
  const out: OrderNode[] = [];
  let after: string | null = null;
  let pages = 0;
  let truncated = false;

  while (pages < MAX_PAGES) {
    const data = await fetchPage(graphql, { query: q, first: PAGE_SIZE, after });

    out.push(...data.orders.nodes);
    pages += 1;
    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
    if (!after) break;
  }

  if (pages === MAX_PAGES) truncated = true;
  return { orders: out, truncated };
}
