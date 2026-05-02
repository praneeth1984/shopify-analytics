import type {
  TopCustomerRow,
  TopCustomersResponse,
  Money,
  Plan,
  DateRange,
} from "@fbc/shared";
import type { OrderNode } from "./queries.js";
import { moneyToMinor, minorToMoney } from "../cogs/lookup.js";
const FREE_CUSTOMER_CAP = 10;
const INSUFFICIENT_DATA_THRESHOLD = 5;

type CustomerAccumulator = {
  customer_id: string;
  revenue_minor: bigint;
  orders: number;
  last_order_date: string;
};

export function computeTopCustomers(
  orders: OrderNode[],
  currency: string,
  plan: Plan,
  range: DateRange,
  truncated: boolean,
): TopCustomersResponse {
  const byCustomer = new Map<string, CustomerAccumulator>();

  for (const order of orders) {
    if (!order.customer?.id) continue;
    const custId = order.customer.id;
    const grossMinor = moneyToMinor(order.totalPriceSet.shopMoney.amount);
    const refundedMinor = moneyToMinor(order.totalRefundedSet.shopMoney.amount);
    const netMinor = grossMinor - refundedMinor;

    const acc = byCustomer.get(custId) ?? {
      customer_id: custId,
      revenue_minor: 0n,
      orders: 0,
      last_order_date: order.processedAt,
    };

    acc.revenue_minor += netMinor;
    acc.orders += 1;
    if (order.processedAt > acc.last_order_date) {
      acc.last_order_date = order.processedAt;
    }
    byCustomer.set(custId, acc);
  }

  const now = new Date();
  const sorted = Array.from(byCustomer.values()).sort((a, b) => {
    if (b.revenue_minor === a.revenue_minor) return 0;
    return b.revenue_minor > a.revenue_minor ? 1 : -1;
  });

  const totalCount = sorted.length;
  const planCap = plan === "free" ? FREE_CUSTOMER_CAP : null;
  const sliced = planCap !== null ? sorted.slice(0, planCap) : sorted;

  const customers: TopCustomerRow[] = sliced.map((acc, i) => {
    const aovMinor = acc.orders > 0 ? acc.revenue_minor / BigInt(acc.orders) : 0n;
    const daysSince = Math.floor(
      (now.getTime() - new Date(acc.last_order_date).getTime()) / 86_400_000,
    );
    return {
      rank: i + 1,
      masked_email: `Customer #${acc.customer_id.split("/").pop() ?? acc.customer_id}`,
      total_revenue: minorToMoney(acc.revenue_minor, currency) as Money,
      orders: acc.orders,
      aov: minorToMoney(aovMinor, currency) as Money,
      last_order_date: acc.last_order_date,
      days_since_last: daysSince,
    };
  });

  return {
    range,
    customers,
    truncated,
    history_clamped_to: null,
    total_count: totalCount,
    plan_capped_to: planCap,
    insufficient_data: totalCount < INSUFFICIENT_DATA_THRESHOLD,
  };
}
