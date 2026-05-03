import type { GraphQLClient } from "../shopify/graphql-client.js";
import type { Plan } from "@fbc/shared";

const ABANDONED_CHECKOUTS_QUERY = /* GraphQL */ `
  query AbandonedCheckouts($query: String!, $first: Int!, $after: String) {
    abandonedCheckouts(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        createdAt
        completedAt
        totalPrice { amount currencyCode }
        lineItems(first: 10) {
          nodes { title quantity }
        }
      }
    }
  }
`;

export type AbandonedCartReport =
  | { scope_missing: true }
  | {
      scope_missing: false;
      checkoutsInitiated: number;
      checkoutsCompleted: number;
      checkoutsAbandoned: number;
      abandonmentRate: number;
      estimatedLostRevenueAmount: string;
      estimatedLostRevenueCurrency: string;
      dailySeries: Array<{ date: string; abandoned: number; rate: number }>;
      topAbandonedProducts: Array<{ productTitle: string; count: number }>;
      plan: Plan;
      historyClampedTo: string | null;
    };

type CheckoutNode = {
  id: string;
  createdAt: string;
  completedAt: string | null;
  totalPrice: { amount: string; currencyCode: string };
  lineItems: { nodes: Array<{ title: string; quantity: number }> };
};

type CheckoutsResp = {
  abandonedCheckouts: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: CheckoutNode[];
  };
};

export async function computeAbandonedCart(
  graphql: GraphQLClient,
  from: string,
  to: string,
  plan: Plan,
): Promise<AbandonedCartReport> {
  const freeDays = 30;
  const freeCutoff = plan === "free"
    ? new Date(Date.now() - freeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;
  const effectiveFrom = freeCutoff && freeCutoff > from.slice(0, 10) ? freeCutoff : from.slice(0, 10);
  const historyClampedTo = effectiveFrom !== from.slice(0, 10) ? effectiveFrom : null;

  const checkouts: CheckoutNode[] = [];
  let after: string | null = null;
  const maxPages = 10;
  let pages = 0;

  try {
    while (pages < maxPages) {
      const { data } = (await graphql<CheckoutsResp>(ABANDONED_CHECKOUTS_QUERY, {
        query: `created_at:>='${effectiveFrom}' created_at:<='${to.slice(0, 10)}'`,
        first: 250,
        after,
      })) as { data: CheckoutsResp };
      checkouts.push(...data.abandonedCheckouts.nodes);
      pages++;
      if (!data.abandonedCheckouts.pageInfo.hasNextPage) break;
      after = data.abandonedCheckouts.pageInfo.endCursor;
      if (!after) break;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("ACCESS_DENIED") || msg.includes("read_checkouts")) {
      return { scope_missing: true };
    }
    throw err;
  }

  const initiated = checkouts.length;
  const completed = checkouts.filter((c) => c.completedAt !== null).length;
  const abandoned = initiated - completed;
  const abandonmentRate = initiated > 0 ? abandoned / initiated : 0;

  const currency = checkouts[0]?.totalPrice?.currencyCode ?? "USD";
  const lostRevenue = checkouts
    .filter((c) => !c.completedAt)
    .reduce((s, c) => s + parseFloat(c.totalPrice?.amount ?? "0"), 0);

  // Daily series
  const dayMap = new Map<string, { total: number; abandoned: number }>();
  for (const c of checkouts) {
    const day = c.createdAt.slice(0, 10);
    const entry = dayMap.get(day) ?? { total: 0, abandoned: 0 };
    entry.total++;
    if (!c.completedAt) entry.abandoned++;
    dayMap.set(day, entry);
  }
  const dailySeries = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      abandoned: v.abandoned,
      rate: v.total > 0 ? v.abandoned / v.total : 0,
    }));

  // Top abandoned products (aggregate by title across abandoned checkouts)
  const productMap = new Map<string, number>();
  for (const c of checkouts.filter((ch) => !ch.completedAt)) {
    for (const li of c.lineItems.nodes) {
      productMap.set(li.title, (productMap.get(li.title) ?? 0) + 1);
    }
  }
  const topAbandonedProducts = [...productMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([productTitle, count]) => ({ productTitle, count }));

  return {
    scope_missing: false,
    checkoutsInitiated: initiated,
    checkoutsCompleted: completed,
    checkoutsAbandoned: abandoned,
    abandonmentRate,
    estimatedLostRevenueAmount: lostRevenue.toFixed(2),
    estimatedLostRevenueCurrency: currency,
    dailySeries,
    topAbandonedProducts,
    plan,
    historyClampedTo,
  };
}
