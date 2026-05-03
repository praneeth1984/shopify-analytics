/**
 * F47 — Monthly orders vs returns aggregation.
 *
 * Bucket each order by its `processedAt` calendar month (UTC) and tally:
 *   - orders             — total orders that month
 *   - returned_orders    — orders with at least one refund
 *   - gross_revenue      — sum of totalPriceSet
 *   - refunded           — sum of totalRefundedSet
 *   - net_revenue        — gross_revenue − refunded
 *   - return_rate_pct    — (returned_orders / orders) × 100
 *
 * Free plan: caller passes 6-month window. Pro: 12-month window.
 * The transformer is plan-agnostic; clamping is the caller's responsibility.
 */

import type { Money } from "@fbc/shared";
import type { OrderNode } from "./queries.js";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";

export type MonthlyReturnRow = {
  month: string; // "YYYY-MM"
  orders: number;
  returned_orders: number;
  return_rate_pct: number;
  gross_revenue: Money;
  refunded: Money;
  net_revenue: Money;
};

type Bucket = {
  orders: number;
  returnedOrders: number;
  grossMinor: bigint;
  refundedMinor: bigint;
};

function emptyBucket(): Bucket {
  return { orders: 0, returnedOrders: 0, grossMinor: 0n, refundedMinor: 0n };
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Build the ordered list of YYYY-MM keys ending at the most recent month
 * (inclusive of `now`'s month) and going back `monthsBack` months total.
 */
export function buildMonthSequence(monthsBack: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
    keys.push(`${y}-${m}`);
  }
  return keys;
}

/**
 * Compute the UTC ISO start (inclusive) and end (exclusive) of a window that
 * spans `monthsBack` calendar months ending with `now`'s month. End is the
 * first day of the month after `now`.
 */
export function monthlyWindowRange(
  monthsBack: number,
  now: Date = new Date(),
): { start: string; end: string } {
  const startMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1),
  );
  const endMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: startMonth.toISOString(), end: endMonth.toISOString() };
}

function detectCurrency(orders: OrderNode[]): string {
  for (const o of orders) {
    const code = o.totalPriceSet.shopMoney.currencyCode;
    if (code) return code;
  }
  return "USD";
}

export function computeMonthlyReturns(
  orders: OrderNode[],
  monthsBack: number,
  now: Date = new Date(),
): MonthlyReturnRow[] {
  const months = buildMonthSequence(monthsBack, now);
  const buckets = new Map<string, Bucket>();
  for (const m of months) buckets.set(m, emptyBucket());

  const currency = detectCurrency(orders);

  for (const o of orders) {
    const key = monthKey(o.processedAt);
    const b = buckets.get(key);
    if (!b) continue; // outside the requested window
    b.orders += 1;
    b.grossMinor += moneyToMinor(o.totalPriceSet.shopMoney.amount);
    b.refundedMinor += moneyToMinor(o.totalRefundedSet.shopMoney.amount);
    if (o.refunds.length > 0) {
      b.returnedOrders += 1;
    }
  }

  return months.map((m) => {
    const b = buckets.get(m) ?? emptyBucket();
    const rate = b.orders === 0 ? 0 : (b.returnedOrders / b.orders) * 100;
    return {
      month: m,
      orders: b.orders,
      returned_orders: b.returnedOrders,
      return_rate_pct: Number(rate.toFixed(2)),
      gross_revenue: minorToMoney(b.grossMinor, currency),
      refunded: minorToMoney(b.refundedMinor, currency),
      net_revenue: minorToMoney(b.grossMinor - b.refundedMinor, currency),
    };
  });
}
