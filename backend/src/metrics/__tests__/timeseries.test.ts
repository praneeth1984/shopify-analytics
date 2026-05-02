/**
 * Unit tests for the time-series bucketing helpers used by the chart endpoints.
 * We exercise the pure functions directly with synthetic order fixtures.
 */

import { describe, expect, it } from "vitest";
import type { CogsEntry, CogsMeta, DateRange } from "@fbc/shared";
import { buildLookup } from "../../cogs/lookup.js";
import type { OrderNode } from "../queries.js";
import {
  bucketKey,
  buildAlignedPreviousSeries,
  buildDowSeries,
  buildMarginSeries,
  buildRevenueAndOrdersSeries,
  buildReturnRateSeries,
  enumerateBuckets,
  pickGranularity,
} from "../timeseries.js";

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

function makeOrder(args: {
  id: string;
  processedAt: string;
  total?: string;
  returnStatus?: OrderNode["returnStatus"];
  lineItems?: Array<{
    variantId: string | null;
    productId: string;
    productTitle: string;
    qty: number;
    refundableQty?: number;
    unitPrice: string;
  }>;
}): OrderNode {
  return {
    id: `gid://shopify/Order/${args.id}`,
    processedAt: args.processedAt,
    returnStatus: args.returnStatus ?? "NO_RETURN",
    totalPriceSet: {
      shopMoney: { amount: args.total ?? "0.00", currencyCode: "USD" },
    },
    currentTotalPriceSet: {
      shopMoney: { amount: args.total ?? "0.00", currencyCode: "USD" },
    },
    currentSubtotalPriceSet: {
      shopMoney: { amount: args.total ?? "0.00", currencyCode: "USD" },
    },
    totalRefundedSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
    customer: null,
    lineItems: {
      edges: (args.lineItems ?? []).map((li, idx) => ({
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
          originalTotalSet: {
            shopMoney: {
              amount: (parseFloat(li.unitPrice) * li.qty).toFixed(2),
              currencyCode: "USD",
            },
          },
        },
      })),
    },
    paymentGatewayNames: ["shopify_payments"],
    discountCodes: [],
    totalShippingPriceSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
    shippingLines: { edges: [] },
    refunds: [],
    returns: { edges: [] },
  };
}

const range7Days: DateRange = {
  preset: "last_7_days",
  start: "2026-04-01T00:00:00.000Z",
  end: "2026-04-08T00:00:00.000Z",
};

describe("pickGranularity", () => {
  it("returns 'day' for ranges <= 90 days", () => {
    expect(pickGranularity(range7Days)).toBe("day");
    expect(
      pickGranularity({
        preset: "custom",
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-04-01T00:00:00.000Z", // 90 days
      }),
    ).toBe("day");
  });

  it("returns 'week' for ranges > 90 days", () => {
    expect(
      pickGranularity({
        preset: "custom",
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-04-02T00:00:00.000Z", // 91 days
      }),
    ).toBe("week");
  });
});

describe("bucketKey", () => {
  it("returns the calendar date in 'day' mode", () => {
    expect(bucketKey("2026-04-03T15:30:00.000Z", "day")).toBe("2026-04-03");
  });

  it("returns the Monday of the ISO week in 'week' mode", () => {
    // 2026-04-01 is a Wednesday → Monday of that ISO week is 2026-03-30.
    expect(bucketKey("2026-04-01T00:00:00.000Z", "week")).toBe("2026-03-30");
    // A Sunday: 2026-04-05 → Monday of its ISO week is 2026-03-30.
    expect(bucketKey("2026-04-05T23:59:59.000Z", "week")).toBe("2026-03-30");
    // A Monday: maps to itself.
    expect(bucketKey("2026-04-06T00:00:00.000Z", "week")).toBe("2026-04-06");
  });
});

