/**
 * F49 — Tag Reports.
 *
 * Three pivots, each driven off the tag-aware order shape:
 *   - order tag    — group orders by each tag in `order.tags[]`
 *   - product tag  — group line items by each tag in `lineItem.product.tags[]`
 *   - customer tag — group orders by each tag in `order.customer.tags[]` (Pro)
 *
 * Free: order + product, top 10 tags each. Pro: customer tags + full list.
 */

import type {
  CustomerTagRow,
  DateRange,
  HistoryClamp,
  OrderTagRow,
  Plan,
  ProductTagRow,
  TagReportResponse,
  TagReportType,
} from "@fbc/shared";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";
import type { TagsOrderNode } from "./queries.js";

const FREE_TAG_CAP = 10;

function detectCurrency(orders: TagsOrderNode[]): string {
  for (const o of orders) {
    const code = o.totalPriceSet.shopMoney.currencyCode;
    if (code) return code;
  }
  return "USD";
}

function computeOrderTags(
  orders: TagsOrderNode[],
  currency: string,
): OrderTagRow[] {
  const buckets = new Map<string, { orders: number; revenue_minor: bigint }>();
  for (const o of orders) {
    const orderRev = moneyToMinor(o.totalPriceSet.shopMoney.amount);
    for (const tag of o.tags) {
      const acc = buckets.get(tag) ?? { orders: 0, revenue_minor: 0n };
      acc.orders += 1;
      acc.revenue_minor += orderRev;
      buckets.set(tag, acc);
    }
  }
  return Array.from(buckets.entries()).map(([tag, acc]) => ({
    tag,
    order_count: acc.orders,
    revenue: minorToMoney(acc.revenue_minor, currency),
    aov: minorToMoney(
      acc.orders > 0 ? acc.revenue_minor / BigInt(acc.orders) : 0n,
      currency,
    ),
  }));
}

function computeProductTags(
  orders: TagsOrderNode[],
  currency: string,
): ProductTagRow[] {
  // Per tag: count distinct products, total units, revenue
  const buckets = new Map<
    string,
    {
      products: Set<string>;
      units: number;
      revenue_minor: bigint;
    }
  >();
  for (const o of orders) {
    for (const edge of o.lineItems.edges) {
      const li = edge.node;
      const product = li.product;
      if (!product) continue;
      const lineRev = moneyToMinor(li.originalTotalSet.shopMoney.amount);
      for (const tag of product.tags) {
        const acc = buckets.get(tag) ?? {
          products: new Set<string>(),
          units: 0,
          revenue_minor: 0n,
        };
        acc.products.add(product.id);
        acc.units += li.quantity;
        acc.revenue_minor += lineRev;
        buckets.set(tag, acc);
      }
    }
  }
  return Array.from(buckets.entries()).map(([tag, acc]) => ({
    tag,
    units_sold: acc.units,
    revenue: minorToMoney(acc.revenue_minor, currency),
    products_with_tag: acc.products.size,
  }));
}

function computeCustomerTags(
  orders: TagsOrderNode[],
  currency: string,
): CustomerTagRow[] {
  // Per tag: distinct customer count, sum of order revenue, avg lifetime value (amountSpent)
  const buckets = new Map<
    string,
    {
      customers: Map<string, bigint>; // customerId -> amountSpent in minor
      order_revenue_minor: bigint;
    }
  >();
  for (const o of orders) {
    const customer = o.customer;
    if (!customer) continue;
    const orderRev = moneyToMinor(o.totalPriceSet.shopMoney.amount);
    const lifetime = customer.amountSpent
      ? moneyToMinor(customer.amountSpent.amount)
      : 0n;
    for (const tag of customer.tags) {
      const acc = buckets.get(tag) ?? {
        customers: new Map<string, bigint>(),
        order_revenue_minor: 0n,
      };
      acc.customers.set(customer.id, lifetime);
      acc.order_revenue_minor += orderRev;
      buckets.set(tag, acc);
    }
  }
  return Array.from(buckets.entries()).map(([tag, acc]) => {
    const customerCount = acc.customers.size;
    let totalLifetime = 0n;
    for (const v of acc.customers.values()) totalLifetime += v;
    const avgLtv =
      customerCount > 0 ? totalLifetime / BigInt(customerCount) : 0n;
    return {
      tag,
      customer_count: customerCount,
      revenue: minorToMoney(acc.order_revenue_minor, currency),
      avg_ltv: minorToMoney(avgLtv, currency),
    };
  });
}

function sortByRevenue<T extends { revenue: { amount: string } }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aRev = moneyToMinor(a.revenue.amount);
    const bRev = moneyToMinor(b.revenue.amount);
    return bRev > aRev ? 1 : bRev < aRev ? -1 : 0;
  });
}

export function computeTagReport(args: {
  orders: TagsOrderNode[];
  type: TagReportType;
  plan: Plan;
  range: DateRange;
  truncated: boolean;
  historyClampedTo: HistoryClamp | null;
}): TagReportResponse {
  const { orders, type, plan, range, truncated, historyClampedTo } = args;
  const currency = detectCurrency(orders);
  const planCap = plan === "free" ? FREE_TAG_CAP : null;

  if (type === "order") {
    const sorted = sortByRevenue(computeOrderTags(orders, currency));
    return {
      type: "order",
      range,
      rows: planCap !== null ? sorted.slice(0, planCap) : sorted,
      truncated,
      history_clamped_to: historyClampedTo,
      total_count: sorted.length,
      plan_capped_to: planCap,
    };
  }

  if (type === "product") {
    const sorted = sortByRevenue(computeProductTags(orders, currency));
    return {
      type: "product",
      range,
      rows: planCap !== null ? sorted.slice(0, planCap) : sorted,
      truncated,
      history_clamped_to: historyClampedTo,
      total_count: sorted.length,
      plan_capped_to: planCap,
    };
  }

  // customer — Pro only; on Free we surface an empty rows list with pro_only flag
  if (plan === "free") {
    return {
      type: "customer",
      range,
      rows: [],
      truncated: false,
      history_clamped_to: historyClampedTo,
      total_count: 0,
      plan_capped_to: 0,
      pro_only: true,
    };
  }
  const sorted = sortByRevenue(computeCustomerTags(orders, currency));
  return {
    type: "customer",
    range,
    rows: sorted,
    truncated,
    history_clamped_to: historyClampedTo,
    total_count: sorted.length,
    plan_capped_to: null,
    pro_only: true,
  };
}

// Exported for unit tests
export const _internal = {
  computeOrderTags,
  computeProductTags,
  computeCustomerTags,
};
