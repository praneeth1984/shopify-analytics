/**
 * F19 + F20: Cohort Retention and LTV by Acquisition Month.
 *
 * Methodology:
 * - A "new customer" in a given order is detected when `customer.numberOfOrders === 1`
 *   at order time, meaning this is their first-ever order.
 * - We group new customers by their acquisition month (processedAt month).
 * - Retention at month M = fraction of cohort customers who also placed an order in
 *   the acquisition_month + M window.
 * - LTV at month M = cumulative avg revenue per cohort customer up to that interval.
 *
 * Limitations: we only see orders in the fetched date range. Cohorts whose first order
 * falls in range can have complete retention data only for months still within range.
 */

import type {
  CohortRetentionResponse,
  CohortRow,
  DateRange,
  HistoryClamp,
  LtvByCohortResponse,
  LtvCohortRow,
  Money,
} from "@fbc/shared";
import type { OrderNode } from "./queries.js";
import { moneyToMinor, minorToMoney } from "../cogs/lookup.js";

const FREE_COHORT_CAP = 3; // Free plan: show last 3 months only

function monthKey(iso: string): string {
  return iso.slice(0, 7); // "YYYY-MM"
}

function monthsApart(fromMonth: string, toMonth: string): number {
  const [fy, fm] = fromMonth.split("-").map(Number) as [number, number];
  const [ty, tm] = toMonth.split("-").map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm);
}

type CustomerData = {
  acquisitionMonth: string;
  orderMonths: Set<string>; // all months in which they ordered
  totalRevenueMinor: bigint;
};

export function computeCohortRetention(
  orders: OrderNode[],
  plan: string,
  range: DateRange,
  truncated: boolean,
  historyClampedTo: HistoryClamp | null,
): CohortRetentionResponse {
  const customers = buildCustomerData(orders);
  const cohorts = buildCohortMap(customers);

  const sortedMonths = Array.from(cohorts.keys()).sort();
  const isFree = plan === "free";
  const visibleMonths = isFree ? sortedMonths.slice(-FREE_COHORT_CAP) : sortedMonths;

  const rows: CohortRow[] = visibleMonths.map((month) => {
    const cids = cohorts.get(month)!;
    const n = cids.length;

    function retAt(delta: number): number | null {
      const targetMonth = addMonths(month, delta);
      if (targetMonth > monthKey(range.end)) return null; // future — not yet observable
      const retained = cids.filter((cid) => customers.get(cid)!.orderMonths.has(targetMonth)).length;
      return n === 0 ? null : retained / n;
    }

    return {
      cohort_month: month,
      new_customers: n,
      retention: {
        m0: 100,
        m1: retAt(1) !== null ? (retAt(1)! * 100) : null,
        m2: retAt(2) !== null ? (retAt(2)! * 100) : null,
        m3: retAt(3) !== null ? (retAt(3)! * 100) : null,
        m6: retAt(6) !== null ? (retAt(6)! * 100) : null,
        m12: retAt(12) !== null ? (retAt(12)! * 100) : null,
      },
    };
  });

  // Weighted avg M+1 retention across all cohorts
  let sumRetained = 0;
  let sumNew = 0;
  for (const row of rows) {
    if (row.retention.m1 !== null) {
      sumRetained += (row.retention.m1 / 100) * row.new_customers;
      sumNew += row.new_customers;
    }
  }
  const overall_m1_retention = sumNew > 0 ? sumRetained / sumNew : null;

  return {
    rows,
    overall_m1_retention: overall_m1_retention !== null ? overall_m1_retention : null,
    truncated,
    history_clamped_to: historyClampedTo,
    plan_capped_to: isFree ? FREE_COHORT_CAP : null,
  };
}

