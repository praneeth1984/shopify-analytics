import type { D1Database } from "@cloudflare/workers-types";
import { forShop } from "../db/client.js";
import type { Plan } from "@fbc/shared";

export type CollectionRow = {
  collectionId: string;
  collectionTitle: string;
  orders: number;
  revenueMinor: number;
  currency: string;
  units: number;
  aovMinor: number;
  deltaRevenuePct: number | null;
};

export type CollectionProductRow = {
  productId: string;
  revenueMinor: number;
  currency: string;
  units: number;
};

export type CollectionReport = {
  tab: "sales" | "best-selling" | "products";
  rows: CollectionRow[];
  productRows?: CollectionProductRow[];
  selectedCollectionId?: string;
  plan: Plan;
  historyClampedTo: string | null;
  hasData: boolean;
};

export async function computeCollectionReport(
  db: D1Database,
  shop: string,
  tab: "sales" | "best-selling" | "products",
  from: string,
  to: string,
  plan: Plan,
  collectionId?: string,
): Promise<CollectionReport> {
  const shopDb = forShop(db, shop);
  const freeDays = 90;
  const freeCutoff = plan === "free"
    ? new Date(Date.now() - freeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;
  const effectiveFrom = freeCutoff && freeCutoff > from ? freeCutoff : from;
  const historyClampedTo = effectiveFrom !== from ? effectiveFrom : null;
  const limit = plan === "free" ? "LIMIT 10" : "";

  if (tab === "products" && collectionId) {
    const rows = await shopDb.all<{ product_id: string; revenue: number; currency: string; units: number }>(
      `SELECT op.product_id,
              SUM(op.revenue_minor) AS revenue,
              MAX(op.currency) AS currency,
              SUM(op.quantity) AS units
       FROM order_product op
       JOIN product_collection pc ON pc.shop_domain=op.shop_domain AND pc.product_id=op.product_id
       WHERE op.shop_domain=? AND pc.collection_id=? AND op.order_date>=? AND op.order_date<? AND op.cancelled=0
       GROUP BY op.product_id
       ORDER BY revenue DESC`,
      collectionId, effectiveFrom, to,
    );
    return {
      tab: "products",
      rows: [],
      productRows: rows.map((r) => ({
        productId: r.product_id,
        revenueMinor: r.revenue ?? 0,
        currency: r.currency ?? "USD",
        units: r.units ?? 0,
      })),
      selectedCollectionId: collectionId,
      plan,
      historyClampedTo,
      hasData: rows.length > 0,
    };
  }

  const rows = await shopDb.all<{
    collection_id: string; collection_title: string;
    orders: number; revenue: number; currency: string; units: number;
  }>(
    `SELECT pc.collection_id,
            MAX(pc.collection_title) AS collection_title,
            COUNT(DISTINCT op.order_id) AS orders,
            SUM(op.revenue_minor) AS revenue,
            MAX(op.currency) AS currency,
            SUM(op.quantity) AS units
     FROM order_product op
     JOIN product_collection pc ON pc.shop_domain=op.shop_domain AND pc.product_id=op.product_id
     WHERE op.shop_domain=? AND op.order_date>=? AND op.order_date<? AND op.cancelled=0
     GROUP BY pc.collection_id
     ORDER BY revenue DESC ${limit}`,
    effectiveFrom, to,
  );

  const collectionRows: CollectionRow[] = rows.map((r) => ({
    collectionId: r.collection_id,
    collectionTitle: r.collection_title,
    orders: r.orders ?? 0,
    revenueMinor: r.revenue ?? 0,
    currency: r.currency ?? "USD",
    units: r.units ?? 0,
    aovMinor: r.orders ? Math.round((r.revenue ?? 0) / r.orders) : 0,
    deltaRevenuePct: null, // period-over-period comparison is a Pro enhancement
  }));

  return {
    tab,
    rows: collectionRows,
    plan,
    historyClampedTo,
    hasData: collectionRows.length > 0,
  };
}
