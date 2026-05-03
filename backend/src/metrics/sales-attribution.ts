/**
 * F33 — Sales Attribution.
 *
 * Aggregates orders + line items into one of four pivots:
 *   - vendor       — from lineItem.product.vendor
 *   - type         — from lineItem.product.productType
 *   - channel      — from order.sourceName (e.g. "web", "pos", "draft_order")
 *   - pos_location — from order.physicalLocation.name (Pro only)
 *
 * Free plan caps to 90 days (clamped upstream) and does not allow `pos_location`.
 * Pro removes the gate.
 */

import type {
  DateRange,
  HistoryClamp,
  Plan,
  SalesAttributionGroupBy,
  SalesAttributionResponse,
  SalesAttributionRow,
} from "@fbc/shared";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";
import type { AttributionOrderNode } from "./queries.js";

const FREE_ROW_CAP = 50;

type Accumulator = {
  key: string;
  orders: Set<string>;
  units: number;
  revenue_minor: bigint;
  refund_units: number;
};

function unknownLabel(by: SalesAttributionGroupBy): string {
  switch (by) {
    case "vendor":
      return "(no vendor)";
    case "type":
      return "(no product type)";
    case "channel":
      return "(unknown)";
    case "pos_location":
      return "(no location)";
  }
}

function detectCurrency(orders: AttributionOrderNode[]): string {
  for (const o of orders) {
    const code = o.totalPriceSet.shopMoney.currencyCode;
    if (code) return code;
  }
  return "USD";
}

export function computeSalesAttribution(
  orders: AttributionOrderNode[],
  by: SalesAttributionGroupBy,
  plan: Plan,
  range: DateRange,
  truncated: boolean,
  historyClampedTo: HistoryClamp | null,
): SalesAttributionResponse {
  const proOnly = by === "pos_location";
  if (proOnly && plan === "free") {
    return {
      range,
      by,
      rows: [],
      truncated: false,
      history_clamped_to: historyClampedTo,
      pro_only: true,
      total_count: 0,
      plan_capped_to: null,
    };
  }

  const currency = detectCurrency(orders);
  const buckets = new Map<string, Accumulator>();

  function bumpOrderLevel(o: AttributionOrderNode, key: string): void {
    const acc = buckets.get(key) ?? {
      key,
      orders: new Set(),
      units: 0,
      revenue_minor: 0n,
      refund_units: 0,
    };
    acc.orders.add(o.id);
    buckets.set(key, acc);
  }

  for (const o of orders) {
    if (by === "channel") {
      const key = o.sourceName ?? unknownLabel(by);
      bumpOrderLevel(o, key);
      const acc = buckets.get(key)!;
      const orderRev = moneyToMinor(o.totalPriceSet.shopMoney.amount);
      const orderRefund = moneyToMinor(o.totalRefundedSet.shopMoney.amount);
      acc.revenue_minor += orderRev - orderRefund;
      // Channel-level units = total line item quantity in the order.
      let unitTotal = 0;
      for (const e of o.lineItems.edges) unitTotal += e.node.quantity;
      acc.units += unitTotal;
      // Refund units across all line items in this order.
      for (const r of o.refunds) {
        for (const e of r.refundLineItems.edges) acc.refund_units += e.node.quantity;
      }
      continue;
    }

    if (by === "pos_location") {
      const key = o.physicalLocation?.name ?? unknownLabel(by);
      bumpOrderLevel(o, key);
      const acc = buckets.get(key)!;
      const orderRev = moneyToMinor(o.totalPriceSet.shopMoney.amount);
      const orderRefund = moneyToMinor(o.totalRefundedSet.shopMoney.amount);
      acc.revenue_minor += orderRev - orderRefund;
      let unitTotal = 0;
      for (const e of o.lineItems.edges) unitTotal += e.node.quantity;
      acc.units += unitTotal;
      for (const r of o.refunds) {
        for (const e of r.refundLineItems.edges) acc.refund_units += e.node.quantity;
      }
      continue;
    }

    // vendor / type — line-item-level pivot
    for (const edge of o.lineItems.edges) {
      const li = edge.node;
      const key =
        by === "vendor"
          ? li.product?.vendor ?? unknownLabel(by)
          : li.product?.productType ?? unknownLabel(by);
      const acc = buckets.get(key) ?? {
        key,
        orders: new Set<string>(),
        units: 0,
        revenue_minor: 0n,
        refund_units: 0,
      };
      acc.orders.add(o.id);
      acc.units += li.quantity;
      acc.revenue_minor += moneyToMinor(li.originalTotalSet.shopMoney.amount);
      buckets.set(key, acc);
    }
    // Refund attribution by line-item product (vendor/type)
    for (const r of o.refunds) {
      for (const rliEdge of r.refundLineItems.edges) {
        const rli = rliEdge.node;
        if (!rli.lineItem) continue;
        const product = rli.lineItem.product;
        const key =
          by === "vendor"
            ? product?.vendor ?? unknownLabel(by)
            : product?.productType ?? unknownLabel(by);
        const acc = buckets.get(key);
        if (acc) acc.refund_units += rli.quantity;
      }
    }
  }

  const allRows: SalesAttributionRow[] = Array.from(buckets.values()).map((acc) => {
    const orderCount = acc.orders.size;
    const aovMinor = orderCount > 0 ? acc.revenue_minor / BigInt(orderCount) : 0n;
    const returnRate = acc.units > 0 ? acc.refund_units / acc.units : 0;
    return {
      key: acc.key,
      orders: orderCount,
      units: acc.units,
      revenue: minorToMoney(acc.revenue_minor, currency),
      aov: minorToMoney(aovMinor, currency),
      return_rate_pct: returnRate,
    };
  });

  allRows.sort((a, b) => {
    const aRev = moneyToMinor(a.revenue.amount);
    const bRev = moneyToMinor(b.revenue.amount);
    return bRev > aRev ? 1 : bRev < aRev ? -1 : 0;
  });

  const totalCount = allRows.length;
  const planCap = plan === "free" ? FREE_ROW_CAP : null;
  const rows = planCap !== null ? allRows.slice(0, planCap) : allRows;

  return {
    range,
    by,
    rows,
    truncated,
    history_clamped_to: historyClampedTo,
    pro_only: false,
    total_count: totalCount,
    plan_capped_to: planCap,
  };
}

// Exported for unit tests
export const _internal = { computeSalesAttribution, unknownLabel };
