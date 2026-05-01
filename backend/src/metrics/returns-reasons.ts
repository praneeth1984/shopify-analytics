/**
 * R-RET-3: returns by reason.
 *
 * Uses a dedicated lightweight ORDERS_RETURNS_QUERY (separate from the shared
 * ORDERS_OVERVIEW_QUERY) to avoid exceeding the 1000-point Shopify query cost
 * budget. The main query omits the returns connection entirely.
 */

import type {
  Plan,
  ReturnReasonCode,
  ReturnReasonRow,
  ReturnReasonVariantBreakdown,
} from "@fbc/shared";
import type { GraphQLClient } from "../shopify/graphql-client.js";
import { ORDERS_RETURNS_QUERY, type ReturnReasonOrderNode } from "./queries.js";
import { humanizeReturnReason } from "./returns-shared.js";

const FREE_TOP_LIMIT = 5;
const PAGE_SIZE = 250;
const MAX_PAGES = 10;

const KNOWN_CODES: ReadonlySet<string> = new Set<ReturnReasonCode>([
  "COLOR", "DEFECTIVE", "NOT_AS_DESCRIBED", "OTHER",
  "SIZE_TOO_LARGE", "SIZE_TOO_SMALL", "STYLE", "UNKNOWN", "UNWANTED", "WRONG_ITEM",
]);

function normaliseCode(raw: string | null | undefined): ReturnReasonCode | "UNKNOWN" {
  if (!raw) return "UNKNOWN";
  return KNOWN_CODES.has(raw) ? (raw as ReturnReasonCode) : "UNKNOWN";
}

type ReasonTally = {
  count: number;
  units: number;
  variants: Map<string, ReturnReasonVariantBreakdown>;
};

export type ReturnReasonsData = {
  reasons: ReturnReasonRow[];
  total_returned_units: number;
  truncated: boolean;
};

/** Pure aggregation — exported for unit tests. */
export function computeReturnReasonsFromNodes(
  orders: ReturnReasonOrderNode[],
  plan: Plan,
): Omit<ReturnReasonsData, "truncated"> {
  const byReason = new Map<ReturnReasonCode | "UNKNOWN", ReasonTally>();
  let total_returned_units = 0;

  for (const order of orders) {
    for (const retEdge of order.returns.edges) {
      for (const rliEdge of retEdge.node.returnLineItems.edges) {
        const rli = rliEdge.node;
        const code = normaliseCode(rli.returnReason);
        let tally = byReason.get(code);
        if (!tally) {
          tally = { count: 0, units: 0, variants: new Map() };
          byReason.set(code, tally);
        }
        tally.count += 1;
        tally.units += rli.quantity;
        total_returned_units += rli.quantity;
      }
    }
  }

  const rows: ReturnReasonRow[] = [];
  for (const [code, tally] of byReason.entries()) {
    const pct_of_returns = total_returned_units === 0 ? 0 : tally.units / total_returned_units;
    const row: ReturnReasonRow = {
      code,
      label: humanizeReturnReason(code === "UNKNOWN" ? null : code),
      count: tally.count,
      units: tally.units,
      pct_of_returns,
    };
    if (plan === "pro" || plan === "insights") {
      row.variants = Array.from(tally.variants.values()).sort((a, b) => b.units - a.units);
    }
    rows.push(row);
  }

  rows.sort((a, b) => b.units - a.units);
  const limited = plan === "free" ? rows.slice(0, FREE_TOP_LIMIT) : rows;
  return { reasons: limited, total_returned_units };
}

/** Fetches return reasons via the lightweight returns-only query. */
export async function fetchReturnReasons(
  graphql: GraphQLClient,
  range: { start: string; end: string },
  plan: Plan,
): Promise<ReturnReasonsData> {
  const query = `processed_at:>='${range.start}' processed_at:<='${range.end}'`;
  const allOrders: ReturnReasonOrderNode[] = [];
  let truncated = false;
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await graphql<{
      orders: {
        pageInfo: { hasNextPage: boolean; endCursor: string };
        nodes: ReturnReasonOrderNode[];
      };
    }>(ORDERS_RETURNS_QUERY, { query, first: PAGE_SIZE, after: cursor ?? null });

    allOrders.push(...data.orders.nodes);

    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
    if (page === MAX_PAGES - 1) { truncated = true; break; }
  }

  const { reasons, total_returned_units } = computeReturnReasonsFromNodes(allOrders, plan);
  return { reasons, total_returned_units, truncated };
}