describe("enumerateBuckets", () => {
  it("returns 7 daily buckets for a 7-day range", () => {
    const keys = enumerateBuckets(range7Days, "day");
    expect(keys).toEqual([
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-04",
      "2026-04-05",
      "2026-04-06",
      "2026-04-07",
    ]);
  });

  it("returns weekly buckets anchored to Monday", () => {
    // 2026-04-01 (Wed) → Monday 2026-03-30; range ends 2026-04-15 (Wed).
    const keys = enumerateBuckets(
      {
        preset: "custom",
        start: "2026-04-01T00:00:00.000Z",
        end: "2026-04-15T00:00:00.000Z",
      },
      "week",
    );
    // Expect Mondays: 2026-03-30, 2026-04-06, 2026-04-13.
    expect(keys).toEqual(["2026-03-30", "2026-04-06", "2026-04-13"]);
  });
});

describe("buildRevenueAndOrdersSeries", () => {
  it("buckets 3 orders across 2 days correctly", () => {
    const orders: OrderNode[] = [
      makeOrder({ id: "1", processedAt: "2026-04-01T10:00:00Z", total: "10.00" }),
      makeOrder({ id: "2", processedAt: "2026-04-01T18:00:00Z", total: "5.50" }),
      makeOrder({ id: "3", processedAt: "2026-04-03T12:00:00Z", total: "20.00" }),
    ];
    const { revenue_series, orders_series } = buildRevenueAndOrdersSeries(orders, range7Days, "day");
    // Length matches the 7-day enumeration.
    expect(revenue_series).toHaveLength(7);
    expect(orders_series).toHaveLength(7);

    // Day 1: 2 orders, 15.50 -> 1550 minor.
    expect(revenue_series[0]).toEqual({ date: "2026-04-01", value: 1550 });
    expect(orders_series[0]).toEqual({ date: "2026-04-01", value: 2 });
    // Day 2 (no orders): zero-filled.
    expect(revenue_series[1]).toEqual({ date: "2026-04-02", value: 0 });
    expect(orders_series[1]).toEqual({ date: "2026-04-02", value: 0 });
    // Day 3: 1 order, 20.00 -> 2000 minor.
    expect(revenue_series[2]).toEqual({ date: "2026-04-03", value: 2000 });
    expect(orders_series[2]).toEqual({ date: "2026-04-03", value: 1 });
    // Tail: zero-filled.
    expect(revenue_series[6]).toEqual({ date: "2026-04-07", value: 0 });
  });

  it("yields all-zero buckets for empty orders", () => {
    const { revenue_series, orders_series } = buildRevenueAndOrdersSeries([], range7Days, "day");
    expect(revenue_series).toHaveLength(7);
    expect(revenue_series.every((p) => p.value === 0)).toBe(true);
    expect(orders_series.every((p) => p.value === 0)).toBe(true);
  });
});

describe("buildAlignedPreviousSeries", () => {
  it("emits previous-period orders under the current range's bucket keys", () => {
    const currentRange: DateRange = {
      preset: "last_7_days",
      start: "2026-04-08T00:00:00.000Z",
      end: "2026-04-15T00:00:00.000Z",
    };
    const prevRange: DateRange = {
      preset: "custom",
      start: "2026-04-01T00:00:00.000Z",
      end: "2026-04-08T00:00:00.000Z",
    };
    const prevOrders: OrderNode[] = [
      makeOrder({ id: "p1", processedAt: "2026-04-01T10:00:00Z", total: "30.00" }),
      makeOrder({ id: "p2", processedAt: "2026-04-03T10:00:00Z", total: "12.00" }),
    ];
    const { revenue_series, orders_series } = buildAlignedPreviousSeries(
      prevOrders,
      prevRange,
      currentRange,
      "day",
    );

    expect(revenue_series.map((p) => p.date)).toEqual([
      "2026-04-08",
      "2026-04-09",
      "2026-04-10",
      "2026-04-11",
      "2026-04-12",
      "2026-04-13",
      "2026-04-14",
    ]);
    // Position 0 (prev: 2026-04-01) had 30.00 = 3000 minor.
    expect(revenue_series[0]?.value).toBe(3000);
    expect(orders_series[0]?.value).toBe(1);
    // Position 2 (prev: 2026-04-03) had 12.00 = 1200 minor.
    expect(revenue_series[2]?.value).toBe(1200);
    expect(orders_series[2]?.value).toBe(1);
  });
});

