/**
 * Time-series bucketing for the dashboard charts.
 *
 * All math is done in UTC. The dashboard charts ranges <=90 days at daily
 * granularity and longer ranges weekly (Monday-anchored ISO weeks). Money is
 * accumulated in BigInt minor units; we only convert to Number when emitting
 * the wire-level `TimeSeriesPoint.value`. Ranges of 90 days at daily
 * granularity yield at most 90 buckets, so a 9e15 Number ceiling is plenty.
 *
 * Empty buckets are emitted with a zeroed value (revenue/orders) or `null`
 * (rates that would otherwise divide by zero). Charts use `connectNulls=false`
 * so gaps render correctly.
 *
 * For the previous-period overlay we bucket the prior orders against the
 * prior range, then re-emit them under the current range's bucket keys
 * indexed positionally. This makes the dashed comparison line align
 * 1:1 on the chart's x-axis.
 */

import type { OrderNode } from "./queries.js";
import type { CogsLookup } from "../cogs/lookup.js";
import { moneyToMinor } from "../cogs/lookup.js";
import type { DateRange, DowPoint, Granularity, TimeSeriesPoint } from "@fbc/shared";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAY_GRANULARITY_THRESHOLD_DAYS = 90;
const DOW_LABELS: ReadonlyArray<DowPoint["label"]> = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

// ---- Date helpers (UTC) ----

function toUtcDate(iso: string): Date {
  return new Date(iso);
}

/** Format a Date as "YYYY-MM-DD" in UTC. */
function formatUtcDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Truncate a Date to the start of the UTC day. */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Return the Monday of the ISO week containing `d`, in UTC. ISO weeks start on
 * Monday. JS getUTCDay() returns 0 (Sun) .. 6 (Sat); we want offset to Monday.
 */
function startOfIsoWeekUtc(d: Date): Date {
  const day = startOfUtcDay(d);
  const dow = day.getUTCDay(); // 0..6, Sun..Sat
  // Days back to Monday: Sun(0)->6, Mon(1)->0, Tue(2)->1, ... Sat(6)->5
  const back = dow === 0 ? 6 : dow - 1;
  return new Date(day.getTime() - back * MS_PER_DAY);
}

// ---- Public API ----

export function pickGranularity(range: DateRange): Granularity {
  const start = toUtcDate(range.start);
  const end = toUtcDate(range.end);
  const diffDays = (end.getTime() - start.getTime()) / MS_PER_DAY;
  return diffDays <= DAY_GRANULARITY_THRESHOLD_DAYS ? "day" : "week";
}

/**
 * Compute the bucket key for an ISO date string ("YYYY-MM-DD..." or full ISO).
 * - day:   the date itself ("YYYY-MM-DD" prefix)
 * - week:  Monday of the ISO week, formatted "YYYY-MM-DD"
 */
export function bucketKey(isoDate: string, g: Granularity): string {
  if (g === "day") {
    // Take the calendar date in UTC. Slicing isoDate's first 10 chars works
    // when the timestamp is already UTC ("Z" or "+00:00"); for other offsets
    // we need to convert. Be safe: use UTC components.
    return formatUtcDate(toUtcDate(isoDate));
  }
  return formatUtcDate(startOfIsoWeekUtc(toUtcDate(isoDate)));
}

/**
 * Enumerate all bucket keys covering [range.start, range.end). The end bound
 * matches the orders-fetch query convention (exclusive end). The first bucket
 * is anchored to the start (or its containing Monday on weekly).
 */
export function enumerateBuckets(range: DateRange, g: Granularity): string[] {
  const start = toUtcDate(range.start);
  const end = toUtcDate(range.end);
  const out: string[] = [];

  if (g === "day") {
    let cursor = startOfUtcDay(start);
    const stop = end.getTime();
    while (cursor.getTime() < stop) {
      out.push(formatUtcDate(cursor));
      cursor = new Date(cursor.getTime() + MS_PER_DAY);
    }
    return out;
  }

  // week: walk Monday-by-Monday from the Monday of `start` until past `end`.
  let cursor = startOfIsoWeekUtc(start);
  const stop = end.getTime();
  while (cursor.getTime() < stop) {
    out.push(formatUtcDate(cursor));
    cursor = new Date(cursor.getTime() + 7 * MS_PER_DAY);
  }
  return out;
}

// ---- Bucketing primitives ----

type RevOrdBucket = { revenueMinor: bigint; orderCount: number };

function emptyBucketMap(keys: string[]): Map<string, RevOrdBucket> {
  const m = new Map<string, RevOrdBucket>();
  for (const k of keys) m.set(k, { revenueMinor: 0n, orderCount: 0 });
  return m;
}

function isReturnedOrder(order: OrderNode): boolean {
  return order.returnStatus === "RETURNED" || order.returnStatus === "INSPECTION_COMPLETE";
}

// ---- Public series builders ----

export function buildRevenueAndOrdersSeries(
  orders: OrderNode[],
  range: DateRange,
  g: Granularity,
): { revenue_series: TimeSeriesPoint[]; orders_series: TimeSeriesPoint[] } {
  const keys = enumerateBuckets(range, g);
  const buckets = emptyBucketMap(keys);

  for (const o of orders) {
    const key = bucketKey(o.processedAt, g);
    const b = buckets.get(key);
    if (!b) continue; // out of range — defensive guard
    b.revenueMinor +=
      moneyToMinor(o.totalPriceSet.shopMoney.amount) -
      moneyToMinor(o.totalRefundedSet.shopMoney.amount);
    b.orderCount += 1;
  }

  const revenue_series: TimeSeriesPoint[] = [];
  const orders_series: TimeSeriesPoint[] = [];
  for (const k of keys) {
    const b = buckets.get(k)!;
    revenue_series.push({ date: k, value: Number(b.revenueMinor) });
    orders_series.push({ date: k, value: b.orderCount });
  }
  return { revenue_series, orders_series };
}

