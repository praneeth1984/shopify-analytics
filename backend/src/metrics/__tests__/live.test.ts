import { describe, expect, it } from "vitest";
import { _internal } from "../live.js";
import type { OrderNode } from "../queries.js";

const { aggregateLive } = _internal;

function makeOrder(args: { id: string; total: string; refunded?: string }): OrderNode {
  return {
    id: `gid://shopify/Order/${args.id}`,
    processedAt: "2026-05-03T12:00:00Z",
    returnStatus: "NO_RETURN",
    totalPriceSet: { shopMoney: { amount: args.total, currencyCode: "USD" } },
    currentTotalPriceSet: { shopMoney: { amount: args.total, currencyCode: "USD" } },
    currentSubtotalPriceSet: { shopMoney: { amount: args.total, currencyCode: "USD" } },
    totalRefundedSet: { shopMoney: { amount: args.refunded ?? "0.00", currencyCode: "USD" } },
    paymentGatewayNames: ["shopify_payments"],
    discountCodes: [],
    totalShippingPriceSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
    shippingLines: { edges: [] },
    customer: null,
    lineItems: { edges: [] },
    refunds: [],
  };
}

describe("live metrics", () => {
  it("returns zeros for empty input", () => {
    const result = aggregateLive([], "USD");
    expect(result.count).toBe(0);
    expect(result.revenue.amount).toBe("0.00");
    expect(result.revenue.currency_code).toBe("USD");
    expect(result.aov.amount).toBe("0.00");
  });

  it("sums gross revenue net of refunds and computes AOV", () => {
    const orders: OrderNode[] = [
      makeOrder({ id: "1", total: "100.00" }),
      makeOrder({ id: "2", total: "50.00", refunded: "10.00" }),
      makeOrder({ id: "3", total: "30.00" }),
    ];
    const result = aggregateLive(orders, "USD");
    expect(result.count).toBe(3);
    // 100 + (50-10) + 30 = 170, AOV = 170/3 = 56.66 (truncated minor units)
    expect(result.revenue.amount).toBe("170.00");
    expect(result.aov.amount).toBe("56.66");
  });

  it("preserves currency code", () => {
    const orders: OrderNode[] = [makeOrder({ id: "1", total: "10.00" })];
    const result = aggregateLive(orders, "EUR");
    expect(result.revenue.currency_code).toBe("EUR");
    expect(result.aov.currency_code).toBe("EUR");
  });
});
