/**
 * F44 — Sales by Variant.
 *
 * Walks `orders.lineItems` grouped by variant.id. Per-variant metrics:
 *   - units sold, revenue, refunded units, return rate, avg price
 *
 * Free: top 20 variants by revenue. Pro: full list.
 */

import type {
  DateRange,
  HistoryClamp,
  Plan,
  VariantSalesResponse,
  VariantSalesRow,
} from "@fbc/shared";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";
import type { VariantOrderNode } from "./queries.js";

const FREE_VARIANT_CAP = 20;

type Accumulator = {
  variant_id: string;
  product_id: string;
  product_title: string;
  variant_title: string | null;
  sku: string | null;
  units_sold: number;
  refunded_units: number;
  revenue_minor: bigint;
};

function detectCurrency(orders: VariantOrderNode[]): string {
  for (const o of orders) {
    for (const e of o.lineItems.edges) {
      const code = e.node.originalTotalSet.shopMoney.currencyCode;
      if (code) return code;
    }
  }
  return "USD";
}

export function computeVariantSales(
  orders: VariantOrderNode[],
  plan: Plan,
  range: DateRange,
  truncated: boolean,
  historyClampedTo: HistoryClamp | null,
): VariantSalesResponse {
  const currency = detectCurrency(orders);
  const buckets = new Map<string, Accumulator>();

  for (const o of orders) {
    for (const edge of o.lineItems.edges) {
      const li = edge.node;
      if (!li.variant?.id) continue;
      const vid = li.variant.id;
      const acc = buckets.get(vid) ?? {
        variant_id: vid,
        product_id: li.product?.id ?? "",
        product_title: li.product?.title ?? "(unknown product)",
        variant_title: li.variant.title ?? null,
        sku: li.variant.sku ?? li.sku ?? null,
        units_sold: 0,
        refunded_units: 0,
        revenue_minor: 0n,
      };
      acc.units_sold += li.quantity;
      acc.revenue_minor += moneyToMinor(li.originalTotalSet.shopMoney.amount);
      buckets.set(vid, acc);
    }
    for (const refund of o.refunds) {
      for (const rliEdge of refund.refundLineItems.edges) {
        const rli = rliEdge.node;
        const vid = rli.lineItem?.variant?.id;
        if (!vid) continue;
        const acc = buckets.get(vid);
        if (acc) acc.refunded_units += rli.quantity;
      }
    }
  }

  const allRows: VariantSalesRow[] = Array.from(buckets.values()).map((acc) => {
    const avgPriceMinor =
      acc.units_sold > 0 ? acc.revenue_minor / BigInt(acc.units_sold) : 0n;
    const returnRate =
      acc.units_sold > 0 ? acc.refunded_units / acc.units_sold : 0;
    return {
      variant_id: acc.variant_id,
      product_id: acc.product_id,
      product_title: acc.product_title,
      variant_title: acc.variant_title,
      sku: acc.sku,
      units_sold: acc.units_sold,
      refunded_units: acc.refunded_units,
      return_rate_pct: returnRate,
      revenue: minorToMoney(acc.revenue_minor, currency),
      avg_price: minorToMoney(avgPriceMinor, currency),
    };
  });

  allRows.sort((a, b) => {
    const aRev = moneyToMinor(a.revenue.amount);
    const bRev = moneyToMinor(b.revenue.amount);
    return bRev > aRev ? 1 : bRev < aRev ? -1 : 0;
  });

  const totalCount = allRows.length;
  const planCap = plan === "free" ? FREE_VARIANT_CAP : null;
  const rows = planCap !== null ? allRows.slice(0, planCap) : allRows;

  return {
    range,
    rows,
    truncated,
    history_clamped_to: historyClampedTo,
    total_count: totalCount,
    plan_capped_to: planCap,
  };
}

// Exported for unit tests
export const _internal = { computeVariantSales };
