import type { D1Database } from "@cloudflare/workers-types";
import { forShop } from "../db/client.js";
import { parseUTM } from "../lib/utm-parse.js";

export type SyncOrder = {
  id: string;
  createdAt: string;
  cancelledAt: string | null;
  landingPageUrl?: string | null;
  referringSite?: string | null;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  taxLines: Array<{
    title: string;
    rate: number;
    priceSet: { shopMoney: { amount: string; currencyCode: string } };
  }>;
  shippingAddress?: { countryCode?: string; province?: string } | null;
  lineItems: {
    edges: Array<{
      node: {
        product: { id: string } | null;
        variant: { id: string } | null;
        quantity: number;
        originalTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
      };
    }>;
  };
};

export async function upsertOrderToD1(db: D1Database, shop: string, order: SyncOrder): Promise<void> {
  const shopDb = forShop(db, shop);
  const orderDate = order.createdAt.slice(0, 10);
  const cancelled = order.cancelledAt ? 1 : 0;
  const currency = order.totalPriceSet.shopMoney.currencyCode;

  // UTM — one row per order
  const utm = parseUTM(order.landingPageUrl ?? null, order.referringSite ?? null);
  const revMinor = Math.round(parseFloat(order.totalPriceSet.shopMoney.amount) * 100);
  await shopDb.run(
    `INSERT OR REPLACE INTO order_utm
       (shop_domain,order_id,utm_source,utm_medium,utm_campaign,referrer,channel,order_date,revenue_minor,currency)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    order.id, utm.utmSource, utm.utmMedium, utm.utmCampaign, utm.referrer, utm.channel,
    orderDate, revMinor, currency,
  );

  // Tax lines — delete first so updates don't accumulate stale rows
  await shopDb.run(`DELETE FROM order_tax WHERE shop_domain=? AND order_id=?`, order.id);
  if (order.taxLines.length === 0) {
    await db.prepare(
      `INSERT OR REPLACE INTO order_tax
         (shop_domain,order_id,tax_title,rate,amount_minor,currency,country_code,province_code,order_date,cancelled)
       VALUES(?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      shop, order.id, "__no_tax__", 0, 0, currency,
      order.shippingAddress?.countryCode ?? null, null, orderDate, cancelled,
    ).run();
  } else {
    for (const tl of order.taxLines) {
      const amtMinor = Math.round(parseFloat(tl.priceSet.shopMoney.amount) * 100);
      await db.prepare(
        `INSERT OR REPLACE INTO order_tax
           (shop_domain,order_id,tax_title,rate,amount_minor,currency,country_code,province_code,order_date,cancelled)
         VALUES(?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        shop, order.id, tl.title, tl.rate, amtMinor, tl.priceSet.shopMoney.currencyCode,
        order.shippingAddress?.countryCode ?? null,
        order.shippingAddress?.province ?? null,
        orderDate, cancelled,
      ).run();
    }
  }

  // Line items → order_product (delete then re-insert)
  await shopDb.run(`DELETE FROM order_product WHERE shop_domain=? AND order_id=?`, order.id);
  for (const edge of order.lineItems.edges) {
    const li = edge.node;
    if (!li.product?.id || !li.variant?.id) continue;
    const liMinor = Math.round(parseFloat(li.originalTotalPriceSet.shopMoney.amount) * 100);
    await db.prepare(
      `INSERT OR REPLACE INTO order_product
         (shop_domain,order_id,product_id,variant_id,quantity,revenue_minor,currency,order_date,cancelled)
       VALUES(?,?,?,?,?,?,?,?,?)`
    ).bind(
      shop, order.id, li.product.id, li.variant.id, li.quantity,
      liMinor, li.originalTotalPriceSet.shopMoney.currencyCode,
      orderDate, cancelled,
    ).run();
  }
}

export async function deleteOrderFromD1(db: D1Database, shop: string, orderId: string): Promise<void> {
  const shopDb = forShop(db, shop);
  await shopDb.run(`DELETE FROM order_tax     WHERE shop_domain=? AND order_id=?`, orderId);
  await shopDb.run(`DELETE FROM order_utm     WHERE shop_domain=? AND order_id=?`, orderId);
  await shopDb.run(`DELETE FROM order_product WHERE shop_domain=? AND order_id=?`, orderId);
}

export async function deleteAllForShop(db: D1Database, shop: string): Promise<void> {
  const shopDb = forShop(db, shop);
  await shopDb.run(`DELETE FROM order_tax          WHERE shop_domain=?`);
  await shopDb.run(`DELETE FROM order_utm          WHERE shop_domain=?`);
  await shopDb.run(`DELETE FROM order_product      WHERE shop_domain=?`);
  await shopDb.run(`DELETE FROM product_collection WHERE shop_domain=?`);
  await shopDb.run(`DELETE FROM backfill_state     WHERE shop_domain=?`);
}
