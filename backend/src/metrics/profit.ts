/**
 * Profit transformer.
 *
 * Aggregates orders -> { gross_revenue, gross_profit, gross_margin,
 * profit_per_order, top_profitable_products, cogs_coverage } using the
 * BigInt minor-unit math established in overview.ts.
 *
 * COGS resolution priority (per the architect's design):
 *   1. Explicit per-variant cost.
 *   2. Default margin: cost = price * (1 - defaultMarginPct).
 *   3. No contribution to profit; line item is flagged in cogs_coverage.
 *
 * Refunds: net quantity = `refundableQuantity` (Shopify already subtracts
 * refunded units). Free items with a known cost yield negative profit, which
 * is intentionally surfaced.
 *
 * Currency: shop currency only. Multi-currency stores are rejected at the
 * write layer (COGS upsert), so all entries here share `meta.currency_code`.
 */

import type {
  CogsCoverage,
  ComparisonMode,
  DateRange,
  Money,
  ProfitDelta,
  ProfitMetrics,
  TopProfitableProduct,
} from "@fbc/shared";
import type { GraphQLClient } from "../shopify/graphql-client.js";
import { SHOP_CURRENCY_QUERY } from "./queries.js";
import type { OrderNode } from "./queries.js";
import { fetchOrdersForRange } from "./orders-fetch.js";
import { readCogsState } from "../cogs/store.js";
import { buildLookup, minorToMoney, moneyToMinor } from "../cogs/lookup.js";
import type { CogsLookup } from "../cogs/lookup.js";
import { buildMarginSeries, pickGranularity } from "./timeseries.js";

type ProfitAggregate = {
  ordersCounted: number;
  grossRevenueMinor: bigint;
  grossProfitMinor: bigint;
  coverage: CogsCoverage;
  byProduct: Map<
    string,
    { product_id: string; title: string; profitMinor: bigint; revenueMinor: bigint; units: number }
  >;
};

function emptyAggregate(): ProfitAggregate {
  return {
    ordersCounted: 0,
    grossRevenueMinor: 0n,
    grossProfitMinor: 0n,
    coverage: {
      lineItemsTotal: 0,
      lineItemsWithExplicitCogs: 0,
      lineItemsUsingDefaultMargin: 0,
      lineItemsWithoutAnyCost: 0,
    },
    byProduct: new Map(),
  };
}

function deltaPct(current: bigint, previous: bigint): number | null {
  if (previous === 0n) return null;
  // Convert to Number safely — these are minor units; for a 90-day budget the
  // values fit well within Number.MAX_SAFE_INTEGER (~9e15 minor = $90T).
  return ((Number(current) - Number(previous)) / Number(previous)) * 100;
}

