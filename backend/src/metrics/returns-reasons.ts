/**
 * R-RET-3: returns by reason.
 *
 * Walks `order.returns[].returnLineItems[]` and aggregates by reason code.
 * Free plan returns the top 5 reasons (by units desc); Pro returns all
 * reasons + a per-variant breakdown so merchants can drill into which
 * variants drive a given reason.
 *
 * Reasons with `null` / unknown codes bucket into "UNKNOWN" labelled
 * "Unspecified" via the shared humaniser.
 */

import type {
  Plan,
  ReturnReasonCode,
  ReturnReasonRow,
  ReturnReasonVariantBreakdown,
} from "@fbc/shared";
import type { OrderNode } from "./queries.js";
import { humanizeReturnReason } from "./returns-shared.js";

const FREE_TOP_LIMIT = 5;

const KNOWN_CODES: ReadonlySet<string> = new Set<ReturnReasonCode>([
  "COLOR",
  "DEFECTIVE",
  "NOT_AS_DESCRIBED",
  "OTHER",
  "SIZE_TOO_LARGE",
  "SIZE_TOO_SMALL",
  "STYLE",
  "UNKNOWN",
  "UNWANTED",
  "WRONG_ITEM",
]);

function normaliseCode(raw: string | null | undefined): ReturnReasonCode | "UNKNOWN" {
  if (!raw) return "UNKNOWN";
  return KNOWN_CODES.has(raw) ? (raw as ReturnReasonCode) : "UNKNOWN";
}

type ReasonTally = {
  count: number;
  units: number;
  variants: Map<string, ReturnReasonVariantBreakdown>;
};

export type ReturnReasonsData = {
  reasons: ReturnReasonRow[];
  total_returned_units: number;
};

export function computeReturnReasons(orders: OrderNode[], plan: Plan): ReturnReasonsData {
  const byReason = new Map<ReturnReasonCode | "UNKNOWN", ReasonTally>();
  let total_returned_units = 0;

  for (const order of orders) {
    for (const retEdge of order.returns.edges) {
      const ret = retEdge.node;
      for (const rliEdge of ret.returnLineItems.edges) {
        const rli = rliEdge.node;
        const code = normaliseCode(rli.returnReason);
        let tally = byReason.get(code);
        if (!tally) {
          tally = { count: 0, units: 0, variants: new Map() };
          byReason.set(code, tally);
        }
        tally.count += 1;
        tally.units += rli.quantity;
        total_returned_units += rli.quantity;

        const li = rli.fulfillmentLineItem?.lineItem;
        const variantId = li?.variant?.id;
        if (variantId) {
          const productTitle = li?.product?.title ?? "Deleted product";
          const existing = tally.variants.get(variantId);
          if (existing) {
            existing.units += rli.quantity;
          } else {
            tally.variants.set(variantId, {
              variant_id: variantId,
              product_title: productTitle,
              units: rli.quantity,
            });
          }
        }
      }
    }
  }

  const rows: ReturnReasonRow[] = [];
  for (const [code, tally] of byReason.entries()) {
    const pct_of_returns =
      total_returned_units === 0 ? 0 : tally.units / total_returned_units;
    const row: ReturnReasonRow = {
      code,
      label: humanizeReturnReason(code === "UNKNOWN" ? null : code),
      count: tally.count,
      units: tally.units,
      pct_of_returns,
    };
    if (plan === "pro" || plan === "insights") {
      const variants = Array.from(tally.variants.values()).sort(
        (a, b) => b.units - a.units,
      );
      row.variants = variants;
    }
    rows.push(row);
  }

  rows.sort((a, b) => b.units - a.units);

  const limited = plan === "free" ? rows.slice(0, FREE_TOP_LIMIT) : rows;
  return { reasons: limited, total_returned_units };
}
