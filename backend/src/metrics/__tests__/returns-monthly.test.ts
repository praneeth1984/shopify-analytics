import { describe, expect, it } from "vitest";
import {
  buildMonthSequence,
  computeMonthlyReturns,
  monthlyWindowRange,
} from "../returns-monthly.js";
import type { OrderNode } from "../queries.js";

function makeOrder(args: {
  id: string;
  processedAt: string;
  total: string;
  refunded?: string;
  hasRefund?: boolean;
}): OrderNode {
  return {
    id: `gid://shopify/Order/${args.id}`,
    processedAt: args.processedAt,
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
    refunds: args.hasRefund
      ? [
          {
            id: `gid://shopify/Refund/${args.id}`,
            createdAt: args.processedAt,
            totalRefundedSet: {
              shopMoney: { amount: args.refunded ?? "0.00", currencyCode: "USD" },
            },
            refundLineItems: { edges: [] },
          },
        ]
      : [],
  };
}

describe("buildMonthSequence", () => {
  it("returns N months ending with the current month", () => {
    const now = new Date(Date.UTC(2026, 4, 15)); // May 2026
    const seq = buildMonthSequence(6, now);
    expect(seq).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
  });

  it("handles year boundary correctly for 12 months", () => {
    const now = new Date(Date.UTC(2026, 0, 5)); // Jan 2026
    const seq = buildMonthSequence(12, now);
    expect(seq).toHaveLength(12);
    expect(seq[0]).toBe("2025-02");
    expect(seq[11]).toBe("2026-01");
  });
});

describe("monthlyWindowRange", () => {
  it("spans the right calendar months", () => {
    const now = new Date(Date.UTC(2026, 4, 15)); // May 15, 2026
    const r = monthlyWindowRange(6, now);
    expect(r.start).toBe("2025-12-01T00:00:00.000Z");
    expect(r.end).toBe("2026-06-01T00:00:00.000Z");
  });
});

describe("computeMonthlyReturns", () => {
  const now = new Date(Date.UTC(2026, 4, 15)); // May 15, 2026

  it("returns zeroed rows when no orders match the window", () => {
    const rows = computeMonthlyReturns([], 6, now);
    expect(rows).toHaveLength(6);
    rows.forEach((r) => {
      expect(r.orders).toBe(0);
      expect(r.returned_orders).toBe(0);
      expect(r.return_rate_pct).toBe(0);
      expect(r.gross_revenue.amount).toBe("0.00");
    });
  });

  it("buckets orders by their processed_at month", () => {
    const orders: OrderNode[] = [
      makeOrder({ id: "1", processedAt: "2026-04-10T10:00:00Z", total: "100.00" }),
      makeOrder({ id: "2", processedAt: "2026-04-15T10:00:00Z", total: "200.00" }),
      makeOrder({ id: "3", processedAt: "2026-05-01T10:00:00Z", total: "300.00" }),
    ];
    const rows = computeMonthlyReturns(orders, 6, now);
    const apr = rows.find((r) => r.month === "2026-04");
    const may = rows.find((r) => r.month === "2026-05");
    expect(apr?.orders).toBe(2);
    expect(apr?.gross_revenue.amount).toBe("300.00");
    expect(may?.orders).toBe(1);
    expect(may?.gross_revenue.amount).toBe("300.00");
  });

  it("flags returned orders and computes return_rate_pct", () => {
    const orders: OrderNode[] = [
      makeOrder({ id: "1", processedAt: "2026-04-10T10:00:00Z", total: "100.00" }),
      makeOrder({
        id: "2",
        processedAt: "2026-04-12T10:00:00Z",
        total: "100.00",
        refunded: "50.00",
        hasRefund: true,
      }),
      makeOrder({
        id: "3",
        processedAt: "2026-04-13T10:00:00Z",
        total: "100.00",
        refunded: "100.00",
        hasRefund: true,
      }),
      makeOrder({ id: "4", processedAt: "2026-04-14T10:00:00Z", total: "100.00" }),
    ];
    const rows = computeMonthlyReturns(orders, 6, now);
    const apr = rows.find((r) => r.month === "2026-04");
    expect(apr?.orders).toBe(4);
    expect(apr?.returned_orders).toBe(2);
    expect(apr?.return_rate_pct).toBe(50);
    expect(apr?.gross_revenue.amount).toBe("400.00");
    expect(apr?.refunded.amount).toBe("150.00");
    expect(apr?.net_revenue.amount).toBe("250.00");
  });

  it("ignores orders outside the window", () => {
    const orders: OrderNode[] = [
      makeOrder({ id: "old", processedAt: "2024-01-01T10:00:00Z", total: "999.00" }),
      makeOrder({ id: "1", processedAt: "2026-04-10T10:00:00Z", total: "100.00" }),
    ];
    const rows = computeMonthlyReturns(orders, 6, now);
    const total = rows.reduce((s, r) => s + r.orders, 0);
    expect(total).toBe(1);
  });
});
