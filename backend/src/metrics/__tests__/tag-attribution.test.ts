import { describe, expect, it } from "vitest";
import { computeTagReport } from "../tag-attribution.js";
import type { TagsOrderNode } from "../queries.js";
import type { DateRange } from "@fbc/shared";

const RANGE: DateRange = {
  preset: "last_30_days",
  start: "2026-04-01T00:00:00Z",
  end: "2026-05-01T00:00:00Z",
};

function makeOrder(args: {
  id: string;
  total: string;
  tags?: string[];
  customer?: { id: string; tags: string[]; amountSpent?: string } | null;
  lines?: Array<{
    qty: number;
    revenue: string;
    productId: string;
    productTags: string[];
  }>;
}): TagsOrderNode {
  return {
    id: `gid://shopify/Order/${args.id}`,
    tags: args.tags ?? [],
    totalPriceSet: { shopMoney: { amount: args.total, currencyCode: "USD" } },
    customer: args.customer
      ? {
          id: args.customer.id,
          tags: args.customer.tags,
          amountSpent: args.customer.amountSpent
            ? { amount: args.customer.amountSpent, currencyCode: "USD" }
            : null,
        }
      : null,
    lineItems: {
      edges: (args.lines ?? []).map((l) => ({
        node: {
          quantity: l.qty,
          originalTotalSet: { shopMoney: { amount: l.revenue, currencyCode: "USD" } },
          product: { id: l.productId, tags: l.productTags },
        },
      })),
    },
  };
}

describe("tag-attribution order tags", () => {
  it("aggregates orders + revenue per tag", () => {
    const orders = [
      makeOrder({ id: "1", total: "100.00", tags: ["wholesale", "vip"] }),
      makeOrder({ id: "2", total: "200.00", tags: ["wholesale"] }),
      makeOrder({ id: "3", total: "50.00", tags: ["retail"] }),
    ];
    const result = computeTagReport({
      orders,
      type: "order",
      plan: "pro",
      range: RANGE,
      truncated: false,
      historyClampedTo: null,
    });
    expect(result.type).toBe("order");
    if (result.type !== "order") return;
    const wholesale = result.rows.find((r) => r.tag === "wholesale");
    expect(wholesale?.order_count).toBe(2);
    expect(wholesale?.revenue.amount).toBe("300.00");
    expect(wholesale?.aov.amount).toBe("150.00");
  });
});

describe("tag-attribution product tags", () => {
  it("aggregates units + distinct products per tag", () => {
    const orders = [
      makeOrder({
        id: "1",
        total: "100.00",
        lines: [
          {
            qty: 2,
            revenue: "40.00",
            productId: "P1",
            productTags: ["summer", "sale"],
          },
          {
            qty: 1,
            revenue: "60.00",
            productId: "P2",
            productTags: ["summer"],
          },
        ],
      }),
    ];
    const result = computeTagReport({
      orders,
      type: "product",
      plan: "pro",
      range: RANGE,
      truncated: false,
      historyClampedTo: null,
    });
    expect(result.type).toBe("product");
    if (result.type !== "product") return;
    const summer = result.rows.find((r) => r.tag === "summer");
    expect(summer?.units_sold).toBe(3);
    expect(summer?.products_with_tag).toBe(2);
    expect(summer?.revenue.amount).toBe("100.00");
    const sale = result.rows.find((r) => r.tag === "sale");
    expect(sale?.products_with_tag).toBe(1);
  });
});

describe("tag-attribution customer tags", () => {
  it("returns pro_only=true and empty rows on free plan", () => {
    const result = computeTagReport({
      orders: [],
      type: "customer",
      plan: "free",
      range: RANGE,
      truncated: false,
      historyClampedTo: null,
    });
    expect(result.type).toBe("customer");
    if (result.type !== "customer") return;
    expect(result.pro_only).toBe(true);
    expect(result.rows).toEqual([]);
  });

  it("aggregates customers + ltv per tag on pro plan", () => {
    const orders = [
      makeOrder({
        id: "1",
        total: "100.00",
        customer: { id: "C1", tags: ["vip"], amountSpent: "500.00" },
      }),
      makeOrder({
        id: "2",
        total: "200.00",
        customer: { id: "C2", tags: ["vip"], amountSpent: "1000.00" },
      }),
      // duplicate customer should not double-count count
      makeOrder({
        id: "3",
        total: "50.00",
        customer: { id: "C1", tags: ["vip"], amountSpent: "500.00" },
      }),
    ];
    const result = computeTagReport({
      orders,
      type: "customer",
      plan: "pro",
      range: RANGE,
      truncated: false,
      historyClampedTo: null,
    });
    expect(result.type).toBe("customer");
    if (result.type !== "customer") return;
    const vip = result.rows.find((r) => r.tag === "vip");
    expect(vip?.customer_count).toBe(2);
    expect(vip?.revenue.amount).toBe("350.00");
    expect(vip?.avg_ltv.amount).toBe("750.00"); // (500 + 1000) / 2
  });
});

describe("tag-attribution free cap", () => {
  it("caps to top 10 tags on free plan", () => {
    const orders = Array.from({ length: 15 }, (_, i) =>
      makeOrder({ id: `${i}`, total: `${100 - i}.00`, tags: [`t${i}`] }),
    );
    const result = computeTagReport({
      orders,
      type: "order",
      plan: "free",
      range: RANGE,
      truncated: false,
      historyClampedTo: null,
    });
    expect(result.type).toBe("order");
    if (result.type !== "order") return;
    expect(result.rows).toHaveLength(10);
    expect(result.total_count).toBe(15);
    expect(result.plan_capped_to).toBe(10);
  });
});
