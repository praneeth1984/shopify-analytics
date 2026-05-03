import { describe, expect, it } from "vitest";
import { computeCatalog } from "../catalog.js";
import type { CatalogProductNode, OrderNode } from "../queries.js";
import type { DateRange } from "@fbc/shared";

const RANGE: DateRange = {
  preset: "last_30_days",
  start: "2026-04-01T00:00:00Z",
  end: "2026-05-01T00:00:00Z",
};

function makeProduct(args: {
  id: string;
  title: string;
  tags?: string[];
  vendor?: string | null;
  productType?: string | null;
  inventory?: number | null;
  createdAt?: string;
  minPrice?: string;
  maxPrice?: string;
}): CatalogProductNode {
  return {
    id: args.id,
    title: args.title,
    vendor: args.vendor ?? null,
    productType: args.productType ?? null,
    tags: args.tags ?? [],
    createdAt: args.createdAt ?? "2026-01-01T00:00:00Z",
    totalInventory: args.inventory ?? 0,
    priceRangeV2: {
      minVariantPrice: { amount: args.minPrice ?? "10.00", currencyCode: "USD" },
      maxVariantPrice: { amount: args.maxPrice ?? "20.00", currencyCode: "USD" },
    },
  };
}

function makeOrderWithLine(productId: string, qty: number, revenue: string): OrderNode {
  // minimal subset of OrderNode used by buildSalesIndex
  return {
    id: `gid://shopify/Order/${Math.random()}`,
    processedAt: "2026-04-10T00:00:00Z",
    returnStatus: "NO_RETURN",
    totalPriceSet: { shopMoney: { amount: revenue, currencyCode: "USD" } },
    currentTotalPriceSet: { shopMoney: { amount: revenue, currencyCode: "USD" } },
    currentSubtotalPriceSet: { shopMoney: { amount: revenue, currencyCode: "USD" } },
    totalRefundedSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
    paymentGatewayNames: [],
    discountCodes: [],
    totalShippingPriceSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
    shippingLines: { edges: [] },
    customer: null,
    lineItems: {
      edges: [
        {
          node: {
            id: "gid://shopify/LineItem/1",
            quantity: qty,
            refundableQuantity: qty,
            variant: null,
            product: { id: productId, title: "x" },
            discountedUnitPriceSet: {
              shopMoney: { amount: revenue, currencyCode: "USD" },
            },
            originalUnitPriceSet: { shopMoney: { amount: revenue, currencyCode: "USD" } },
            originalTotalSet: { shopMoney: { amount: revenue, currencyCode: "USD" } },
          },
        },
      ],
    },
    refunds: [],
  } as OrderNode;
}

describe("catalog never_sold view", () => {
  it("returns only products with zero units sold", () => {
    const products = [
      makeProduct({ id: "gid://P/1", title: "Sold Product" }),
      makeProduct({ id: "gid://P/2", title: "Unsold Product" }),
    ];
    const orders = [makeOrderWithLine("gid://P/1", 2, "20.00")];
    const result = computeCatalog({
      view: "never_sold",
      products,
      orders,
      plan: "pro",
      range: RANGE,
      truncated: false,
      historyClampedTo: null,
    });
    expect(result.view).toBe("never_sold");
    if (result.view !== "never_sold") return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.title).toBe("Unsold Product");
  });
});

describe("catalog all view", () => {
  it("sorts by revenue and includes sales overlay", () => {
    const products = [
      makeProduct({ id: "gid://P/1", title: "Low Earner" }),
      makeProduct({ id: "gid://P/2", title: "High Earner" }),
    ];
    const orders = [
      makeOrderWithLine("gid://P/1", 1, "10.00"),
      makeOrderWithLine("gid://P/2", 5, "100.00"),
    ];
    const result = computeCatalog({
      view: "all",
      products,
      orders,
      plan: "pro",
      range: RANGE,
      truncated: false,
      historyClampedTo: null,
    });
    expect(result.view).toBe("all");
    if (result.view !== "all") return;
    expect(result.rows[0]?.title).toBe("High Earner");
    expect(result.rows[0]?.units_sold).toBe(5);
    expect(result.rows[0]?.revenue.amount).toBe("100.00");
  });
});

describe("catalog by_tag view", () => {
  it("aggregates products by tag with units sold", () => {
    const products = [
      makeProduct({ id: "gid://P/1", title: "A", tags: ["summer", "sale"] }),
      makeProduct({ id: "gid://P/2", title: "B", tags: ["summer"] }),
      makeProduct({ id: "gid://P/3", title: "C", tags: ["winter"] }),
    ];
    const orders = [
      makeOrderWithLine("gid://P/1", 2, "20.00"),
      makeOrderWithLine("gid://P/2", 3, "30.00"),
    ];
    const result = computeCatalog({
      view: "by_tag",
      products,
      orders,
      plan: "pro",
      range: RANGE,
      truncated: false,
      historyClampedTo: null,
    });
    expect(result.view).toBe("by_tag");
    if (result.view !== "by_tag") return;
    const summer = result.rows.find((r) => r.tag === "summer");
    expect(summer?.product_count).toBe(2);
    expect(summer?.units_sold).toBe(5);
    expect(summer?.revenue.amount).toBe("50.00");
    const winter = result.rows.find((r) => r.tag === "winter");
    expect(winter?.product_count).toBe(1);
    expect(winter?.units_sold).toBe(0);
  });
});

describe("catalog free plan cap", () => {
  it("caps to 50 rows on free plan", () => {
    const products = Array.from({ length: 60 }, (_, i) =>
      makeProduct({ id: `gid://P/${i}`, title: `P${i}` }),
    );
    const result = computeCatalog({
      view: "all",
      products,
      orders: [],
      plan: "free",
      range: RANGE,
      truncated: false,
      historyClampedTo: null,
    });
    expect(result.view).toBe("all");
    if (result.view !== "all") return;
    expect(result.rows).toHaveLength(50);
    expect(result.total_count).toBe(60);
    expect(result.plan_capped_to).toBe(50);
  });
});
