/**
 * Unit tests for the profit aggregator. We exercise the in-memory aggregator
 * directly (`_internal.aggregateOrders`) against synthetic order fixtures so
 * we don't need to mock the Shopify GraphQL client.
 */

import { describe, expect, it } from "vitest";
import { _internal } from "./profit.js";
import { buildLookup } from "../cogs/lookup.js";
import type { CogsEntry, CogsMeta } from "@fbc/shared";

const { aggregateOrders, topProductsFrom } = _internal;

function makeMeta(overrides: Partial<CogsMeta> = {}): CogsMeta {
  return {
    schemaVersion: 1,
    totalCount: 0,
    shardCount: 0,
    defaultMarginPct: 0,
    lastWriteAt: new Date().toISOString(),
    currency_code: "USD",
    ...overrides,
  };
}

function makeEntry(variantId: string, costAmount: string): CogsEntry {
  return {
    variantId,
    sku: "SKU-X",
    productId: "gid://shopify/Product/1",
    title: "Test product",
    cost: { amount: costAmount, currency_code: "USD" },
    updatedAt: new Date().toISOString(),
  };
}

type LineItem = {
  id: string;
  quantity: number;
  refundableQuantity: number;
  variant: { id: string; sku: string | null } | null;
  product: { id: string; title: string } | null;
  discountedUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  originalUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } };
};

type OrderFixture = {
  id: string;
  processedAt: string;
  returnStatus: string;
  currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  currentSubtotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } };
  customer: { id: string; numberOfOrders: number } | null;
  lineItems: { edges: Array<{ node: LineItem }> };
  refunds: never[];
  returns: { edges: never[] };
};

function order(args: {
  id: string;
  total: string;
  lineItems: Array<{
    variantId: string | null;
    productId: string;
    productTitle: string;
    qty: number;
    refundableQty?: number;
    unitPrice: string;
  }>;
}): OrderFixture {
  return {
    id: `gid://shopify/Order/${args.id}`,
    processedAt: "2026-04-01T12:00:00Z",
    returnStatus: "NO_RETURN",
    refunds: [],
    returns: { edges: [] },
    currentTotalPriceSet: { shopMoney: { amount: args.total, currencyCode: "USD" } },
    currentSubtotalPriceSet: { shopMoney: { amount: args.total, currencyCode: "USD" } },
    totalRefundedSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
    customer: null,
    lineItems: {
      edges: args.lineItems.map((li, idx) => ({
        node: {
          id: `gid://shopify/LineItem/${args.id}-${idx}`,
          quantity: li.qty,
          refundableQuantity: li.refundableQty ?? li.qty,
          variant: li.variantId ? { id: li.variantId, sku: null } : null,
          product: { id: li.productId, title: li.productTitle },
          discountedUnitPriceSet: {
            shopMoney: { amount: li.unitPrice, currencyCode: "USD" },
          },
          originalUnitPriceSet: {
            shopMoney: { amount: li.unitPrice, currencyCode: "USD" },
          },
        },
      })),
    },
  };
}