function deltaPctNum(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ---- Aggregation ----

function aggregateOrders(orders: OrderNode[], lookup: CogsLookup): ProfitAggregate {
  const agg = emptyAggregate();

  for (const order of orders) {
    agg.ordersCounted += 1;

    for (const edge of order.lineItems.edges) {
      const li = edge.node;
      const netQty = li.refundableQuantity;
      if (netQty <= 0) continue;
      const qty = BigInt(netQty);

      const unitPriceMinor = moneyToMinor(li.discountedUnitPriceSet.shopMoney.amount);
      const lineRevenueMinor = unitPriceMinor * qty;

      agg.coverage.lineItemsTotal += 1;
      agg.grossRevenueMinor += lineRevenueMinor;

      const variantId = li.variant?.id ?? null;
      const resolved = lookup.resolve(variantId, unitPriceMinor);

      let lineProfitMinor: bigint;
      if (resolved.source === "explicit") {
        agg.coverage.lineItemsWithExplicitCogs += 1;
        lineProfitMinor = lineRevenueMinor - resolved.costMinor * qty;
      } else if (resolved.source === "default_margin") {
        agg.coverage.lineItemsUsingDefaultMargin += 1;
        lineProfitMinor = lineRevenueMinor - resolved.costMinor * qty;
      } else {
        agg.coverage.lineItemsWithoutAnyCost += 1;
        lineProfitMinor = 0n; // do not contribute to profit
      }
      agg.grossProfitMinor += lineProfitMinor;

      const productId = li.product?.id;
      const productTitle = li.product?.title;
      if (productId && productTitle) {
        const existing = agg.byProduct.get(productId) ?? {
          product_id: productId,
          title: productTitle,
          profitMinor: 0n,
          revenueMinor: 0n,
          units: 0,
        };
        existing.profitMinor += lineProfitMinor;
        existing.revenueMinor += lineRevenueMinor;
        existing.units += netQty;
        agg.byProduct.set(productId, existing);
      }
    }
  }

  return agg;
}

function priorRange(range: DateRange, mode: ComparisonMode): DateRange | null {
  if (mode === "none") return null;
  const start = new Date(range.start);
  const end = new Date(range.end);
  const lengthMs = end.getTime() - start.getTime();
  if (mode === "previous_period") {
    return {
      preset: "custom",
      start: new Date(start.getTime() - lengthMs).toISOString(),
      end: new Date(start.getTime()).toISOString(),
    };
  }
  const yearMs = 365 * 24 * 60 * 60 * 1000;
  return {
    preset: "custom",
    start: new Date(start.getTime() - yearMs).toISOString(),
    end: new Date(end.getTime() - yearMs).toISOString(),
  };
}

function topProductsFrom(
  agg: ProfitAggregate,
  currency: string,
  limit = 10,
): TopProfitableProduct[] {
  const items = Array.from(agg.byProduct.values())
    .sort((a, b) => {
      // Sort by profit desc; treat negative profit ranks below zero too.
      if (b.profitMinor === a.profitMinor) return 0;
      return b.profitMinor > a.profitMinor ? 1 : -1;
    })
    .slice(0, limit);
  return items.map((p) => ({
    product_id: p.product_id,
    title: p.title,
    gross_profit: minorToMoney(p.profitMinor, currency),
    gross_margin: p.revenueMinor === 0n ? 0 : Number(p.profitMinor) / Number(p.revenueMinor),
    units_sold: p.units,
  }));
}

// ---- Public API ----

export type ComputeProfitOptions = {
  range: DateRange;
  comparison: ComparisonMode;
};

export async function computeProfit(
  graphql: GraphQLClient,
  opts: ComputeProfitOptions,
): Promise<ProfitMetrics> {
  const [{ data: shopData }, currentOrders] = await Promise.all([
    graphql<{ shop: { currencyCode: string; ianaTimezone: string } }>(SHOP_CURRENCY_QUERY),
    fetchOrdersForRange(graphql, opts.range),
  ]);
  const currency = shopData.shop.currencyCode;

  const cogs = await readCogsState(graphql, currency);
  const lookup = buildLookup(cogs.meta, cogs.entries);

  const currentAgg = aggregateOrders(currentOrders.orders, lookup);

  const prior = priorRange(opts.range, opts.comparison);
  const previous = prior ? await fetchOrdersForRange(graphql, prior) : null;
  const previousAgg = previous ? aggregateOrders(previous.orders, lookup) : null;

  const grossRevenueMinor = currentAgg.grossRevenueMinor;
  const grossProfitMinor = currentAgg.grossProfitMinor;
  const grossMargin =
    grossRevenueMinor === 0n ? 0 : Number(grossProfitMinor) / Number(grossRevenueMinor);
  const profitPerOrderMinor =
    currentAgg.ordersCounted === 0
      ? 0n
      : grossProfitMinor / BigInt(currentAgg.ordersCounted);

  // Comparison deltas.
  const comparison_delta: ProfitDelta = {
    gross_revenue: previousAgg ? deltaPct(grossRevenueMinor, previousAgg.grossRevenueMinor) : null,
    gross_profit: previousAgg ? deltaPct(grossProfitMinor, previousAgg.grossProfitMinor) : null,
    gross_margin: null,
    profit_per_order: null,
  };
  if (previousAgg) {
    const prevMargin =
      previousAgg.grossRevenueMinor === 0n
        ? 0
        : Number(previousAgg.grossProfitMinor) / Number(previousAgg.grossRevenueMinor);
    comparison_delta.gross_margin = grossMargin - prevMargin;
    const prevPpoMinor =
      previousAgg.ordersCounted === 0
        ? 0n
        : previousAgg.grossProfitMinor / BigInt(previousAgg.ordersCounted);
    comparison_delta.profit_per_order = deltaPctNum(
      Number(profitPerOrderMinor),
      Number(prevPpoMinor),
    );
  }

  const granularity = pickGranularity(opts.range);
  const margin_series = buildMarginSeries(currentOrders.orders, lookup, opts.range, granularity);

  return {
    range: opts.range,
    comparison: opts.comparison,
    gross_revenue: minorToMoney(grossRevenueMinor, currency) as Money,
    gross_profit: minorToMoney(grossProfitMinor, currency) as Money,
    gross_margin: grossMargin,
    profit_per_order: minorToMoney(profitPerOrderMinor, currency) as Money,
    orders_counted: currentAgg.ordersCounted,
    cogs_coverage: currentAgg.coverage,
    top_profitable_products: topProductsFrom(currentAgg, currency),
    comparison_delta,
    truncated: currentOrders.truncated,
    history_clamped_to: null, // set by route handler when applicable
    default_margin_pct: cogs.meta.defaultMarginPct,
    has_any_cogs: lookup.hasAny,
    granularity,
    margin_series,
  };
}

// Exported for unit tests.
export const _internal = { aggregateOrders, topProductsFrom };
