import type {
  DiscountCodeRow,
  DiscountCodesResponse,
  Money,
  Plan,
  DateRange,
} from "@fbc/shared";
import type { OrderNode } from "./queries.js";
import { moneyToMinor, minorToMoney } from "../cogs/lookup.js";

const FREE_DISCOUNT_CAP = 10;
const MIN_CUSTOMERS_FOR_REPEAT_RATE = 5;

type CodeAccumulator = {
  code: string;
  orders: number;
  revenue_minor: bigint;
  gross_minor: bigint;
  customer_ids: Set<string>;
  repeat_customers: number;
};

export function computeDiscountCodes(
  orders: OrderNode[],
  currency: string,
  plan: Plan,
  range: DateRange,
  truncated: boolean,
): DiscountCodesResponse {
  const byCode = new Map<string, CodeAccumulator>();

  for (const order of orders) {
    if (!order.discountCodes || order.discountCodes.length === 0) continue;

    const grossMinor = moneyToMinor(order.totalPriceSet.shopMoney.amount);
    const refundedMinor = moneyToMinor(order.totalRefundedSet.shopMoney.amount);
    const netRevenueMinor = grossMinor - refundedMinor;

    // Compute order-level discount: sum of (originalTotal - discountedTotal) per line item
    let orderDiscountMinor = 0n;
    for (const edge of order.lineItems.edges) {
      const li = edge.node;
      const origMinor = moneyToMinor(li.originalTotalSet.shopMoney.amount);
      const discMinor = moneyToMinor(li.discountedUnitPriceSet.shopMoney.amount) * BigInt(li.quantity);
      const diff = origMinor - discMinor;
      if (diff > 0n) orderDiscountMinor += diff;
    }

    for (const dc of order.discountCodes) {
      const code = dc.toUpperCase();
      const acc = byCode.get(code) ?? {
        code,
        orders: 0,
        revenue_minor: 0n,
        gross_minor: 0n,
        customer_ids: new Set<string>(),
        repeat_customers: 0,
      };

      acc.orders += 1;
      acc.revenue_minor += netRevenueMinor;
      acc.gross_minor += grossMinor;

      if (order.customer?.id) {
        const isNew = !acc.customer_ids.has(order.customer.id);
        acc.customer_ids.add(order.customer.id);
        if (isNew && (order.customer.numberOfOrders ?? 1) > 1) {
          acc.repeat_customers += 1;
        }
      }

      byCode.set(code, acc);
    }
  }

  const allRows = Array.from(byCode.values())
    .map((acc): DiscountCodeRow => {
      const grossWithDiscount = acc.gross_minor;
      const avgDiscountPct =
        grossWithDiscount > 0n
          ? Number(orderDiscountFromAcc(acc)) / Number(grossWithDiscount)
          : 0;
      const aovMinor = acc.orders > 0 ? acc.revenue_minor / BigInt(acc.orders) : 0n;
      const uniqueCustomers = acc.customer_ids.size;
      const repeatRate =
        uniqueCustomers >= MIN_CUSTOMERS_FOR_REPEAT_RATE
          ? acc.repeat_customers / uniqueCustomers
          : null;

      return {
        code: acc.code,
        orders: acc.orders,
        revenue: minorToMoney(acc.revenue_minor, currency) as Money,
        avg_discount_pct: avgDiscountPct,
        avg_order_value: minorToMoney(aovMinor, currency) as Money,
        repeat_customer_rate: repeatRate,
      };
    })
    .sort((a, b) => b.orders - a.orders);

  const totalCount = allRows.length;
  const planCap = plan === "free" ? FREE_DISCOUNT_CAP : null;
  const codes = planCap !== null ? allRows.slice(0, planCap) : allRows;

  return {
    range,
    codes,
    truncated,
    history_clamped_to: null,
    total_count: totalCount,
    plan_capped_to: planCap,
  };
}

// Helper: we can't track order-level discount sum per code easily without storing it
// so we approximate avg_discount_pct from gross vs revenue
function orderDiscountFromAcc(acc: CodeAccumulator): bigint {
  const discount = acc.gross_minor - acc.revenue_minor;
  return discount > 0n ? discount : 0n;
}
