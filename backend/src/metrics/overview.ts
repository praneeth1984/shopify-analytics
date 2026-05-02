/**
 * Overview metrics transformer.
 *
 * For Phase 1 we synchronously fetch up to N pages of orders for the requested
 * range and aggregate in-memory. For ranges that would exceed the page budget
 * (typically >2500 orders), we'll switch this to a bulk-operations path in
 * Phase 1.5. The response shape is stable across both implementations.
 */

import type { GraphQLClient } from "../shopify/graphql-client.js";
import { SHOP_CURRENCY_QUERY } from "./queries.js";
import type { OrderNode } from "./queries.js";
import { fetchOrdersForRange } from "./orders-fetch.js";
import {
  buildAlignedPreviousSeries,
  buildDowSeries,
  buildRevenueAndOrdersSeries,
  buildReturnRateSeries,
  pickGranularity,
} from "./timeseries.js";
import type {
  ComparisonMode,
  DateRange,
  Money,
  OverviewMetrics,
  PendingReturns,
} from "@fbc/shared";

type Aggregate = {
  count: number;
  revenueMinor: bigint; // in smallest currency unit, for safe summation
  uniqueCustomers: Set<string>;
  pendingReturnsCount: number;
  pendingReturnsValueMinor: bigint;
};

function emptyAggregate(): Aggregate {
  return {
    count: 0,
    revenueMinor: 0n,
    uniqueCustomers: new Set<string>(),
    pendingReturnsCount: 0,
    pendingReturnsValueMinor: 0n,
  };
}

function toMinorUnits(amount: string): bigint {
  // Shopify returns decimal strings like "12.34"; multiply by 100 safely without floats.
  const trimmed = amount.trim();
  const neg = trimmed.startsWith("-");
  const body = neg ? trimmed.slice(1) : trimmed;
  const [whole = "0", frac = ""] = body.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const minor = BigInt(whole) * 100n + BigInt(fracPadded || "0");
  return neg ? -minor : minor;
}

function fromMinor(minor: bigint, currency: string): Money {
  const sign = minor < 0n ? "-" : "";
  const abs = minor < 0n ? -minor : minor;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return {
    amount: `${sign}${whole.toString()}.${frac.toString().padStart(2, "0")}`,
    currency_code: currency,
  };
}

function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function aggregateOrders(orders: OrderNode[]): Aggregate {
  const agg = emptyAggregate();
  for (const o of orders) {
    agg.count += 1;
    // Net revenue = gross order total minus any refunded amount.
    // currentTotalPriceSet is unreliable for manual refunds; explicit calculation is safer.
    const grossMinor = toMinorUnits(o.totalPriceSet.shopMoney.amount);
    const refundedMinor = toMinorUnits(o.totalRefundedSet.shopMoney.amount);
    agg.revenueMinor += grossMinor - refundedMinor;
    if (o.customer?.id) agg.uniqueCustomers.add(o.customer.id);

    if (o.returnStatus === "RETURN_REQUESTED" || o.returnStatus === "IN_PROGRESS") {
      agg.pendingReturnsCount += 1;
      const grossMinor = toMinorUnits(o.totalPriceSet.shopMoney.amount);
      const refundedMinor = toMinorUnits(o.totalRefundedSet.shopMoney.amount);
      const remaining = grossMinor - refundedMinor;
      agg.pendingReturnsValueMinor += remaining > 0n ? remaining : 0n;
    }
  }
  return agg;
}

async function aggregateRange(
  graphql: GraphQLClient,
  range: DateRange,
  tags: string[] = [],
): Promise<{ agg: Aggregate; truncated: boolean; currencyCode: string; orders: OrderNode[] }> {
  const fetched = await fetchOrdersForRange(graphql, range, tags);
  let currencyCode = "USD";
  if (fetched.orders.length > 0) {
    const first = fetched.orders[0]!;
    currencyCode = first.currentTotalPriceSet.shopMoney.currencyCode || currencyCode;
  }
  const agg = aggregateOrders(fetched.orders);
  return { agg, truncated: fetched.truncated, currencyCode, orders: fetched.orders };
}

