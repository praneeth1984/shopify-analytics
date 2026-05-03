import { describe, expect, it } from "vitest";
import { _internal } from "../outstanding.js";
import type { OutstandingOrderNode } from "../queries.js";

const { nodeToRow, summarize } = _internal;

function makeNode(args: {
  id: string;
  name: string;
  outstanding: string;
  customerId?: string | null;
  status?: string | null;
}): OutstandingOrderNode {
  return {
    id: `gid://shopify/Order/${args.id}`,
    name: args.name,
    createdAt: "2026-04-10T00:00:00Z",
    displayFinancialStatus: args.status ?? "PENDING",
    customer: args.customerId === undefined
      ? { id: "gid://shopify/Customer/1" }
      : args.customerId === null
      ? null
      : { id: args.customerId },
    totalOutstandingSet: { shopMoney: { amount: args.outstanding, currencyCode: "USD" } },
  };
}

describe("outstanding nodeToRow", () => {
  it("maps fields and parses customer id", () => {
    const row = nodeToRow(
      makeNode({ id: "12345", name: "#1001", outstanding: "75.50", customerId: "gid://shopify/Customer/9" }),
    );
    expect(row.order_id).toBe("12345");
    expect(row.name).toBe("#1001");
    expect(row.customer_id).toBe("gid://shopify/Customer/9");
    expect(row.total_outstanding.amount).toBe("75.50");
    expect(row.financial_status).toBe("PENDING");
  });

  it("returns null customer_id when no customer attached", () => {
    const row = nodeToRow(
      makeNode({ id: "1", name: "#1", outstanding: "10.00", customerId: null }),
    );
    expect(row.customer_id).toBeNull();
  });
});

describe("outstanding summarize", () => {
  it("sums outstanding amounts and counts orders", () => {
    const rows = [
      nodeToRow(makeNode({ id: "1", name: "#1", outstanding: "100.00" })),
      nodeToRow(makeNode({ id: "2", name: "#2", outstanding: "50.50" })),
    ];
    const summary = summarize(rows);
    expect(summary.total.amount).toBe("150.50");
    expect(summary.count).toBe(2);
  });

  it("handles empty rows", () => {
    const summary = summarize([]);
    expect(summary.count).toBe(0);
    expect(summary.total.amount).toBe("0.00");
  });
});
