import { describe, expect, it } from "vitest";
import { _internal } from "../refunds.js";
import type { RefundReportOrderNode } from "../queries.js";

const { buildRefundRows, buildRefundSummary } = _internal;

function makeOrder(args: {
  id: string;
  name: string;
  total: string;
  refunds: Array<{
    id: string;
    createdAt: string;
    amount: string;
    note?: string | null;
    lines?: Array<{ qty: number; restockType?: string | null }>;
  }>;
}): RefundReportOrderNode {
  return {
    id: `gid://shopify/Order/${args.id}`,
    name: args.name,
    totalPriceSet: { shopMoney: { amount: args.total, currencyCode: "USD" } },
    refunds: args.refunds.map((r) => ({
      id: `gid://shopify/Refund/${r.id}`,
      createdAt: r.createdAt,
      note: r.note ?? null,
      totalRefundedSet: { shopMoney: { amount: r.amount, currencyCode: "USD" } },
      refundLineItems: {
        edges: (r.lines ?? []).map((l) => ({
          node: { quantity: l.qty, restockType: l.restockType ?? null },
        })),
      },
    })),
  };
}

describe("refunds buildRefundRows", () => {
  it("returns empty when there are no refunds", () => {
    const orders: RefundReportOrderNode[] = [
      makeOrder({ id: "1", name: "#1001", total: "100.00", refunds: [] }),
    ];
    const result = buildRefundRows(orders);
    expect(result.rows).toEqual([]);
    expect(result.totalRefundedMinor).toBe(0n);
    expect(result.grossMinor).toBe(10_000n); // $100.00
  });

  it("flattens refunds across orders and sorts newest first", () => {
    const orders: RefundReportOrderNode[] = [
      makeOrder({
        id: "1",
        name: "#1001",
        total: "100.00",
        refunds: [
          { id: "R1", createdAt: "2026-04-10T10:00:00Z", amount: "20.00" },
        ],
      }),
      makeOrder({
        id: "2",
        name: "#1002",
        total: "200.00",
        refunds: [
          { id: "R2", createdAt: "2026-04-15T10:00:00Z", amount: "50.00" },
          { id: "R3", createdAt: "2026-04-20T10:00:00Z", amount: "30.00" },
        ],
      }),
    ];
    const result = buildRefundRows(orders);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]?.refund_id).toBe("R3"); // newest
    expect(result.rows[2]?.refund_id).toBe("R1");
    expect(result.totalRefundedMinor).toBe(10_000n); // 20 + 50 + 30
    expect(result.grossMinor).toBe(30_000n); // 100 + 200
  });

  it("counts line items refunded and detects restock", () => {
    const orders: RefundReportOrderNode[] = [
      makeOrder({
        id: "1",
        name: "#1001",
        total: "100.00",
        refunds: [
          {
            id: "R1",
            createdAt: "2026-04-10T10:00:00Z",
            amount: "30.00",
            lines: [
              { qty: 2, restockType: "RETURN" },
              { qty: 1, restockType: "NO_RESTOCK" },
            ],
          },
        ],
      }),
    ];
    const result = buildRefundRows(orders);
    expect(result.rows[0]?.line_items_refunded).toBe(3);
    expect(result.rows[0]?.restocked).toBe(true);
  });

  it("flags restocked=false when only NO_RESTOCK present", () => {
    const orders: RefundReportOrderNode[] = [
      makeOrder({
        id: "1",
        name: "#1001",
        total: "100.00",
        refunds: [
          {
            id: "R1",
            createdAt: "2026-04-10T10:00:00Z",
            amount: "30.00",
            lines: [{ qty: 1, restockType: "NO_RESTOCK" }],
          },
        ],
      }),
    ];
    const result = buildRefundRows(orders);
    expect(result.rows[0]?.restocked).toBe(false);
  });

  it("preserves note field", () => {
    const orders: RefundReportOrderNode[] = [
      makeOrder({
        id: "1",
        name: "#1001",
        total: "100.00",
        refunds: [
          {
            id: "R1",
            createdAt: "2026-04-10T10:00:00Z",
            amount: "20.00",
            note: "Customer changed mind",
          },
        ],
      }),
    ];
    const result = buildRefundRows(orders);
    expect(result.rows[0]?.note).toBe("Customer changed mind");
  });
});

describe("refunds buildRefundSummary", () => {
  it("computes total, count, average, and pct", () => {
    const rows = [
      {
        refund_id: "R1",
        order_id: "1",
        order_name: "#1001",
        refunded_at: "2026-04-10T10:00:00Z",
        amount: { amount: "20.00", currency_code: "USD" },
        line_items_refunded: 1,
        restocked: false,
        note: null,
      },
      {
        refund_id: "R2",
        order_id: "2",
        order_name: "#1002",
        refunded_at: "2026-04-15T10:00:00Z",
        amount: { amount: "30.00", currency_code: "USD" },
        line_items_refunded: 1,
        restocked: false,
        note: null,
      },
    ];
    const summary = buildRefundSummary(rows, 5_000n, 50_000n, "USD");
    expect(summary.refund_count).toBe(2);
    expect(summary.total_refunded.amount).toBe("50.00");
    expect(summary.avg_refund.amount).toBe("25.00");
    expect(summary.pct_of_gross_revenue).toBeCloseTo(0.1, 4);
  });

  it("handles zero gross revenue", () => {
    const summary = buildRefundSummary([], 0n, 0n, "USD");
    expect(summary.pct_of_gross_revenue).toBe(0);
    expect(summary.refund_count).toBe(0);
    expect(summary.avg_refund.amount).toBe("0.00");
  });
});
