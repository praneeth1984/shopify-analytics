import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { _internal } from "../fulfillment.js";
import type { FulfillmentOrderNode } from "../queries.js";

const { nodeToUnfulfilledRow, buildPerformance, nodeToShippingRow, buildSearchForView } =
  _internal;

function makeOrder(overrides: Partial<FulfillmentOrderNode> = {}): FulfillmentOrderNode {
  return {
    id: "gid://shopify/Order/100",
    name: "#1001",
    createdAt: "2026-04-01T00:00:00Z",
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "UNFULFILLED",
    currentSubtotalLineItemsQuantity: 2,
    totalPriceSet: { shopMoney: { amount: "120.00", currencyCode: "USD" } },
    fulfillments: [],
    shippingLines: { edges: [] },
    ...overrides,
  };
}

describe("fulfillment buildSearchForView", () => {
  it("emits live filter for unfulfilled", () => {
    expect(buildSearchForView("unfulfilled", null)).toContain("fulfillment_status:unfulfilled");
  });

  it("emits stuck filter (paid + unfulfilled)", () => {
    const q = buildSearchForView("stuck", null);
    expect(q).toContain("fulfillment_status:unfulfilled");
    expect(q).toContain("financial_status:paid");
  });

  it("emits processed_at range for performance", () => {
    const q = buildSearchForView("performance", {
      start: "2026-04-01T00:00:00Z",
      end: "2026-05-01T00:00:00Z",
    });
    expect(q).toContain("processed_at:>='2026-04-01T00:00:00Z'");
    expect(q).toContain("processed_at:<'2026-05-01T00:00:00Z'");
  });
});

describe("fulfillment nodeToUnfulfilledRow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("computes days_waiting from createdAt to now", () => {
    const row = nodeToUnfulfilledRow(makeOrder({ createdAt: "2026-04-01T00:00:00Z" }));
    expect(row.days_waiting).toBe(4);
    expect(row.order_id).toBe("100");
    expect(row.total_price.amount).toBe("120.00");
    expect(row.financial_status).toBe("PAID");
  });

  it("never returns negative days_waiting", () => {
    const row = nodeToUnfulfilledRow(makeOrder({ createdAt: "2026-05-10T00:00:00Z" }));
    expect(row.days_waiting).toBe(0);
  });
});

describe("fulfillment buildPerformance", () => {
  it("returns null median when no orders fulfilled", () => {
    const perf = buildPerformance([makeOrder()]);
    expect(perf.median_fulfillment_days).toBeNull();
    expect(perf.total_fulfilled).toBe(0);
  });

  it("computes median and threshold percentages", () => {
    const orders = [
      makeOrder({
        id: "gid://shopify/Order/1",
        createdAt: "2026-04-01T00:00:00Z",
        fulfillments: [{ createdAt: "2026-04-01T12:00:00Z", status: "SUCCESS" }], // 0.5d
      }),
      makeOrder({
        id: "gid://shopify/Order/2",
        createdAt: "2026-04-01T00:00:00Z",
        fulfillments: [{ createdAt: "2026-04-03T00:00:00Z", status: "SUCCESS" }], // 2d
      }),
      makeOrder({
        id: "gid://shopify/Order/3",
        createdAt: "2026-04-01T00:00:00Z",
        fulfillments: [{ createdAt: "2026-04-06T00:00:00Z", status: "SUCCESS" }], // 5d
      }),
    ];
    const perf = buildPerformance(orders);
    expect(perf.total_fulfilled).toBe(3);
    expect(perf.median_fulfillment_days).toBeCloseTo(2, 2);
    expect(perf.pct_within_1d).toBeCloseTo(1 / 3, 4);
    expect(perf.pct_within_3d).toBeCloseTo(2 / 3, 4);
    expect(perf.pct_within_7d).toBeCloseTo(1, 4);
  });
});

describe("fulfillment nodeToShippingRow", () => {
  it("maps shipping line fields", () => {
    const order = makeOrder({
      id: "gid://shopify/Order/55",
      shippingLines: {
        edges: [
          {
            node: {
              title: "Standard Shipping",
              source: "shopify",
              carrierIdentifier: "ups",
              code: "GROUND",
              discountedPriceSet: { shopMoney: { amount: "12.50", currencyCode: "USD" } },
            },
          },
        ],
      },
    });
    const row = nodeToShippingRow(order);
    expect(row.order_id).toBe("55");
    expect(row.carrier).toBe("ups");
    expect(row.service).toBe("Standard Shipping");
    expect(row.shipping_charged.amount).toBe("12.50");
    expect(row.carrier_cost).toBeNull(); // not exposed in Phase 1
    expect(row.shipping_pnl).toBeNull();
  });

  it("returns zero charged when no shipping line", () => {
    const order = makeOrder({ shippingLines: { edges: [] } });
    const row = nodeToShippingRow(order);
    expect(row.shipping_charged.amount).toBe("0.00");
    expect(row.carrier).toBeNull();
  });
});
