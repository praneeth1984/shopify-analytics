import { describe, expect, it } from "vitest";
import { computeReturnResolution } from "../returns-resolution.js";
import type { OrderNode, RefundNode } from "../queries.js";

function makeRefund(id: string, total: string): RefundNode {
  return {
    id: `gid://shopify/Refund/${id}`,
    createdAt: "2026-04-01T12:00:00Z",
    totalRefundedSet: { shopMoney: { amount: total, currencyCode: "USD" } },
    refundLineItems: { edges: [] },
  };
}

function makeOrder(id: string, refunds: RefundNode[]): OrderNode {
  return {
    id: `gid://shopify/Order/${id}`,
    processedAt: "2026-04-01T12:00:00Z",
    returnStatus: "RETURNED",
    totalPriceSet: { shopMoney: { amount: "100.00", currencyCode: "USD" } },
    currentTotalPriceSet: { shopMoney: { amount: "100.00", currencyCode: "USD" } },
    currentSubtotalPriceSet: { shopMoney: { amount: "100.00", currencyCode: "USD" } },
    totalRefundedSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
    paymentGatewayNames: ["shopify_payments"],
    discountCodes: [],
    totalShippingPriceSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
    shippingLines: { edges: [] },
    customer: null,
    lineItems: { edges: [] },
    refunds,
    returns: { edges: [] },
  };
}

describe("returns-resolution", () => {
  it("buckets all refunds as cash_refund in Phase 1", () => {
    const orders = [makeOrder("1", [makeRefund("r1", "50.00")])];
    const result = computeReturnResolution(orders);
    const cash = result.resolutions.find((r) => r.bucket === "cash_refund");
    expect(cash?.count).toBe(1);
    expect(cash?.value.amount).toBe("50.00");
  });

  it("ignores orders with no refunds", () => {
    const orders = [makeOrder("1", [])];
    const result = computeReturnResolution(orders);
    const totalCount = result.resolutions.reduce((acc, r) => acc + r.count, 0);
    expect(totalCount).toBe(0);
  });

  it("counts multiple refunds on the same order separately", () => {
    const orders = [makeOrder("1", [makeRefund("r1", "30.00"), makeRefund("r2", "20.00")])];
    const result = computeReturnResolution(orders);
    const cash = result.resolutions.find((r) => r.bucket === "cash_refund");
    expect(cash?.count).toBe(2);
    expect(cash?.value.amount).toBe("50.00");
  });

  it("percentages sum to 1.0 when there are refunds", () => {
    const orders = [
      makeOrder("1", [makeRefund("r1", "40.00")]),
      makeOrder("2", [makeRefund("r2", "10.00")]),
    ];
    const result = computeReturnResolution(orders);
    const sum = result.resolutions.reduce((acc, r) => acc + r.pct, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("returns degraded exchange detection in Phase 1", () => {
    const orders = [makeOrder("1", [makeRefund("r1", "10.00")])];
    const result = computeReturnResolution(orders);
    expect(result.exchange_detection).toBe("degraded");
  });
});
