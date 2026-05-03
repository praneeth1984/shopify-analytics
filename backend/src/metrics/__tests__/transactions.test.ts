import { describe, expect, it } from "vitest";
import { computeTransactionReport } from "../transactions.js";
import type { TransactionOrderNode } from "../queries.js";
import type { DateRange } from "@fbc/shared";

const RANGE: DateRange = {
  preset: "last_30_days",
  start: "2026-04-01T00:00:00Z",
  end: "2026-05-01T00:00:00Z",
};

function makeOrder(args: {
  id: string;
  name: string;
  transactions: Array<{
    id: string;
    gateway?: string | null;
    kind?: string;
    status: string;
    amount: string;
    errorCode?: string | null;
    processedAt?: string;
  }>;
}): TransactionOrderNode {
  return {
    id: `gid://shopify/Order/${args.id}`,
    name: args.name,
    transactions: args.transactions.map((t) => ({
      id: `gid://shopify/Transaction/${t.id}`,
      gateway: t.gateway ?? "shopify_payments",
      kind: t.kind ?? "SALE",
      status: t.status,
      errorCode: t.errorCode ?? null,
      processedAt: t.processedAt ?? "2026-04-10T00:00:00Z",
      amountSet: { shopMoney: { amount: t.amount, currencyCode: "USD" } },
    })),
  };
}

describe("transactions by_gateway view", () => {
  it("aggregates count + value + success rate per gateway", () => {
    const orders = [
      makeOrder({
        id: "1",
        name: "#1",
        transactions: [
          { id: "T1", gateway: "shopify_payments", status: "SUCCESS", amount: "100.00" },
          { id: "T2", gateway: "shopify_payments", status: "FAILURE", amount: "50.00" },
          { id: "T3", gateway: "paypal", status: "SUCCESS", amount: "75.00" },
        ],
      }),
    ];
    const result = computeTransactionReport({
      orders,
      view: "by_gateway",
      plan: "free",
      range: RANGE,
      truncated: false,
      historyClampedTo: null,
    });
    expect(result.view).toBe("by_gateway");
    if (result.view !== "by_gateway") return;
    const sp = result.rows.find((r) => r.gateway === "shopify_payments");
    expect(sp?.transaction_count).toBe(2);
    expect(sp?.failed_count).toBe(1);
    expect(sp?.success_rate_pct).toBeCloseTo(0.5, 4);
    expect(sp?.total_value.amount).toBe("150.00");
    const pp = result.rows.find((r) => r.gateway === "paypal");
    expect(pp?.transaction_count).toBe(1);
  });
});

describe("transactions failed view", () => {
  it("requires pro plan", () => {
    const result = computeTransactionReport({
      orders: [],
      view: "failed",
      plan: "free",
      range: RANGE,
      truncated: false,
      historyClampedTo: null,
    });
    expect(result.view).toBe("failed");
    if (result.view !== "failed") return;
    expect(result.pro_only).toBe(true);
    expect(result.rows).toEqual([]);
  });

  it("returns only failed transactions on pro", () => {
    const orders = [
      makeOrder({
        id: "1",
        name: "#1",
        transactions: [
          { id: "T1", status: "SUCCESS", amount: "100.00" },
          { id: "T2", status: "FAILURE", amount: "50.00", errorCode: "card_declined" },
        ],
      }),
    ];
    const result = computeTransactionReport({
      orders,
      view: "failed",
      plan: "pro",
      range: RANGE,
      truncated: false,
      historyClampedTo: null,
    });
    expect(result.view).toBe("failed");
    if (result.view !== "failed") return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.error_code).toBe("card_declined");
  });
});

describe("transactions all view", () => {
  it("returns all transactions on pro", () => {
    const orders = [
      makeOrder({
        id: "1",
        name: "#1",
        transactions: [
          { id: "T1", status: "SUCCESS", amount: "100.00" },
          { id: "T2", status: "FAILURE", amount: "50.00" },
        ],
      }),
    ];
    const result = computeTransactionReport({
      orders,
      view: "all",
      plan: "pro",
      range: RANGE,
      truncated: false,
      historyClampedTo: null,
    });
    expect(result.view).toBe("all");
    if (result.view !== "all") return;
    expect(result.rows).toHaveLength(2);
  });
});
