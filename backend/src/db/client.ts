/**
 * Shop-scoped D1 query helper.
 *
 * Convention: every SQL string passed to these methods must have
 * `shop_domain = ?` as the FIRST positional param. The helper binds the
 * provided `shop` to that first `?`, then spreads the remaining `...params`.
 *
 * For cross-shop / admin queries (public listings, rate-limit windows)
 * call `db.prepare(...)` directly instead.
 */

import type { D1Database } from "@cloudflare/workers-types";

export type ShopDB = ReturnType<typeof forShop>;

export function forShop(db: D1Database, shop: string) {
  return {
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      const result = await db.prepare(sql).bind(shop, ...params).all<T>();
      return result.results;
    },
    async first<T>(sql: string, ...params: unknown[]): Promise<T | null> {
      return db.prepare(sql).bind(shop, ...params).first<T>();
    },
    async run(sql: string, ...params: unknown[]): Promise<void> {
      await db.prepare(sql).bind(shop, ...params).run();
    },
  };
}
