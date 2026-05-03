/**
 * F46 — Sales by Billing Location & Checkout Currency.
 *
 * Two endpoints share a single query (`ORDERS_BILLING_QUERY`):
 *   - billing  — group orders by billingAddress.countryCode (+ province on Pro)
 *   - currency — group orders by presentmentCurrencyCode
 */

import type {
  BillingLocationResponse,
  BillingLocationRow,
  CurrencyResponse,
  CurrencyRow,
  DateRange,
  HistoryClamp,
  Plan,
} from "@fbc/shared";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";
import type { BillingOrderNode } from "./queries.js";

type Acc = { orders: number; revenue_minor: bigint };

function nameForCountry(o: BillingOrderNode): string {
  return o.billingAddress?.country ?? o.billingAddress?.countryCode ?? "";
}

export function computeBillingLocation(
  orders: BillingOrderNode[],
  plan: Plan,
  range: DateRange,
  truncated: boolean,
  historyClampedTo: HistoryClamp | null,
): BillingLocationResponse {
  const countryNames = new Map<string, string>();
  // key: countryCode|province (or just countryCode for country-level row)
  const countryAccs = new Map<string, Acc>();
  const provinceAccs = new Map<string, Acc>();
  let noBilling = 0;
  let currency = "USD";

  for (const o of orders) {
    const code = o.totalPriceSet.shopMoney.currencyCode;
    if (code) currency = code;
    const cc = o.billingAddress?.countryCode;
    if (!cc) {
      noBilling += 1;
      continue;
    }
    countryNames.set(cc, nameForCountry(o));
    const orderRev = moneyToMinor(o.totalPriceSet.shopMoney.amount);
    const cAcc = countryAccs.get(cc) ?? { orders: 0, revenue_minor: 0n };
    cAcc.orders += 1;
    cAcc.revenue_minor += orderRev;
    countryAccs.set(cc, cAcc);
    if (plan !== "free") {
      const prov = o.billingAddress?.province;
      if (prov) {
        const key = `${cc}|${prov}`;
        const pAcc = provinceAccs.get(key) ?? { orders: 0, revenue_minor: 0n };
        pAcc.orders += 1;
        pAcc.revenue_minor += orderRev;
        provinceAccs.set(key, pAcc);
      }
    }
  }

  const rows: BillingLocationRow[] = [];
  for (const [cc, acc] of countryAccs) {
    const aov = acc.orders > 0 ? acc.revenue_minor / BigInt(acc.orders) : 0n;
    rows.push({
      country_code: cc,
      country_name: countryNames.get(cc) ?? cc,
      province: null,
      orders: acc.orders,
      revenue: minorToMoney(acc.revenue_minor, currency),
      aov: minorToMoney(aov, currency),
    });
  }
  if (plan !== "free") {
    for (const [key, acc] of provinceAccs) {
      const [cc, prov] = key.split("|") as [string, string];
      const aov = acc.orders > 0 ? acc.revenue_minor / BigInt(acc.orders) : 0n;
      rows.push({
        country_code: cc,
        country_name: countryNames.get(cc) ?? cc,
        province: prov,
        orders: acc.orders,
        revenue: minorToMoney(acc.revenue_minor, currency),
        aov: minorToMoney(aov, currency),
      });
    }
  }
  rows.sort((a, b) => {
    const aRev = moneyToMinor(a.revenue.amount);
    const bRev = moneyToMinor(b.revenue.amount);
    return bRev > aRev ? 1 : bRev < aRev ? -1 : 0;
  });

  return {
    range,
    rows,
    truncated,
    history_clamped_to: historyClampedTo,
    no_billing_address_count: noBilling,
  };
}

export function computeCurrency(
  orders: BillingOrderNode[],
  range: DateRange,
  truncated: boolean,
  historyClampedTo: HistoryClamp | null,
): CurrencyResponse {
  const buckets = new Map<
    string,
    {
      orders: number;
      presentment_minor: bigint;
      shop_minor: bigint;
      rate_sum: number;
      rate_count: number;
    }
  >();
  let shopCurrency = "USD";

  for (const o of orders) {
    shopCurrency = o.totalPriceSet.shopMoney.currencyCode || shopCurrency;
    const presentment = o.presentmentCurrencyCode ?? shopCurrency;
    const presentmentMinor = moneyToMinor(o.totalPriceSet.presentmentMoney.amount);
    const shopMinor = moneyToMinor(o.totalPriceSet.shopMoney.amount);
    const acc = buckets.get(presentment) ?? {
      orders: 0,
      presentment_minor: 0n,
      shop_minor: 0n,
      rate_sum: 0,
      rate_count: 0,
    };
    acc.orders += 1;
    acc.presentment_minor += presentmentMinor;
    acc.shop_minor += shopMinor;
    if (presentmentMinor > 0n) {
      const rate = Number(shopMinor) / Number(presentmentMinor);
      acc.rate_sum += rate;
      acc.rate_count += 1;
    }
    buckets.set(presentment, acc);
  }

  const rows: CurrencyRow[] = [];
  for (const [code, acc] of buckets) {
    const avgRate = acc.rate_count > 0 ? acc.rate_sum / acc.rate_count : 1;
    rows.push({
      currency: code,
      orders: acc.orders,
      revenue_presentment: minorToMoney(acc.presentment_minor, code),
      revenue_shop: minorToMoney(acc.shop_minor, shopCurrency),
      avg_rate: Number(avgRate.toFixed(6)),
    });
  }
  rows.sort((a, b) => b.orders - a.orders);

  return {
    range,
    rows,
    shop_currency: shopCurrency,
    truncated,
    history_clamped_to: historyClampedTo,
  };
}

// Exported for unit tests
export const _internal = { computeBillingLocation, computeCurrency };
