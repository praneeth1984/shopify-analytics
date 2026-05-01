import { describe, expect, it } from "vitest";
import { computeReturnReasonsFromNodes } from "../returns-reasons.js";
import type { ReturnReasonOrderNode } from "../queries.js";

function makeOrderWithReturns(
  id: string,
  returnLines: Array<{ qty: number; reason: string | null }>,
): ReturnReasonOrderNode {
  return {
    id: `gid://shopify/Order/${id}`,
    returns: {
      edges: [
        {
          node: {
            returnLineItems: {
              edges: returnLines.map((l) => ({
                node: { quantity: l.qty, returnReason: l.reason },
              })),
            },
          },
        },
      ],
    },
  };
}

describe("returns-reasons", () => {
  it("buckets returns with no reason as UNKNOWN", () => {
    const orders = [makeOrderWithReturns("1", [{ qty: 2, reason: null }])];
    const result = computeReturnReasonsFromNodes(orders, "free");
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]?.code).toBe("UNKNOWN");
    expect(result.reasons[0]?.label).toBe("Unspecified");
    expect(result.reasons[0]?.units).toBe(2);
  });

  it("percentages sum to 1.0", () => {
    const orders = [
      makeOrderWithReturns("1", [
        { qty: 2, reason: "DEFECTIVE" },
        { qty: 1, reason: "SIZE_TOO_LARGE" },
      ]),
      makeOrderWithReturns("2", [{ qty: 3, reason: "UNWANTED" }]),
    ];
    const result = computeReturnReasonsFromNodes(orders, "pro");
    const sum = result.reasons.reduce((acc, r) => acc + r.pct_of_returns, 0);
    expect(sum).toBeCloseTo(1.0, 6);
    expect(result.total_returned_units).toBe(6);
  });

  it("Free plan returns at most 5 reasons", () => {
    const codes = ["COLOR", "DEFECTIVE", "NOT_AS_DESCRIBED", "OTHER", "SIZE_TOO_LARGE", "SIZE_TOO_SMALL", "STYLE", "UNWANTED"];
    const lines = codes.map((c, i) => ({ qty: codes.length - i, reason: c }));
    const orders = [makeOrderWithReturns("1", lines)];
    const result = computeReturnReasonsFromNodes(orders, "free");
    expect(result.reasons.length).toBe(5);
  });

  it("Pro returns all reasons", () => {
    const codes = ["COLOR", "DEFECTIVE", "NOT_AS_DESCRIBED", "OTHER", "SIZE_TOO_LARGE", "SIZE_TOO_SMALL", "STYLE", "UNWANTED"];
    const lines = codes.map((c) => ({ qty: 1, reason: c }));
    const orders = [makeOrderWithReturns("1", lines)];
    const result = computeReturnReasonsFromNodes(orders, "pro");
    expect(result.reasons.length).toBe(codes.length);
  });

  it("counts multiple line items on same return separately", () => {
    const orders = [
      makeOrderWithReturns("1", [
        { qty: 1, reason: "DEFECTIVE" },
        { qty: 1, reason: "SIZE_TOO_SMALL" },
      ]),
    ];
    const result = computeReturnReasonsFromNodes(orders, "pro");
    expect(result.reasons).toHaveLength(2);
    const codes = result.reasons.map((r) => r.code).sort();
    expect(codes).toEqual(["DEFECTIVE", "SIZE_TOO_SMALL"]);
  });

  it("Free omits variant breakdowns; Pro includes them (empty in Phase 1)", () => {
    const orders = [makeOrderWithReturns("1", [{ qty: 2, reason: "DEFECTIVE" }])];
    const pro = computeReturnReasonsFromNodes(orders, "pro");
    expect(pro.reasons[0]?.variants).toBeDefined();

    const free = computeReturnReasonsFromNodes(orders, "free");
    expect(free.reasons[0]?.variants).toBeUndefined();
  });
});
