import { describe, expect, it } from "vitest";
import { computeReturnsByProduct } from "../returns-by-product.js";
import type { OrderNode } from "../queries.js";

type LineItemSpec = {
  liId: string;
  qty: number;
  variantId: string | null;
  productId: string | null;
  productTitle: string | null;
  unitPrice: string;
};

type ReturnLineSpec = {
  qty: number;
  refLiId: string; // refers to existing lineItem id
};

type RefundLineSpec = {
  qty: number;
  refLiId: string;
};

function makeOrder(args: {
  id: string;
  total?: string;
  refunded?: string;
  returnStatus?: OrderNode["returnStatus"];
  lineItems: LineItemSpec[];
  returnLines?: ReturnLineSpec[];
  refundLines?: RefundLineSpec[];
}): OrderNode {
  const liById = new Map<string, LineItemSpec>();
  for (const li of args.lineItems) liById.set(li.liId, li);

  const lineItems = {
    edges: args.lineItems.map((li) => ({
      node: {
        id: li.liId,
        quantity: li.qty,
        refundableQuantity: li.qty,
        variant: li.variantId ? { id: li.variantId, sku: null } : null,
        product:
          li.productId !== null
            ? { id: li.productId, title: li.productTitle ?? "Untitled" }
            : null,
        discountedUnitPriceSet: {
          shopMoney: { amount: li.unitPrice, currencyCode: "USD" },
        },
        originalUnitPriceSet: {
          shopMoney: { amount: li.unitPrice, currencyCode: "USD" },
        },
      },
    })),
  };

  const returns = {
    edges: (args.returnLines ?? []).map((rl, i) => {
      const li = liById.get(rl.refLiId);
      return {
        node: {
          id: `gid://shopify/Return/${args.id}-${i}`,
          status: "OPEN",
          returnLineItems: {
            edges: [
              {
                node: {
                  quantity: rl.qty,
                  returnReason: "UNWANTED",
                  fulfillmentLineItem: li
                    ? {
                        lineItem: {
                          id: li.liId,
                          product:
                            li.productId !== null
                              ? { id: li.productId, title: li.productTitle ?? "Untitled" }
                              : null,
                          variant: li.variantId ? { id: li.variantId } : null,
                        },
                      }
                    : null,
                },
              },
            ],
          },
        },
      };
    }),
  };

  const refunds = (args.refundLines ?? []).map((rl, i) => {
    const li = liById.get(rl.refLiId);
    return {
      id: `gid://shopify/Refund/${args.id}-${i}`,
      createdAt: "2026-04-01T12:00:00Z",
      totalRefundedSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
      refundLineItems: {
        edges: [
          {
            node: {
              quantity: rl.qty,
              lineItem: li
                ? {
                    id: li.liId,
                    product:
                      li.productId !== null
                        ? { id: li.productId, title: li.productTitle ?? "Untitled" }
                        : null,
                    variant: li.variantId ? { id: li.variantId } : null,
                  }
                : null,
            },
          },
        ],
      },
      transactions: { edges: [] },
    };
  });

  return {
    id: `gid://shopify/Order/${args.id}`,
    processedAt: "2026-04-01T12:00:00Z",
    returnStatus: args.returnStatus ?? "NO_RETURN",
    currentTotalPriceSet: {
      shopMoney: { amount: args.total ?? "0.00", currencyCode: "USD" },
    },
    currentSubtotalPriceSet: {
      shopMoney: { amount: args.total ?? "0.00", currencyCode: "USD" },
    },
    totalRefundedSet: {
      shopMoney: { amount: args.refunded ?? "0.00", currencyCode: "USD" },
    },
    customer: null,
    lineItems,
    refunds,
    returns,
  };
}

