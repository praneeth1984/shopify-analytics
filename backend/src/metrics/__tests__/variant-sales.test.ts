import { describe, expect, it } from "vitest";
import { computeVariantSales } from "../variant-sales.js";
import type { VariantOrderNode } from "../queries.js";
import type { DateRange } from "@fbc/shared";

const RANGE: DateRange = {
  preset: "last_30_days",
  start: "2026-04-01T00:00:00Z",
  end: "2026-05-01T00:00:00Z",
};

function makeOrder(args: {
  id: string;
  lines: Array<{
    qty: number;
    revenue: string;
    variantId?: string;
    variantTitle?: string | null;
    sku?: string | null;
    productId?: string;
    productTitle?: string;
    unitPrice?: string;
  }>;
  refundLines?: Array<{ qty: number; variantId: string }>;
}): VariantOrderNode {
  return {
    id: `gid://shopify/Order/${args.id}`,
    lineItems: {
      edges: args.lines.map((l, i) => ({
        node: {
          id: `gid://shopify/LineItem/${args.id}-${i}`,
          quantity: l.qty,
          sku: l.sku ?? null,
          variant: l.variantId
            ? {
                id: l.variantId,
                title: l.variantTitle ?? null,
                sku: l.sku ?? null,
              }
            : null,
          product: {
            id: l.productId ?? "gid://shopify/Product/P1",
            title: l.productTitle ?? "Some Product",
          },
          originalTotalSet: { shopMoney: { amount: l.revenue, currencyCode: "USD" } },
          discountedUnitPriceSet: {
            shopMoney: { amount: l.unitPrice ?? l.revenue, currencyCode: "USD" },
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
                    variant: { id: rl.variantId },
                  },
                },
              })),
            },
          },
        ]
      : [],
  };
}

describe("variant-sales aggregation", () => {
  it("aggregates units and revenue per variant", () => {
    const orders = [
      makeOrder({
        id: "1",
        lines: [
          {
            qty: 2,
            revenue: "40.00",
            variantId: "gid://shopify/ProductVariant/V1",
            variantTitle: "Small / Red",
            sku: "RED-S",
            productTitle: "Tee",
          },
          {
            qty: 1,
            revenue: "30.00",
            variantId: "gid://shopify/ProductVariant/V2",
            variantTitle: "Small / Blue",
            sku: "BLUE-S",
            productTitle: "Tee",
          },
        ],
      }),
      makeOrder({
        id: "2",
        lines: [
          {
            qty: 3,
            revenue: "60.00",
            variantId: "gid://shopify/ProductVariant/V1",
            variantTitle: "Small / Red",
            sku: "RED-S",
            productTitle: "Tee",
          },
        ],
      }),
    ];
    const result = computeVariantSales(orders, "pro", RANGE, false, null);
    const v1 = result.rows.find((r) => r.variant_id === "gid://shopify/ProductVariant/V1");
    expect(v1?.units_sold).toBe(5);
    expect(v1?.revenue.amount).toBe("100.00");
    expect(v1?.avg_price.amount).toBe("20.00"); // 100/5
    expect(v1?.sku).toBe("RED-S");
    expect(v1?.variant_title).toBe("Small / Red");
  });

  it("computes return rate from refund line items", () => {
    const orders = [
      makeOrder({
        id: "1",
        lines: [
          {
            qty: 5,
            revenue: "100.00",
            variantId: "gid://shopify/ProductVariant/V1",
          },
        ],
        refundLines: [{ qty: 2, variantId: "gid://shopify/ProductVariant/V1" }],
      }),
    ];
    const result = computeVariantSales(orders, "pro", RANGE, false, null);
    const v1 = result.rows[0];
    expect(v1?.refunded_units).toBe(2);
    expect(v1?.return_rate_pct).toBeCloseTo(0.4, 4);
  });

  it("caps to top 20 variants on free plan", () => {
    const lines = Array.from({ length: 25 }, (_, i) => ({
      qty: 1,
      revenue: `${100 - i}.00`,
      variantId: `gid://shopify/ProductVariant/V${i}`,
    }));
    const orders = [makeOrder({ id: "1", lines })];
    const result = computeVariantSales(orders, "free", RANGE, false, null);
    expect(result.rows).toHaveLength(20);
    expect(result.total_count).toBe(25);
    expect(result.plan_capped_to).toBe(20);
  });

  it("returns full list on pro plan", () => {
    const lines = Array.from({ length: 25 }, (_, i) => ({
      qty: 1,
      revenue: `${100 - i}.00`,
      variantId: `gid://shopify/ProductVariant/V${i}`,
    }));
    const orders = [makeOrder({ id: "1", lines })];
    const result = computeVariantSales(orders, "pro", RANGE, false, null);
    expect(result.rows).toHaveLength(25);
    expect(result.plan_capped_to).toBeNull();
  });
});
