/**
 * F21: RFM Customer Segmentation.
 *
 * Scores each customer on Recency (days since last order), Frequency (order count),
 * and Monetary (total revenue) within the selected date range. Customers are
 * bucketed into quintiles (1-5) on each dimension, then mapped to segments.
 *
 * Segment definitions (standard RFM matrix):
 *   champions        R=4-5, F=4-5 — buy often, spent most, ordered recently
 *   loyal            R=2-5, F=3-4
 *   potential_loyalist R=3-5, F=1-3
 *   at_risk          R=2-3, F=2-5 — used to buy often but haven't recently
 *   cant_lose        R=0-1, F=4-5 — big spenders who haven't ordered recently
 *   hibernating      R=1-2, F=1-2 — low recency + low frequency
 *   lost             R=0-1, F=0-2 — very low recency + low frequency
 */

import type {
  DateRange,
  HistoryClamp,
  Money,
  RfmResponse,
  RfmSegmentLabel,
  RfmSegmentRow,
} from "@fbc/shared";
import type { OrderNode } from "./queries.js";
import { moneyToMinor, minorToMoney } from "../cogs/lookup.js";

type CustomerRfm = {
  customerId: string;
  daysSinceLast: number;
  orders: number;
  revenueMinor: bigint;
};

type RfmScore = { r: number; f: number; m: number }; // 1-5

function quintile(value: number, sorted: number[]): number {
  if (sorted.length === 0) return 3;
  const rank = sorted.findIndex((v) => value <= v);
  if (rank < 0) return 5;
  return Math.ceil(((rank + 1) / sorted.length) * 5);
}

function segmentFor(r: number, f: number): RfmSegmentLabel {
  if (r >= 4 && f >= 4) return "champions";
  if (r >= 2 && f >= 3) return "loyal";
  if (r >= 3 && f >= 1) return "potential_loyalist";
  if (r >= 0 && r <= 1 && f >= 4) return "cant_lose";
  if (r >= 2 && r <= 3 && f >= 2) return "at_risk";
  if (r >= 1 && r <= 2 && f <= 2) return "hibernating";
  return "lost";
}

export function computeRfm(
  orders: OrderNode[],
  currency: string,
  range: DateRange,
  truncated: boolean,
  historyClampedTo: HistoryClamp | null,
): RfmResponse {
  const rangeEnd = new Date(range.end);

  // Aggregate per-customer stats
  const byCustomer = new Map<
    string,
    { lastOrder: Date; orders: number; revenueMinor: bigint; daysSinceLast: number }
  >();

  for (const order of orders) {
    if (!order.customer?.id) continue;
    const cid = order.customer.id;
    const d = new Date(order.processedAt);
    const rev = moneyToMinor(order.totalPriceSet.shopMoney.amount);
    const existing = byCustomer.get(cid);
    if (!existing) {
      byCustomer.set(cid, { lastOrder: d, orders: 1, revenueMinor: rev, daysSinceLast: 0 });
    } else {
      if (d > existing.lastOrder) existing.lastOrder = d;
      existing.orders += 1;
      existing.revenueMinor += rev;
    }
  }

  const customers: CustomerRfm[] = [];
  for (const [cid, data] of byCustomer) {
    const daysSinceLast = Math.floor((rangeEnd.getTime() - data.lastOrder.getTime()) / 86_400_000);
    customers.push({ customerId: cid, daysSinceLast, orders: data.orders, revenueMinor: data.revenueMinor });
  }

  if (customers.length === 0) {
    return {
      range,
      segments: [],
      total_customers: 0,
      truncated,
      history_clamped_to: historyClampedTo,
    };
  }

  // Build sorted arrays for quintile computation
  // For recency: lower = better, so we sort ascending and invert the quintile score
  const sortedDays = [...customers.map((c) => c.daysSinceLast)].sort((a, b) => a - b);
  const sortedOrders = [...customers.map((c) => c.orders)].sort((a, b) => a - b);
  const sortedRevenue = [...customers.map((c) => Number(c.revenueMinor))].sort((a, b) => a - b);

  // Score each customer
  const scored: Array<{ cid: string; score: RfmScore; c: CustomerRfm }> = customers.map((c) => {
    const rRaw = quintile(c.daysSinceLast, sortedDays);
    const r = 6 - rRaw; // invert: lower days = higher recency score
    const f = quintile(c.orders, sortedOrders);
    const m = quintile(Number(c.revenueMinor), sortedRevenue);
    return { cid: c.customerId, score: { r, f, m }, c };
  });

  // Group by segment
  const segMap = new Map<RfmSegmentLabel, { count: number; totalOrders: number; totalMinor: bigint; totalDays: number }>();
  for (const { score, c } of scored) {
    const seg = segmentFor(score.r, score.f);
    const existing = segMap.get(seg) ?? { count: 0, totalOrders: 0, totalMinor: 0n, totalDays: 0 };
    existing.count += 1;
    existing.totalOrders += c.orders;
    existing.totalMinor += c.revenueMinor;
    existing.totalDays += c.daysSinceLast;
    segMap.set(seg, existing);
  }

  const total = customers.length;
  const SEGMENT_ORDER: RfmSegmentLabel[] = [
    "champions", "loyal", "potential_loyalist", "at_risk", "cant_lose", "hibernating", "lost",
  ];

  const segments: RfmSegmentRow[] = SEGMENT_ORDER.filter((s) => segMap.has(s)).map((seg) => {
    const d = segMap.get(seg)!;
    const avgRevMinor = d.count > 0 ? d.totalMinor / BigInt(d.count) : 0n;
    return {
      segment: seg,
      count: d.count,
      pct_of_customers: d.count / total,
      avg_orders: d.count > 0 ? d.totalOrders / d.count : 0,
      avg_revenue: minorToMoney(avgRevMinor, currency) as Money,
      avg_days_since_last: d.count > 0 ? Math.round(d.totalDays / d.count) : 0,
    };
  });

  return {
    range,
    segments,
    total_customers: total,
    truncated,
    history_clamped_to: historyClampedTo,
  };
}
