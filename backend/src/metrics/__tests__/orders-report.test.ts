import { describe, expect, it } from "vitest";
import { _internal } from "../orders-report.js";
import type { OrderReportNode } from "../queries.js";

const { nodeToRow, buildSearchQuery } = _internal;

function makeNode(overrides: Partial<OrderReportNode> = {}): OrderReportNode {
  return {
    id: "gid://shopify/Order/1234567",
    name: "#1001",
    processedAt: "2026-04-10T12:00:00Z",
    createdAt: "2026-04-10T11:55:00Z",
    sourceName: "web",
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "FULFILLED",
    tags: ["wholesale", "vip"],
    paymentGatewayNames: ["shopify_payments", "manual"],
    currentSubtotalLineItemsQuantity: 3,
    totalPriceSet: { shopMoney: { amount: "199.99", currencyCode: "USD" } },
    totalRefundedSet: { shopMoney: { amount: "9.99", currencyCode: "USD" } },
    totalDiscountsSet: { shopMoney: { amount: "5.00", currencyCode: "USD" } },
    totalShippingPriceSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } },
    totalTaxSet: { shopMoney: { amount: "16.00", currencyCode: "USD" } },
    ...overrides,
  };
}

describe("orders-report nodeToRow", () => {
  it("maps all fields correctly", () => {
    const row = nodeToRow(makeNode());
    expect(row.id).toBe("1234567");
    expect(row.gid).toBe("gid://shopify/Order/1234567");
    expect(row.name).toBe("#1001");
    expect(row.payment_status).toBe("PAID");
    expect(row.fulfillment_status).toBe("FULFILLED");
    expect(row.tags).toEqual(["wholesale", "vip"]);
    expect(row.gateway).toBe("shopify_payments");
    expect(row.gross_revenue.amount).toBe("199.99");
    // 199.99 - 9.99 = 190.00
    expect(row.net_revenue.amount).toBe("190.00");
    expect(row.discounts.amount).toBe("5.00");
    expect(row.tax.amount).toBe("16.00");
    expect(row.shipping.amount).toBe("10.00");
  });

  it("falls back when gateway is empty", () => {
    const row = nodeToRow(makeNode({ paymentGatewayNames: [] }));
    expect(row.gateway).toBeNull();
  });
});

describe("orders-report buildSearchQuery", () => {
  it("emits processed_at constraints", () => {
    const q = buildSearchQuery({
      start: "2026-04-01T00:00:00Z",
      end: "2026-05-01T00:00:00Z",
      status: "all",
      fulfillment: "all",
    });
    expect(q).toContain("processed_at:>='2026-04-01T00:00:00Z'");
    expect(q).toContain("processed_at:<'2026-05-01T00:00:00Z'");
  });

  it("adds financial_status when status is paid", () => {
    const q = buildSearchQuery({
      start: "2026-04-01",
      end: "2026-05-01",
      status: "paid",
      fulfillment: "all",
    });
    expect(q).toContain("financial_status:paid");
  });

  it("adds fulfillment_status when fulfillment filter set", () => {
    const q = buildSearchQuery({
      start: "2026-04-01",
      end: "2026-05-01",
      status: "all",
      fulfillment: "unfulfilled",
    });
    expect(q).toContain("fulfillment_status:unfulfilled");
  });

  it("uses status:cancelled for cancelled filter", () => {
    const q = buildSearchQuery({
      start: "2026-04-01",
      end: "2026-05-01",
      status: "cancelled",
      fulfillment: "all",
    });
    expect(q).toContain("status:cancelled");
  });
});
