/**
 * Live metrics — last 24 hours of orders.
 *
 * No date-range parameters; window is always "now − 24h" → "now".
 * Always free; no plan gating, no comparison, no truncation banner.
 *
 * Reuses `fetchOrdersForRange` so we share the same GraphQL pagination logic
 * as overview/profit/returns. Aggregation uses BigInt minor units.
 */

import type { GraphQLClient } from "../shopify/graphql-client.js";
import type { OrderNode } from "./queries.js";
import { SHOP_CURRENCY_QUERY } from "./queries.js";
import { fetchOrdersForRange } from "./orders-fetch.js";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";
import type { Money } from "@fbc/shared";

export type LiveMetrics = {
  orders: number;
  gross_revenue: Money;
  aov: Money;
  as_of: string; // ISO timestamp
  window_start: string;
  window_end: string;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function aggregateLive(orders: OrderNode[], currency: string): {
  count: number;
  revenue: Money;
  aov: Money;
} {
  let revenueMinor = 0n;
  for (const o of orders) {
    const grossMinor = moneyToMinor(o.totalPriceSet.shopMoney.amount);
    const refundedMinor = moneyToMinor(o.totalRefundedSet.shopMoney.amount);
    revenueMinor += grossMinor - refundedMinor;
  }
  const count = orders.length;
  const aovMinor = count > 0 ? revenueMinor / BigInt(count) : 0n;
  return {
    count,
    revenue: minorToMoney(revenueMinor, currency),
    aov: minorToMoney(aovMinor, currency),
  };
}

export async function computeLiveMetrics(graphql: GraphQLClient): Promise<LiveMetrics> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - ONE_DAY_MS);
  // Add a 1-minute buffer to `end` so "right now" orders are included.
  const windowEnd = new Date(now.getTime() + 60_000);

  const [{ data: shopData }, fetched] = await Promise.all([
    graphql<{ shop: { currencyCode: string } }>(SHOP_CURRENCY_QUERY),
    fetchOrdersForRange(graphql, {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
    }),
  ]);

  let currency = shopData.shop.currencyCode || "USD";
  if (fetched.orders.length > 0) {
    currency = fetched.orders[0]!.currentTotalPriceSet.shopMoney.currencyCode || currency;
  }

  const agg = aggregateLive(fetched.orders, currency);

  return {
    orders: agg.count,
    gross_revenue: agg.revenue,
    aov: agg.aov,
    as_of: now.toISOString(),
    window_start: windowStart.toISOString(),
    window_end: now.toISOString(),
  };
}

// Exported for unit tests.
export const _internal = { aggregateLive };
