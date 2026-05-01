import { describe, expect, it } from "vitest";
import { computeReturnResolution } from "../returns-resolution.js";
import type { OrderNode, RefundNode } from "../queries.js";

type TxSpec = {
  kind: string;
  status?: string;
  gateway?: string | null;
  amount: string;
};

function makeRefund(id: string, txs: TxSpec[], total = "0.00"): RefundNode {
  return {
    id: `gid://shopify/Refund/${id}`,
    createdAt: "2026-04-01T12:00:00Z",
    totalRefundedSet: { shopMoney: { amount: total, currencyCode: "USD" } },
    refundLineItems: { edges: [] },
    transactions: {
      edges: txs.map((t) => ({
        node: {
          kind: t.kind,
          status: t.status ?? "SUCCESS",
          gateway: t.gateway ?? "shopify_payments",
          amountSet: { shopMoney: { amount: t.amount, currencyCode: "USD" } },
        },
      })),
    },
  };
}

function makeOrder(id: string, refunds: RefundNode[]): OrderNode {
  return {
    id: `gid://shopify/Order/${id}`,
    processedAt: "2026-04-01T12:00:00Z",
    returnStatus: "RETURNED",
    currentTotalPriceSet: { shopMoney: { amount: "100.00", currencyCode: "USD" } },
    currentSubtotalPriceSet: { shopMoney: { amount: "100.00", currencyCode: "USD" } },
    totalRefundedSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
    customer: null,
    lineItems: { edges: [] },
    refunds,
    returns: { edges: [] },
  };
}

describe("returns-resolution", () => {
  it("buckets gift_card gateway refunds as store_credit", () => {
    const orders = [
      makeOrder("1", [
        makeRefund("r1", [{ kind: "REFUND", gateway: "gift_card", amount: "20.00" }]),
      ]),
    ];
    const result = computeReturnResolution(orders);
    const sc = result.resolutions.find((r) => r.bucket === "store_credit");
    expect(sc?.count).toBe(1);
    expect(sc?.value.amount).toBe("20.00");
  });

  it("buckets non-gift-card refunds as cash_refund", () => {
    const orders = [
      makeOrder("1", [
        makeRefund("r1", [{ kind: "REFUND", gateway: "shopify_payments", amount: "30.00" }]),
      ]),
    ];
    const result = computeReturnResolution(orders);
    const cash = result.resolutions.find((r) => r.bucket === "cash_refund");
    expect(cash?.count).toBe(1);
    expect(cash?.value.amount).toBe("30.00");
  });

  it("ignores orders with no refunds", () => {
    const orders = [makeOrder("1", [])];
    const result = computeReturnResolution(orders);
    const totalCount = result.resolutions.reduce((acc, r) => acc + r.count, 0);
    expect(totalCount).toBe(0);
  });

  it("percentages sum to 1.0 when there are refunds", () => {
    const orders = [
      makeOrder("1", [
        makeRefund("r1", [{ kind: "REFUND", gateway: "shopify_payments", amount: "40.00" }]),
        makeRefund("r2", [{ kind: "REFUND", gateway: "gift_card", amount: "10.00" }]),
      ]),
    ];
    const result = computeReturnResolution(orders);
    const sum = result.resolutions.reduce((acc, r) => acc + r.pct, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("returns degraded exchange detection in Phase 1", () => {
    const orders = [
      makeOrder("1", [
        makeRefund("r1", [{ kind: "REFUND", gateway: "shopify_payments", amount: "10.00" }]),
      ]),
    ];
    const result = computeReturnResolution(orders);
    expect(result.exchange_detection).toBe("degraded");
  });
});
