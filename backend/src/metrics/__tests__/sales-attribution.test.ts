import { describe, expect, it } from "vitest";
import { computeSalesAttribution } from "../sales-attribution.js";
import type { AttributionOrderNode } from "../queries.js";
import type { DateRange } from "@fbc/shared";

const RANGE: DateRange = {
  preset: "last_30_days",
  start: "2026-04-01T00:00:00Z",
  end: "2026-05-01T00:00:00Z",
};

function makeOrder(args: {
  id: string;
  total: string;
  refunded?: string;
  source?: string | null;
  posLocation?: string | null;
  lines: Array<{
    qty: number;
    revenue: string;
    vendor?: string | null;
    productType?: string | null;
    productId?: string;
  }>;
  refundLines?: Array<{
    qty: number;
    productId?: string;
    vendor?: string | null;
    productType?: string | null;
  }>;
}): AttributionOrderNode {
  return {
    id: `gid://shopify/Order/${args.id}`,
    sourceName: args.source ?? "web",
    physicalLocation: args.posLocation
      ? { id: "loc1", name: args.posLocation }
      : null,
    totalPriceSet: { shopMoney: { amount: args.total, currencyCode: "USD" } },
    totalRefundedSet: { shopMoney: { amount: args.refunded ?? "0.00", currencyCode: "USD" } },
    returnStatus: "NO_RETURN",
    lineItems: {
      edges: args.lines.map((l, i) => ({
        node: {
          quantity: l.qty,
          refundableQuantity: l.qty,
          originalTotalSet: { shopMoney: { amount: l.revenue, currencyCode: "USD" } },
          product: {
            id: l.productId ?? `gid://shopify/Product/${args.id}-${i}`,
            vendor: l.vendor ?? null,
            productType: l.productType ?? null,
          },
        },
      })),
    },
    refunds: args.refundLines
      ? [
          {
            refundLineItems: {
              edges: args.refundLines.map((rl, i) => ({
                node: {
                  quantity: rl.qty,
                  lineItem: {
                    id: `gid://shopify/LineItem/${args.id}-rl-${i}`,
                    product: rl.productId
                      ? {
                          id: rl.productId,
                          vendor: rl.vendor ?? null,
                          productType: rl.productType ?? null,
                        }
                      : null,
                  },
                },
              })),
            },
          },
        ]
      : [],
  };
}

describe("sales-attribution by vendor", () => {
  it("aggregates units and revenue per vendor", () => {
    const orders = [
      makeOrder({
        id: "1",
        total: "150.00",
        lines: [
          { qty: 2, revenue: "100.00", vendor: "Acme" },
          { qty: 1, revenue: "50.00", vendor: "Beta" },
        ],
      }),
      makeOrder({
        id: "2",
        total: "200.00",
        lines: [{ qty: 4, revenue: "200.00", vendor: "Acme" }],
      }),
    ];
    const result = computeSalesAttribution(orders, "vendor", "pro", RANGE, false, null);
    const acme = result.rows.find((r) => r.key === "Acme");
    const beta = result.rows.find((r) => r.key === "Beta");
    expect(acme?.units).toBe(6);
    expect(acme?.revenue.amount).toBe("300.00");
    expect(acme?.orders).toBe(2);
    expect(beta?.units).toBe(1);
    expect(beta?.revenue.amount).toBe("50.00");
  });

  it("uses '(no vendor)' label when vendor missing", () => {
    const orders = [
      makeOrder({ id: "1", total: "10.00", lines: [{ qty: 1, revenue: "10.00", vendor: null }] }),
    ];
    const result = computeSalesAttribution(orders, "vendor", "pro", RANGE, false, null);
    expect(result.rows[0]?.key).toBe("(no vendor)");
  });
});

describe("sales-attribution by channel", () => {
  it("aggregates revenue per source name", () => {
    const orders = [
      makeOrder({
        id: "1",
        total: "100.00",
        source: "web",
        lines: [{ qty: 1, revenue: "100.00" }],
      }),
      makeOrder({
        id: "2",
        total: "50.00",
        source: "pos",
        lines: [{ qty: 2, revenue: "50.00" }],
      }),
      makeOrder({
        id: "3",
        total: "75.00",
        source: "web",
        lines: [{ qty: 1, revenue: "75.00" }],
      }),
    ];
    const result = computeSalesAttribution(orders, "channel", "pro", RANGE, false, null);
    const web = result.rows.find((r) => r.key === "web");
    expect(web?.orders).toBe(2);
    expect(web?.revenue.amount).toBe("175.00");
  });
});

describe("sales-attribution pro-only gating", () => {
  it("returns pro_only=true when free plan asks for pos_location", () => {
    const result = computeSalesAttribution([], "pos_location", "free", RANGE, false, null);
    expect(result.pro_only).toBe(true);
    expect(result.rows).toEqual([]);
  });

  it("computes pos_location for pro plan", () => {
    const orders = [
      makeOrder({
        id: "1",
        total: "100.00",
        posLocation: "Downtown",
        lines: [{ qty: 1, revenue: "100.00" }],
      }),
    ];
    const result = computeSalesAttribution(orders, "pos_location", "pro", RANGE, false, null);
    expect(result.pro_only).toBe(false);
    expect(result.rows[0]?.key).toBe("Downtown");
  });
});

describe("sales-attribution refund attribution", () => {
  it("computes return rate per vendor", () => {
    const orders = [
      makeOrder({
        id: "1",
        total: "100.00",
        lines: [
          {
            qty: 5,
            revenue: "100.00",
            vendor: "Acme",
            productId: "gid://shopify/Product/X",
          },
        ],
        refundLines: [
          {
            qty: 2,
            productId: "gid://shopify/Product/X",
            vendor: "Acme",
          },
        ],
      }),
    ];
    const result = computeSalesAttribution(orders, "vendor", "pro", RANGE, false, null);
    const acme = result.rows.find((r) => r.key === "Acme");
    expect(acme?.return_rate_pct).toBeCloseTo(2 / 5, 4);
  });
});