function priorRange(range: DateRange, mode: ComparisonMode): DateRange | null {
  if (mode === "none") return null;
  const start = new Date(range.start);
  const end = new Date(range.end);
  const lengthMs = end.getTime() - start.getTime();
  if (mode === "previous_period") {
    const prevEnd = new Date(start.getTime());
    const prevStart = new Date(start.getTime() - lengthMs);
    return { preset: "custom", start: prevStart.toISOString(), end: prevEnd.toISOString() };
  }
  // previous_year: shift both endpoints by 365 days.
  const yearMs = 365 * 24 * 60 * 60 * 1000;
  return {
    preset: "custom",
    start: new Date(start.getTime() - yearMs).toISOString(),
    end: new Date(end.getTime() - yearMs).toISOString(),
  };
}

export async function computeOverview(
  graphql: GraphQLClient,
  range: DateRange,
  comparison: ComparisonMode,
  tags: string[] = [],
): Promise<OverviewMetrics & { truncated: boolean }> {
  // Run shop currency + current range in parallel; compare range second to avoid
  // burning budget on comparison if current is throttled.
  const [{ data: shopData }, current] = await Promise.all([
    graphql<{ shop: { currencyCode: string; ianaTimezone: string } }>(SHOP_CURRENCY_QUERY),
    aggregateRange(graphql, range, tags),
  ]);

  const currency = shopData.shop.currencyCode || current.currencyCode;
  const prior = priorRange(range, comparison);
  const previous = prior ? await aggregateRange(graphql, prior, tags) : null;

  const granularity = pickGranularity(range);
  const { revenue_series, orders_series } = buildRevenueAndOrdersSeries(
    current.orders,
    range,
    granularity,
  );
  const revenue_by_dow = buildDowSeries(current.orders);
  const return_rate_series = buildReturnRateSeries(current.orders, range, granularity);

  let revenue_series_previous: OverviewMetrics["revenue_series_previous"];
  let orders_series_previous: OverviewMetrics["orders_series_previous"];
  if (previous && prior) {
    const aligned = buildAlignedPreviousSeries(previous.orders, prior, range, granularity);
    revenue_series_previous = aligned.revenue_series;
    orders_series_previous = aligned.orders_series;
  }

  const currentRevenueMinor = current.agg.revenueMinor;
  const previousRevenueMinor = previous?.agg.revenueMinor ?? null;
  const currentAovMinor =
    current.agg.count > 0 ? currentRevenueMinor / BigInt(current.agg.count) : 0n;
  const previousAovMinor =
    previous && previous.agg.count > 0 ? previous.agg.revenueMinor / BigInt(previous.agg.count) : null;

  const pending_returns: PendingReturns = {
    count: current.agg.pendingReturnsCount,
    value:
      current.agg.pendingReturnsCount > 0
        ? fromMinor(current.agg.pendingReturnsValueMinor, currency)
        : null,
  };

  return {
    range,
    comparison,
    revenue: {
      current: fromMinor(currentRevenueMinor, currency),
      previous: previousRevenueMinor !== null ? fromMinor(previousRevenueMinor, currency) : null,
      delta_pct:
        previousRevenueMinor !== null
          ? deltaPct(Number(currentRevenueMinor), Number(previousRevenueMinor))
          : null,
    },
    orders: {
      current: current.agg.count,
      previous: previous?.agg.count ?? null,
      delta_pct: previous ? deltaPct(current.agg.count, previous.agg.count) : null,
    },
    average_order_value: {
      current: fromMinor(currentAovMinor, currency),
      previous: previousAovMinor !== null ? fromMinor(previousAovMinor, currency) : null,
      delta_pct:
        previousAovMinor !== null
          ? deltaPct(Number(currentAovMinor), Number(previousAovMinor))
          : null,
    },
    unique_customers: {
      current: current.agg.uniqueCustomers.size,
      previous: previous?.agg.uniqueCustomers.size ?? null,
      delta_pct: previous
        ? deltaPct(current.agg.uniqueCustomers.size, previous.agg.uniqueCustomers.size)
        : null,
    },
    conversion_rate_pct: null, // requires Online Store sessions; Phase 2.
    pending_returns,
    granularity,
    revenue_series,
    orders_series,
    revenue_by_dow,
    return_rate_series,
    revenue_series_previous,
    orders_series_previous,
    truncated: current.truncated,
  };
}

// Exported for unit tests.
export const _internal = { aggregateOrders };