describe("profit.aggregateOrders", () => {
  it("returns zeros for an empty store", () => {
    const lookup = buildLookup(makeMeta(), []);
    const agg = aggregateOrders([], lookup);
    expect(agg.ordersCounted).toBe(0);
    expect(agg.grossRevenueMinor).toBe(0n);
    expect(agg.grossProfitMinor).toBe(0n);
    expect(agg.coverage.lineItemsTotal).toBe(0);
  });

  it("uses explicit per-variant cost when set", () => {
    const variantId = "gid://shopify/ProductVariant/1";
    const entries: CogsEntry[] = [makeEntry(variantId, "4.00")];
    const lookup = buildLookup(makeMeta(), entries);
    const orders = [
      order({
        id: "1",
        total: "20.00",
        lineItems: [
          {
            variantId,
            productId: "gid://shopify/Product/1",
            productTitle: "Hat",
            qty: 2,
            unitPrice: "10.00",
          },
        ],
      }),
    ];
    const agg = aggregateOrders(orders, lookup);
    expect(agg.grossRevenueMinor).toBe(2000n);
    // profit = 2*(10 - 4) = 12.00
    expect(agg.grossProfitMinor).toBe(1200n);
    expect(agg.coverage.lineItemsWithExplicitCogs).toBe(1);
    expect(agg.coverage.lineItemsUsingDefaultMargin).toBe(0);
    expect(agg.coverage.lineItemsWithoutAnyCost).toBe(0);
  });

  it("falls back to default margin when no explicit cost exists", () => {
    const lookup = buildLookup(makeMeta({ defaultMarginPct: 0.5 }), []);
    const orders = [
      order({
        id: "1",
        total: "10.00",
        lineItems: [
          {
            variantId: "gid://shopify/ProductVariant/1",
            productId: "gid://shopify/Product/1",
            productTitle: "Hat",
            qty: 1,
            unitPrice: "10.00",
          },
        ],
      }),
    ];
    const agg = aggregateOrders(orders, lookup);
    // cost = 10 * 0.5 = 5.00; profit = 5.00
    expect(agg.grossProfitMinor).toBe(500n);
    expect(agg.coverage.lineItemsUsingDefaultMargin).toBe(1);
  });

  it("does not contribute profit when neither explicit nor default exists", () => {
    const lookup = buildLookup(makeMeta(), []);
    const orders = [
      order({
        id: "1",
        total: "10.00",
        lineItems: [
          {
            variantId: "gid://shopify/ProductVariant/1",
            productId: "gid://shopify/Product/1",
            productTitle: "Hat",
            qty: 1,
            unitPrice: "10.00",
          },
        ],
      }),
    ];
    const agg = aggregateOrders(orders, lookup);
    expect(agg.grossRevenueMinor).toBe(1000n);
    expect(agg.grossProfitMinor).toBe(0n);
    expect(agg.coverage.lineItemsWithoutAnyCost).toBe(1);
  });

  it("respects refunds via refundableQuantity (partial refund)", () => {
    const variantId = "gid://shopify/ProductVariant/1";
    const entries: CogsEntry[] = [makeEntry(variantId, "3.00")];
    const lookup = buildLookup(makeMeta(), entries);
    const orders = [
      order({
        id: "1",
        total: "20.00",
        lineItems: [
          {
            variantId,
            productId: "gid://shopify/Product/1",
            productTitle: "Mug",
            qty: 2,
            refundableQty: 1, // one unit refunded
            unitPrice: "10.00",
          },
        ],
      }),
    ];
    const agg = aggregateOrders(orders, lookup);
    // revenue counted on remaining unit only: 1 * 10 = 10
    expect(agg.grossRevenueMinor).toBe(1000n);
    // profit = 1 * (10 - 3) = 7.00
    expect(agg.grossProfitMinor).toBe(700n);
  });

  it("yields negative profit on a free item with known cost", () => {
    const variantId = "gid://shopify/ProductVariant/1";
    const entries: CogsEntry[] = [makeEntry(variantId, "5.00")];
    const lookup = buildLookup(makeMeta(), entries);
    const orders = [
      order({
        id: "1",
        total: "0.00",
        lineItems: [
          {
            variantId,
            productId: "gid://shopify/Product/1",
            productTitle: "Free sample",
            qty: 1,
            unitPrice: "0.00",
          },
        ],
      }),
    ];
    const agg = aggregateOrders(orders, lookup);
    expect(agg.grossRevenueMinor).toBe(0n);
    // profit = 0 - 5.00 = -5.00
    expect(agg.grossProfitMinor).toBe(-500n);
  });

  it("handles a missing variant id (deleted variant) by falling through priority", () => {
    const lookup = buildLookup(makeMeta({ defaultMarginPct: 0.4 }), []);
    const orders = [
      order({
        id: "1",
        total: "10.00",
        lineItems: [
          {
            variantId: null,
            productId: "gid://shopify/Product/1",
            productTitle: "Mystery",
            qty: 1,
            unitPrice: "10.00",
          },
        ],
      }),
    ];
    const agg = aggregateOrders(orders, lookup);
    // No explicit, default margin applies: cost = 10 * 0.6 = 6, profit = 4
    expect(agg.grossProfitMinor).toBe(400n);
    expect(agg.coverage.lineItemsUsingDefaultMargin).toBe(1);
  });

  it("ranks top products by gross profit at the product level", () => {
    const v1 = "gid://shopify/ProductVariant/1";
    const v2 = "gid://shopify/ProductVariant/2";
    const entries: CogsEntry[] = [
      makeEntry(v1, "1.00"),
      { ...makeEntry(v2, "2.00"), productId: "gid://shopify/Product/2", title: "Bag" },
    ];
    const lookup = buildLookup(makeMeta(), entries);
    const orders = [
      order({
        id: "1",
        total: "30.00",
        lineItems: [
          {
            variantId: v1,
            productId: "gid://shopify/Product/1",
            productTitle: "Hat",
            qty: 1,
            unitPrice: "10.00",
          },
          {
            variantId: v2,
            productId: "gid://shopify/Product/2",
            productTitle: "Bag",
            qty: 2,
            unitPrice: "10.00",
          },
        ],
      }),
    ];
    const agg = aggregateOrders(orders, lookup);
    const top = topProductsFrom(agg, "USD");
    expect(top[0]?.product_id).toBe("gid://shopify/Product/2"); // 2 * (10 - 2) = 16
    expect(top[1]?.product_id).toBe("gid://shopify/Product/1"); // 1 * (10 - 1) = 9
  });
});