/**
 * Build current-range-aligned previous-period series. We bucket `prevOrders`
 * against `prevRange` so each order lands in the right prior bucket, then
 * re-emit those buckets in order under the *current* range's bucket keys.
 *
 * If the two ranges differ in length (e.g. month boundaries), we truncate to
 * `min(currentKeys.length, prevKeys.length)`; missing positions get null.
 */
export function buildAlignedPreviousSeries(
  prevOrders: OrderNode[],
  prevRange: DateRange,
  currentRange: DateRange,
  g: Granularity,
): { revenue_series: TimeSeriesPoint[]; orders_series: TimeSeriesPoint[] } {
  const currentKeys = enumerateBuckets(currentRange, g);
  const prevKeys = enumerateBuckets(prevRange, g);
  const prevBuckets = emptyBucketMap(prevKeys);

  for (const o of prevOrders) {
    const key = bucketKey(o.processedAt, g);
    const b = prevBuckets.get(key);
    if (!b) continue;
    b.revenueMinor +=
      moneyToMinor(o.totalPriceSet.shopMoney.amount) -
      moneyToMinor(o.totalRefundedSet.shopMoney.amount);
    b.orderCount += 1;
  }

  const revenue_series: TimeSeriesPoint[] = [];
  const orders_series: TimeSeriesPoint[] = [];
  for (let i = 0; i < currentKeys.length; i++) {
    const currentKey = currentKeys[i]!;
    const prevKey = prevKeys[i];
    if (prevKey === undefined) {
      revenue_series.push({ date: currentKey, value: null });
      orders_series.push({ date: currentKey, value: null });
      continue;
    }
    const b = prevBuckets.get(prevKey)!;
    revenue_series.push({ date: currentKey, value: Number(b.revenueMinor) });
    orders_series.push({ date: currentKey, value: b.orderCount });
  }
  return { revenue_series, orders_series };
}

export function buildDowSeries(orders: OrderNode[]): DowPoint[] {
  const tally: Array<{ revenueMinor: bigint; orders: number }> = [];
  for (let i = 0; i < 7; i++) tally.push({ revenueMinor: 0n, orders: 0 });

  for (const o of orders) {
    const d = toUtcDate(o.processedAt);
    const dow = d.getUTCDay(); // 0..6
    const slot = tally[dow]!;
    slot.revenueMinor +=
      moneyToMinor(o.totalPriceSet.shopMoney.amount) -
      moneyToMinor(o.totalRefundedSet.shopMoney.amount);
    slot.orders += 1;
  }

  const out: DowPoint[] = [];
  for (let i = 0; i < 7; i++) {
    const t = tally[i]!;
    out.push({
      dow: i as DowPoint["dow"],
      label: DOW_LABELS[i]!,
      revenue_minor: Number(t.revenueMinor),
      orders: t.orders,
    });
  }
  return out;
}

export function buildReturnRateSeries(
  orders: OrderNode[],
  range: DateRange,
  g: Granularity,
): TimeSeriesPoint[] {
  const keys = enumerateBuckets(range, g);
  const totals = new Map<string, { total: number; returned: number }>();
  for (const k of keys) totals.set(k, { total: 0, returned: 0 });

  for (const o of orders) {
    const key = bucketKey(o.processedAt, g);
    const t = totals.get(key);
    if (!t) continue;
    t.total += 1;
    if (isReturnedOrder(o)) t.returned += 1;
  }

  return keys.map((k) => {
    const t = totals.get(k)!;
    if (t.total === 0) return { date: k, value: null };
    // Basis points: rate * 10000 rounded to nearest integer.
    const bp = Math.round((t.returned / t.total) * 10_000);
    return { date: k, value: bp };
  });
}

export function buildMarginSeries(
  orders: OrderNode[],
  lookup: CogsLookup,
  range: DateRange,
  g: Granularity,
): TimeSeriesPoint[] {
  const keys = enumerateBuckets(range, g);
  // Per-bucket BigInt accumulators for revenue and profit, mirroring profit.ts.
  const revenue = new Map<string, bigint>();
  const profit = new Map<string, bigint>();
  for (const k of keys) {
    revenue.set(k, 0n);
    profit.set(k, 0n);
  }

  for (const order of orders) {
    const key = bucketKey(order.processedAt, g);
    if (!revenue.has(key)) continue;
    let bucketRevenue = revenue.get(key)!;
    let bucketProfit = profit.get(key)!;

    for (const edge of order.lineItems.edges) {
      const li = edge.node;
      const netQty = li.refundableQuantity;
      if (netQty <= 0) continue;
      const qty = BigInt(netQty);
      const unitPriceMinor = moneyToMinor(li.discountedUnitPriceSet.shopMoney.amount);
      const lineRevenueMinor = unitPriceMinor * qty;
      bucketRevenue += lineRevenueMinor;

      const variantId = li.variant?.id ?? null;
      const resolved = lookup.resolve(variantId, unitPriceMinor);
      if (resolved.source === "explicit" || resolved.source === "default_margin") {
        bucketProfit += lineRevenueMinor - resolved.costMinor * qty;
      }
      // "none" contributes 0 profit — same as profit.ts.
    }

    revenue.set(key, bucketRevenue);
    profit.set(key, bucketProfit);
  }

  return keys.map((k) => {
    const rev = revenue.get(k)!;
    if (rev === 0n) return { date: k, value: null };
    const prof = profit.get(k)!;
    // margin = profit / revenue, in basis points.
    const bp = Math.round((Number(prof) / Number(rev)) * 10_000);
    return { date: k, value: bp };
  });
}
