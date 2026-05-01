import { describe, expect, it } from "vitest";
import { computeReturnReasons } from "../returns-reasons.js";
import type { OrderNode } from "../queries.js";

type ReturnLine = {
  qty: number;
  reason: string | null;
  variantId?: string;
  productTitle?: string;
};

function makeOrderWithReturns(id: string, returnGroups: ReturnLine[][]): OrderNode {
  return {
    id: `gid://shopify/Order/${id}`,
    processedAt: "2026-04-01T12:00:00Z",
    returnStatus: "RETURNED",
    currentTotalPriceSet: { shopMoney: { amount: "100.00", currencyCode: "USD" } },
    currentSubtotalPriceSet: { shopMoney: { amount: "100.00", currencyCode: "USD" } },
    totalRefundedSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
    customer: null,
    lineItems: { edges: [] },
    refunds: [],
    returns: {
      edges: returnGroups.map((lines, gi) => ({
        node: {
          id: `gid://shopify/Return/${id}-${gi}`,
          status: "OPEN",
          returnLineItems: {
            edges: lines.map((l) => ({
              node: {
                quantity: l.qty,
                returnReason: l.reason,
                fulfillmentLineItem: l.variantId
                  ? {
                      lineItem: {
                        id: `gid://shopify/LineItem/${id}-${gi}`,
                        product: { id: "gid://shopify/Product/X", title: l.productTitle ?? "Hat" },
                        variant: { id: l.variantId },
                      },
                    }
                  : null,
              },
            })),
          },
        },
      })),
    },
  };
}

describe("returns-reasons", () => {
  it("buckets returns with no reason as UNKNOWN", () => {
    const orders = [
      makeOrderWithReturns("1", [[{ qty: 2, reason: null }]]),
    ];
    const result = computeReturnReasons(orders, "free");
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]?.code).toBe("UNKNOWN");
    expect(result.reasons[0]?.label).toBe("Unspecified");
    expect(result.reasons[0]?.units).toBe(2);
  });

  it("percentages sum to 1.0", () => {
    const orders = [
      makeOrderWithReturns("1", [
        [
          { qty: 2, reason: "DEFECTIVE" },
          { qty: 1, reason: "SIZE_TOO_LARGE" },
        ],
      ]),
      makeOrderWithReturns("2", [[{ qty: 3, reason: "UNWANTED" }]]),
    ];
    const result = computeReturnReasons(orders, "pro");
    const sum = result.reasons.reduce((acc, r) => acc + r.pct_of_returns, 0);
    expect(sum).toBeCloseTo(1.0, 6);
    expect(result.total_returned_units).toBe(6);
  });

  it("Free plan returns at most 5 reasons", () => {
    const codes = [
      "COLOR",
      "DEFECTIVE",
      "NOT_AS_DESCRIBED",
      "OTHER",
      "SIZE_TOO_LARGE",
      "SIZE_TOO_SMALL",
      "STYLE",
      "UNWANTED",
    ];
    const lines = codes.map((c, i) => ({ qty: codes.length - i, reason: c }));
    const orders = [makeOrderWithReturns("1", [lines])];
    const result = computeReturnReasons(orders, "free");
    expect(result.reasons.length).toBe(5);
  });

  it("Pro returns all reasons", () => {
    const codes = [
      "COLOR",
      "DEFECTIVE",
      "NOT_AS_DESCRIBED",
      "OTHER",
      "SIZE_TOO_LARGE",
      "SIZE_TOO_SMALL",
      "STYLE",
      "UNWANTED",
    ];
    const lines = codes.map((c) => ({ qty: 1, reason: c }));
    const orders = [makeOrderWithReturns("1", [lines])];
    const result = computeReturnReasons(orders, "pro");
    expect(result.reasons.length).toBe(codes.length);
  });

  it("counts multiple line items on same return separately", () => {
    const orders = [
      makeOrderWithReturns("1", [
        [
          { qty: 1, reason: "DEFECTIVE" },
          { qty: 1, reason: "SIZE_TOO_SMALL" },
        ],
      ]),
    ];
    const result = computeReturnReasons(orders, "pro");
    expect(result.reasons).toHaveLength(2);
    const codes = result.reasons.map((r) => r.code).sort();
    expect(codes).toEqual(["DEFECTIVE", "SIZE_TOO_SMALL"]);
  });

  it("Pro includes variant breakdowns; Free omits", () => {
    const orders = [
      makeOrderWithReturns("1", [
        [
          { qty: 2, reason: "DEFECTIVE", variantId: "gid://shopify/ProductVariant/A" },
          { qty: 1, reason: "DEFECTIVE", variantId: "gid://shopify/ProductVariant/B" },
        ],
      ]),
    ];
    const pro = computeReturnReasons(orders, "pro");
    expect(pro.reasons[0]?.variants?.length).toBe(2);

    const free = computeReturnReasons(orders, "free");
    expect(free.reasons[0]?.variants).toBeUndefined();
  });
});
