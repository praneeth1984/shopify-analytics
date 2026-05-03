import { describe, expect, it } from "vitest";
import { _internal } from "../overview.js";
import type { OrderNode } from "../queries.js";

const { aggregateOrders } = _internal;

function makeOrder(args: {
  id: string;
  total: string;
  refunded?: string;
  customerId?: string | null;
  numberOfOrders?: number;
}): OrderNode {
  const customer =
    args.customerId === null
      ? null
      : args.customerId !== undefined
        ? { id: args.customerId, numberOfOrders: args.numberOfOrders ?? 1 }
        : null;
  return {
    id: `gid://shopify/Order/${args.id}`,
    processedAt: "2026-04-01T12:00:00Z",
    returnStatus: "NO_RETURN",
    totalPriceSet: { shopMoney: { amount: args.total, currencyCode: "USD" } },
    currentTotalPriceSet: { shopMoney: { amount: args.total, currencyCode: "USD" } },
    currentSubtotalPriceSet: { shopMoney: { amount: args.total, currencyCode: "USD" } },
    totalRefundedSet: { shopMoney: { amount: args.refunded ?? "0.00", currencyCode: "USD" } },
    paymentGatewayNames: ["shopify_payments"],
    discountCodes: [],
    totalShippingPriceSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
    shippingLines: { edges: [] },
    customer,
    lineItems: { edges: [] },
    refunds: [],
  };
}

describe("overview aggregateOrders new vs returning", () => {
  it("classifies first-time orders as new and repeat as returning", () => {
    const orders: OrderNode[] = [
      makeOrder({ id: "1", total: "100.00", customerId: "C1", numberOfOrders: 1 }),
      makeOrder({ id: "2", total: "50.00", customerId: "C2", numberOfOrders: 5 }),
      makeOrder({ id: "3", total: "30.00", customerId: "C3", numberOfOrders: 2 }),
    ];
    const agg = aggregateOrders(orders);
    expect(agg.newCustomerOrders).toBe(1);
    expect(agg.returningCustomerOrders).toBe(2);
    expect(agg.newCustomerRevenueMinor).toBe(10_000n); // $100.00
    expect(agg.returningCustomerRevenueMinor).toBe(8_000n); // $50 + $30
  });

  it("ignores orders without a customer", () => {
    const orders: OrderNode[] = [
      makeOrder({ id: "g1", total: "20.00", customerId: null }),
      makeOrder({ id: "1", total: "10.00", customerId: "C1", numberOfOrders: 1 }),
    ];
    const agg = aggregateOrders(orders);
    expect(agg.newCustomerOrders).toBe(1);
    expect(agg.returningCustomerOrders).toBe(0);
    expect(agg.count).toBe(2);
  });

  it("subtracts refunds from per-segment revenue", () => {
    const orders: OrderNode[] = [
      makeOrder({
        id: "1",
        total: "100.00",
        refunded: "20.00",
        customerId: "C1",
        numberOfOrders: 3,
      }),
    ];
    const agg = aggregateOrders(orders);
    expect(agg.returningCustomerRevenueMinor).toBe(8_000n); // 100 - 20
  });
});