export function computeLtvByCohort(
  orders: OrderNode[],
  currency: string,
  plan: string,
  range: DateRange,
  truncated: boolean,
  historyClampedTo: HistoryClamp | null,
): LtvByCohortResponse {
  const customers = buildCustomerData(orders);
  const cohorts = buildCohortMap(customers);

  const sortedMonths = Array.from(cohorts.keys()).sort();
  const isFree = plan === "free";
  const visibleMonths = isFree ? sortedMonths.slice(-FREE_COHORT_CAP) : sortedMonths;

  // For LTV, build month-level revenue maps per customer
  const customerMonthRevenue = new Map<string, Map<string, bigint>>();
  for (const order of orders) {
    if (!order.customer?.id) continue;
    const cid = order.customer.id;
    const m = monthKey(order.processedAt);
    const rev = moneyToMinor(order.totalPriceSet.shopMoney.amount);
    if (!customerMonthRevenue.has(cid)) customerMonthRevenue.set(cid, new Map());
    const monthMap = customerMonthRevenue.get(cid)!;
    monthMap.set(m, (monthMap.get(m) ?? 0n) + rev);
  }

  const rows: LtvCohortRow[] = visibleMonths.map((month) => {
    const cids = cohorts.get(month)!;
    const n = cids.length;

    function avgLtvAt(delta: number): Money | null {
      const targetMonth = addMonths(month, delta);
      if (targetMonth > monthKey(range.end)) return null;
      // cumulative revenue per customer up to and including targetMonth
      let totalMinor = 0n;
      for (const cid of cids) {
        const monthMap = customerMonthRevenue.get(cid);
        if (!monthMap) continue;
        for (const [m, rev] of monthMap) {
          if (m >= month && m <= targetMonth) totalMinor += rev;
        }
      }
      if (n === 0) return null;
      return minorToMoney(totalMinor / BigInt(n), currency) as Money;
    }

    const m0Total = cids.reduce((sum, cid) => {
      const monthMap = customerMonthRevenue.get(cid);
      return sum + (monthMap?.get(month) ?? 0n);
    }, 0n);

    return {
      cohort_month: month,
      customers: n,
      avg_ltv: {
        m0: (n > 0 ? minorToMoney(m0Total / BigInt(n), currency) : minorToMoney(0n, currency)) as Money,
        m1: avgLtvAt(1),
        m2: avgLtvAt(2),
        m3: avgLtvAt(3),
        m6: avgLtvAt(6),
        m12: avgLtvAt(12),
      },
    };
  });

  return {
    range,
    rows,
    truncated,
    history_clamped_to: historyClampedTo,
  };
}

// ---- helpers ----

function buildCustomerData(orders: OrderNode[]): Map<string, CustomerData> {
  const customers = new Map<string, CustomerData>();
  // Sort by date ascending so numberOfOrders==1 detection is reliable
  const sorted = [...orders].sort((a, b) => a.processedAt.localeCompare(b.processedAt));

  for (const order of sorted) {
    if (!order.customer?.id) continue;
    const cid = order.customer.id;
    const m = monthKey(order.processedAt);
    const rev = moneyToMinor(order.totalPriceSet.shopMoney.amount);

    if (!customers.has(cid)) {
      // Only initialise as new customer if numberOfOrders === 1
      if (order.customer.numberOfOrders === 1) {
        customers.set(cid, { acquisitionMonth: m, orderMonths: new Set([m]), totalRevenueMinor: rev });
      }
      // else: customer existed before range — skip for cohort purposes
    } else {
      const c = customers.get(cid)!;
      c.orderMonths.add(m);
      c.totalRevenueMinor += rev;
    }
  }
  return customers;
}

function buildCohortMap(customers: Map<string, CustomerData>): Map<string, string[]> {
  const cohorts = new Map<string, string[]>();
  for (const [cid, data] of customers) {
    const m = data.acquisitionMonth;
    if (!cohorts.has(m)) cohorts.set(m, []);
    cohorts.get(m)!.push(cid);
  }
  return cohorts;
}

function addMonths(monthStr: string, n: number): string {
  const [y, m] = monthStr.split("-").map(Number) as [number, number];
  const total = m - 1 + n;
  const newYear = y + Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}