describe("buildDowSeries", () => {
  it("always returns 7 entries Sun..Sat", () => {
    const series = buildDowSeries([]);
    expect(series).toHaveLength(7);
    expect(series.map((p) => p.label)).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
    expect(series.every((p) => p.revenue_minor === 0 && p.orders === 0)).toBe(true);
  });

  it("attributes orders to the correct UTC day-of-week", () => {
    const orders: OrderNode[] = [
      // 2026-04-01 is a Wednesday in UTC → dow=3.
      makeOrder({ id: "1", processedAt: "2026-04-01T10:00:00Z", total: "10.00" }),
      makeOrder({ id: "2", processedAt: "2026-04-01T15:00:00Z", total: "5.00" }),
      // 2026-04-04 is a Saturday in UTC → dow=6.
      makeOrder({ id: "3", processedAt: "2026-04-04T08:00:00Z", total: "8.00" }),
    ];
    const series = buildDowSeries(orders);
    expect(series[3]?.label).toBe("Wed");
    expect(series[3]?.revenue_minor).toBe(1500);
    expect(series[3]?.orders).toBe(2);
    expect(series[6]?.label).toBe("Sat");
    expect(series[6]?.revenue_minor).toBe(800);
    expect(series[6]?.orders).toBe(1);
  });
});

describe("buildReturnRateSeries", () => {
  it("returns null when a bucket has 0 orders", () => {
    const series = buildReturnRateSeries([], range7Days, "day");
    expect(series).toHaveLength(7);
    expect(series.every((p) => p.value === null)).toBe(true);
  });

  it("returns basis points when a bucket has orders", () => {
    const orders: OrderNode[] = [
      // Day 1: 4 orders, 1 returned → 25.00% → 2500 bp.
      makeOrder({ id: "1", processedAt: "2026-04-01T10:00:00Z", returnStatus: "NO_RETURN" }),
      makeOrder({ id: "2", processedAt: "2026-04-01T11:00:00Z", returnStatus: "NO_RETURN" }),
      makeOrder({ id: "3", processedAt: "2026-04-01T12:00:00Z", returnStatus: "NO_RETURN" }),
      makeOrder({ id: "4", processedAt: "2026-04-01T13:00:00Z", returnStatus: "RETURNED" }),
      // Day 2: 1 order, also returned via INSPECTION_COMPLETE → 100% → 10000 bp.
      makeOrder({
        id: "5",
        processedAt: "2026-04-02T10:00:00Z",
        returnStatus: "INSPECTION_COMPLETE",
      }),
    ];
    const series = buildReturnRateSeries(orders, range7Days, "day");
    expect(series[0]).toEqual({ date: "2026-04-01", value: 2500 });
    expect(series[1]).toEqual({ date: "2026-04-02", value: 10_000 });
    expect(series[2]).toEqual({ date: "2026-04-03", value: null });
  });
});

describe("buildMarginSeries", () => {
  it("returns null for buckets with zero revenue", () => {
    const lookup = buildLookup(makeMeta(), []);
    const series = buildMarginSeries([], lookup, range7Days, "day");
    expect(series).toHaveLength(7);
    expect(series.every((p) => p.value === null)).toBe(true);
  });

  it("computes margin in basis points using explicit cost", () => {
    const variantId = "gid://shopify/ProductVariant/1";
    const entry: CogsEntry = {
      variantId,
      sku: "X",
      productId: "gid://shopify/Product/1",
      title: "Hat",
      cost: { amount: "4.00", currency_code: "USD" },
      updatedAt: new Date().toISOString(),
    };
    const lookup = buildLookup(makeMeta(), [entry]);
    const orders: OrderNode[] = [
      makeOrder({
        id: "1",
        processedAt: "2026-04-01T10:00:00Z",
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
    const series = buildMarginSeries(orders, lookup, range7Days, "day");
    // Revenue 20, profit 12 → margin 0.6 → 6000 bp.
    expect(series[0]).toEqual({ date: "2026-04-01", value: 6000 });
    expect(series[1]?.value).toBeNull(); // no revenue on day 2
  });
});
