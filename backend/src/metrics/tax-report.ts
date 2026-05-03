import type { D1Database } from "@cloudflare/workers-types";
import { forShop } from "../db/client.js";
import type { Plan } from "@fbc/shared";

export const TAX_DISCLAIMER =
  "Tax collected as recorded by Shopify. Consult your accountant for official filing.";

export type TaxMonthRow = {
  month: string;
  totalTaxMinor: number;
  currency: string;
  orderCount: number;
  jurisdictions: number;
};

export type TaxGeoRow = {
  countryCode: string;
  provinceCode: string | null;
  totalTaxMinor: number;
  currency: string;
  orderCount: number;
};

export type TaxReport = {
  tab: "monthly" | "geo";
  disclaimer: string;
  monthly?: TaxMonthRow[];
  geo?: TaxGeoRow[];
  plan: Plan;
  historyClampedTo: string | null;
  hasData: boolean;
};

export async function computeTaxReport(
  db: D1Database,
  shop: string,
  tab: "monthly" | "geo",
  from: string,
  to: string,
  plan: Plan,
): Promise<TaxReport> {
  const shopDb = forShop(db, shop);

  const freeCutoff = plan === "free"
    ? new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;
  const effectiveFrom = freeCutoff && freeCutoff > from ? freeCutoff : from;
  const historyClampedTo = effectiveFrom !== from ? effectiveFrom : null;

  if (tab === "monthly") {
    const rows = await shopDb.all<{ month: string; total_tax: number; currency: string; orders: number; jurisdictions: number }>(
      `SELECT strftime('%Y-%m', order_date) AS month,
              SUM(amount_minor) AS total_tax,
              MAX(currency) AS currency,
              COUNT(DISTINCT order_id) AS orders,
              COUNT(DISTINCT CASE WHEN tax_title != '__no_tax__' THEN tax_title END) AS jurisdictions
       FROM order_tax
       WHERE shop_domain=? AND order_date>=? AND order_date<? AND cancelled=0
       GROUP BY month
       ORDER BY month DESC`,
      effectiveFrom, to,
    );
    return {
      tab: "monthly",
      disclaimer: TAX_DISCLAIMER,
      monthly: rows.map((r) => ({
        month: r.month,
        totalTaxMinor: r.total_tax ?? 0,
        currency: r.currency ?? "USD",
        orderCount: r.orders ?? 0,
        jurisdictions: r.jurisdictions ?? 0,
      })),
      plan,
      historyClampedTo,
      hasData: rows.length > 0,
    };
  }

  // geo tab
  const rows = await shopDb.all<{ country_code: string | null; province_code: string | null; total_tax: number; currency: string; orders: number }>(
    `SELECT country_code,
            province_code,
            SUM(amount_minor) AS total_tax,
            MAX(currency) AS currency,
            COUNT(DISTINCT order_id) AS orders
     FROM order_tax
     WHERE shop_domain=? AND order_date>=? AND order_date<? AND cancelled=0 AND tax_title != '__no_tax__'
     GROUP BY country_code, province_code
     ORDER BY total_tax DESC`,
    effectiveFrom, to,
  );
  return {
    tab: "geo",
    disclaimer: TAX_DISCLAIMER,
    geo: rows.map((r) => ({
      countryCode: r.country_code ?? "Unknown",
      provinceCode: r.province_code,
      totalTaxMinor: r.total_tax ?? 0,
      currency: r.currency ?? "USD",
      orderCount: r.orders ?? 0,
    })),
    plan,
    historyClampedTo,
    hasData: rows.length > 0,
  };
}
