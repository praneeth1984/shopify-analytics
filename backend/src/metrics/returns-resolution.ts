/**
 * R-RET-4: how returns resolved.
 *
 * Phase 1 buckets refunds into:
 *   - cash_refund   — any non-gift-card refund transaction
 *   - store_credit  — gift-card-gateway refund transaction
 *   - exchange      — not detected in Phase 1 (left at zero)
 *   - other         — refund recorded with no transactions (rare; manual/edge cases)
 *
 * Each refund counts once per transaction it carries (an order may have
 * multiple refunds split across multiple gateways). Refunds without any
 * transactions fall into "other" so the counts still reconcile with the
 * UI's "How returns resolved" total.
 *
 * `exchange_detection` is "degraded" until Phase 1.5 wires up the 48 h
 * order-replacement heuristic.
 */

import type { Money, ResolutionBucket, ResolutionRow } from "@fbc/shared";
import type { OrderNode, RefundTransactionNode } from "./queries.js";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";

type Tally = {
  count: number;
  valueMinor: bigint;
};

function emptyTally(): Tally {
  return { count: 0, valueMinor: 0n };
}

function bucketForTransaction(tx: RefundTransactionNode): ResolutionBucket {
  if ((tx.gateway ?? "").toLowerCase().includes("gift_card")) return "store_credit";
  return "cash_refund";
}

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
  const buckets = new Map<ResolutionBucket, Tally>();
  buckets.set("cash_refund", emptyTally());
  buckets.set("store_credit", emptyTally());
  buckets.set("exchange", emptyTally());
  buckets.set("other", emptyTally());

  const currency = detectCurrency(orders);

  for (const order of orders) {
    if (order.refunds.length === 0) continue;
    for (const refund of order.refunds) {
      if (refund.transactions.edges.length === 0) {
        const t = buckets.get("other")!;
        t.count += 1;
        t.valueMinor += moneyToMinor(refund.totalRefundedSet.shopMoney.amount);
        continue;
      }
      for (const txEdge of refund.transactions.edges) {
        const tx = txEdge.node;
        if ((tx.kind ?? "").toUpperCase() !== "REFUND") continue;
        const bucket = bucketForTransaction(tx);
        const t = buckets.get(bucket)!;
        t.count += 1;
        t.valueMinor += moneyToMinor(tx.amountSet.shopMoney.amount);
      }
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
