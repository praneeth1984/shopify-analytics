import { describe, expect, it } from "vitest";
import { computeBillingLocation, computeCurrency } from "../billing-location.js";
import type { BillingOrderNode } from "../queries.js";
import type { DateRange } from "@fbc/shared";

const RANGE: DateRange = {
  preset: "last_30_days",
  start: "2026-04-01T00:00:00Z",
  end: "2026-05-01T00:00:00Z",
};

function makeOrder(args: {
  id: string;
  shopAmount: string;
  presentmentAmount?: string;
  presentmentCurrency?: string;
  countryCode?: string | null;
  countryName?: string | null;
  province?: string | null;
}): BillingOrderNode {
  return {
    id: `gid://shopify/Order/${args.id}`,
    presentmentCurrencyCode: args.presentmentCurrency ?? "USD",
    billingAddress:
      args.countryCode === undefined
        ? null
        : args.countryCode === null
        ? null
        : {
            countryCode: args.countryCode,
            country: args.countryName ?? args.countryCode,
            province: args.province ?? null,
          },
    totalPriceSet: {
      shopMoney: { amount: args.shopAmount, currencyCode: "USD" },
      presentmentMoney: {
        amount: args.presentmentAmount ?? args.shopAmount,
        currencyCode: args.presentmentCurrency ?? "USD",
      },
    },
  };
}

describe("billing-location free plan", () => {
  it("returns country-level rows only on free plan", () => {
    const orders = [
      makeOrder({
        id: "1",
        shopAmount: "100.00",
        countryCode: "US",
        countryName: "United States",
        province: "California",
      }),
      makeOrder({
        id: "2",
        shopAmount: "50.00",
        countryCode: "US",
        countryName: "United States",
        province: "Texas",
      }),
      makeOrder({
        id: "3",
        shopAmount: "75.00",
        countryCode: "CA",
        countryName: "Canada",
        province: "Ontario",
      }),
    ];
    const result = computeBillingLocation(orders, "free", RANGE, false, null);
    // Expect only country-level rows
    expect(result.rows.every((r) => r.province === null)).toBe(true);
    expect(result.rows).toHaveLength(2);
    const us = result.rows.find((r) => r.country_code === "US");
    expect(us?.orders).toBe(2);
    expect(us?.revenue.amount).toBe("150.00");
    expect(us?.aov.amount).toBe("75.00");
  });
});

describe("billing-location pro plan", () => {
  it("includes province-level rows on pro plan", () => {
    const orders = [
      makeOrder({
        id: "1",
        shopAmount: "100.00",
        countryCode: "US",
        countryName: "United States",
        province: "California",
      }),
      makeOrder({
        id: "2",
        shopAmount: "50.00",
        countryCode: "US",
        countryName: "United States",
        province: "Texas",
      }),
    ];
    const result = computeBillingLocation(orders, "pro", RANGE, false, null);
    const provinceRows = result.rows.filter((r) => r.province !== null);
    expect(provinceRows).toHaveLength(2);
    const ca = provinceRows.find((r) => r.province === "California");
    expect(ca?.revenue.amount).toBe("100.00");
  });

  it("counts orders without billing address separately", () => {
    const orders = [
      makeOrder({
        id: "1",
        shopAmount: "100.00",
        countryCode: "US",
      }),
      makeOrder({
        id: "2",
        shopAmount: "50.00",
        countryCode: null,
      }),
    ];
    const result = computeBillingLocation(orders, "pro", RANGE, false, null);
    expect(result.no_billing_address_count).toBe(1);
  });
});

describe("currency aggregation", () => {
  it("groups orders by presentment currency and computes avg rate", () => {
    const orders = [
      makeOrder({
        id: "1",
        shopAmount: "100.00",
        presentmentAmount: "85.00",
        presentmentCurrency: "EUR",
        countryCode: "DE",
      }),
      makeOrder({
        id: "2",
        shopAmount: "200.00",
        presentmentAmount: "170.00",
        presentmentCurrency: "EUR",
        countryCode: "FR",
      }),
      makeOrder({
        id: "3",
        shopAmount: "100.00",
        presentmentAmount: "100.00",
        presentmentCurrency: "USD",
        countryCode: "US",
      }),
    ];
    const result = computeCurrency(orders, RANGE, false, null);
    const eur = result.rows.find((r) => r.currency === "EUR");
    expect(eur?.orders).toBe(2);
    expect(eur?.revenue_presentment.amount).toBe("255.00"); // 85 + 170
    expect(eur?.revenue_shop.amount).toBe("300.00"); // 100 + 200
    expect(eur?.avg_rate).toBeCloseTo(100 / 85, 2);
    const usd = result.rows.find((r) => r.currency === "USD");
    expect(usd?.orders).toBe(1);
    expect(usd?.avg_rate).toBeCloseTo(1, 2);
  });
});
