import type { RepeatRateMetrics, Plan, DateRange } from "@fbc/shared";
import type { OrderNode } from "./queries.js";
import { moneyToMinor } from "../cogs/lookup.js";

const MIN_FIRST_TIME_CUSTOMERS = 20;

type RepeatStats = {
  repeatRate: number;
  revFromRepeatPct: number;
  firstTimeCount: number;
};

function calcRepeatStats(orders: OrderNode[]): RepeatStats {
  let totalRevenueMinor = 0n;
  let repeatRevenueMinor = 0n;
  let firstTimeCustomers = 0;
  let repeatCustomers = 0;

  const seenCustomers = new Set<string>();

  for (const order of orders) {
    const grossMinor = moneyToMinor(order.totalPriceSet.shopMoney.amount);
    const refundedMinor = moneyToMinor(order.totalRefundedSet.shopMoney.amount);
    const netMinor = grossMinor - refundedMinor;
    totalRevenueMinor += netMinor;

    if (!order.customer?.id) continue;
    const custId = order.customer.id;
    if (seenCustomers.has(custId)) continue;
    seenCustomers.add(custId);

    const isRepeat = (order.customer.numberOfOrders ?? 1) > 1;
    if (isRepeat) {
      repeatCustomers += 1;
      repeatRevenueMinor += netMinor;
    } else {
      firstTimeCustomers += 1;
    }
  }

  const totalCustomers = firstTimeCustomers + repeatCustomers;
  const repeatRate = totalCustomers > 0 ? repeatCustomers / totalCustomers : 0;
  const revFromRepeatPct =
    totalRevenueMinor > 0n ? Number(repeatRevenueMinor) / Number(totalRevenueMinor) : 0;

  return { repeatRate, revFromRepeatPct, firstTimeCount: firstTimeCustomers };
}

export function computeRepeatRate(
  currentOrders: OrderNode[],
  previousOrders: OrderNode[] | null,
  plan: Plan,
  range: DateRange,
  truncated: boolean,
): RepeatRateMetrics {
  const current = calcRepeatStats(currentOrders);
  let deltaPct: number | null = null;

  if (previousOrders) {
    const prev = calcRepeatStats(previousOrders);
    if (prev.repeatRate > 0) {
      deltaPct = ((current.repeatRate - prev.repeatRate) / prev.repeatRate) * 100;
    }
  }

  const insufficient = current.firstTimeCount < MIN_FIRST_TIME_CUSTOMERS;

  return {
    range,
    repeat_rate: insufficient ? null : current.repeatRate,
    revenue_from_repeat_pct: current.revFromRepeatPct,
    first_time_customers_in_range: current.firstTimeCount,
    repeat_rate_delta_pct: insufficient ? null : deltaPct,
    insufficient_data: insufficient,
    truncated,
    history_clamped_to: null,
  };
}