describe("returns-by-product", () => {
  it("returns empty for empty input", () => {
    const result = computeReturnsByProduct([], "free");
    expect(result.products).toEqual([]);
    expect(result.excluded_low_volume_count).toBe(0);
  });

  it("excludes products with fewer than 5 ordered units", () => {
    const orders: OrderNode[] = [
      makeOrder({
        id: "1",
        lineItems: [
          {
            liId: "gid://shopify/LineItem/1-0",
            qty: 4,
            variantId: "gid://shopify/ProductVariant/1",
            productId: "gid://shopify/Product/A",
            productTitle: "Low volume",
            unitPrice: "10.00",
          },
        ],
        returnLines: [{ qty: 1, refLiId: "gid://shopify/LineItem/1-0" }],
      }),
    ];
    const result = computeReturnsByProduct(orders, "free");
    expect(result.products).toEqual([]);
    expect(result.excluded_low_volume_count).toBe(1);
  });

  it("computes return_rate correctly for a high-volume product", () => {
    // Build orders with 10 units ordered, 3 returned (rate 30%).
    const lineItems: LineItemSpec[] = [];
    const returnLines: ReturnLineSpec[] = [];
    for (let i = 0; i < 10; i += 1) {
      const liId = `gid://shopify/LineItem/order-${i}`;
      lineItems.push({
        liId,
        qty: 1,
        variantId: "gid://shopify/ProductVariant/V",
        productId: "gid://shopify/Product/P",
        productTitle: "Hat",
        unitPrice: "20.00",
      });
      if (i < 3) returnLines.push({ qty: 1, refLiId: liId });
    }
    const orders: OrderNode[] = [
      makeOrder({ id: "single", lineItems, returnLines }),
    ];
    const result = computeReturnsByProduct(orders, "free");
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.product_id).toBe("gid://shopify/Product/P");
    expect(result.products[0]?.ordered_units).toBe(10);
    expect(result.products[0]?.returned_units).toBe(3);
    expect(result.products[0]?.return_rate).toBeCloseTo(0.3, 6);
  });

  it("titles deleted products as 'Deleted product'", () => {
    const lineItems: LineItemSpec[] = [];
    for (let i = 0; i < 6; i += 1) {
      lineItems.push({
        liId: `gid://shopify/LineItem/del-${i}`,
        qty: 1,
        variantId: null,
        productId: null,
        productTitle: null,
        unitPrice: "10.00",
      });
    }
    const orders: OrderNode[] = [
      makeOrder({
        id: "deleted",
        lineItems,
        returnLines: [{ qty: 1, refLiId: "gid://shopify/LineItem/del-0" }],
      }),
    ];
    const result = computeReturnsByProduct(orders, "free");
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.title).toBe("Deleted product");
  });

  it("includes variant breakdown on Pro and omits on Free", () => {
    const lineItems: LineItemSpec[] = [];
    for (let i = 0; i < 6; i += 1) {
      lineItems.push({
        liId: `gid://shopify/LineItem/var-${i}`,
        qty: 1,
        variantId: i < 3 ? "gid://shopify/ProductVariant/A" : "gid://shopify/ProductVariant/B",
        productId: "gid://shopify/Product/P",
        productTitle: "Hat",
        unitPrice: "10.00",
      });
    }
    const orders: OrderNode[] = [
      makeOrder({
        id: "vars",
        lineItems,
        returnLines: [
          { qty: 1, refLiId: "gid://shopify/LineItem/var-0" },
          { qty: 1, refLiId: "gid://shopify/LineItem/var-3" },
        ],
      }),
    ];

    const free = computeReturnsByProduct(orders, "free");
    expect(free.products).toHaveLength(1);
    expect(free.products[0]?.variants).toBeUndefined();

    const pro = computeReturnsByProduct(orders, "pro");
    expect(pro.products).toHaveLength(1);
    expect(pro.products[0]?.variants?.length).toBeGreaterThan(0);
  });

  it("computes refunded_value from line item unit prices", () => {
    const lineItems: LineItemSpec[] = [];
    for (let i = 0; i < 6; i += 1) {
      lineItems.push({
        liId: `gid://shopify/LineItem/p-${i}`,
        qty: 1,
        variantId: "gid://shopify/ProductVariant/V",
        productId: "gid://shopify/Product/P",
        productTitle: "Hat",
        unitPrice: "12.50",
      });
    }
    const orders: OrderNode[] = [
      makeOrder({
        id: "ref",
        lineItems,
        refundLines: [
          { qty: 1, refLiId: "gid://shopify/LineItem/p-0" },
          { qty: 1, refLiId: "gid://shopify/LineItem/p-1" },
        ],
      }),
    ];
    const result = computeReturnsByProduct(orders, "free");
    expect(result.products[0]?.refunded_value.amount).toBe("25.00");
    expect(result.products[0]?.refunded_value.currency_code).toBe("USD");
  });
});
