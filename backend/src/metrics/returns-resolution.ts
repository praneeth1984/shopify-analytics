/**
 * R-RET-4: how returns resolved.
 *
 * Phase 1: every refund is bucketed as "cash_refund". Store-credit detection
 * requires Refund.transactions which does not exist on Shopify's GraphQL
 * Refund type — transactions live on Order.transactions. Deferred to Phase 1.5.
 *
 * exchange_detection is always "degraded" in Phase 1.
 */

import type { Money, ResolutionBucket, ResolutionRow } from "@fbc/shared";
import type { OrderNode } from "./queries.js";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";

type Tally = {
  count: number;
  valueMinor: bigint;
};

function detectCurrency(orders: OrderNode[]): string {
  for (const o of orders) {
    const code = o.currentTotalPriceSet.shopMoney.currencyCode;
    if (code) return code;
  }
  return "USD";
}

export type ReturnResolutionData = {
  resolutions: ResolutionRow[];
  exchange_detection: "enabled" | "degraded";
};

export function computeReturnResolution(orders: OrderNode[]): ReturnResolutionData {
  const buckets = new Map<ResolutionBucket, Tally>([
    ["cash_refund", { count: 0, valueMinor: 0n }],
    ["store_credit", { count: 0, valueMinor: 0n }],
    ["exchange", { count: 0, valueMinor: 0n }],
    ["other", { count: 0, valueMinor: 0n }],
  ]);

  const currency = detectCurrency(orders);

  for (const order of orders) {
    for (const refund of order.refunds) {
      const t = buckets.get("cash_refund")!;
      t.count += 1;
      t.valueMinor += moneyToMinor(refund.totalRefundedSet.shopMoney.amount);
    }
  }

  const totalCount = Array.from(buckets.values()).reduce((acc, t) => acc + t.count, 0);

  const ordered: ResolutionBucket[] = ["cash_refund", "store_credit", "exchange", "other"];
  const resolutions: ResolutionRow[] = ordered.map((bucket) => {
    const t = buckets.get(bucket)!;
    const value: Money = minorToMoney(t.valueMinor, currency);
    return {
      bucket,
      count: t.count,
      value,
      pct: totalCount === 0 ? 0 : t.count / totalCount,
    };
  });

  return { resolutions, exchange_detection: "degraded" };
}
