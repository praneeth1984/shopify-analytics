/**
 * F55 — Transaction Status Reports.
 *
 * Walks orders in the date range and projects each order's transactions[] into
 * three views:
 *   - all        — full transaction list (Pro)
 *   - failed     — only `status === FAILURE` transactions (Pro)
 *   - by_gateway — grouped summary across all transactions (Free + Pro)
 *
 * Free plan only sees `by_gateway` (the headline number); Pro unlocks the
 * full per-transaction lists.
 */

import type {
  DateRange,
  HistoryClamp,
  Plan,
  TransactionGatewayRow,
  TransactionResponse,
  TransactionRow,
  TransactionView,
} from "@fbc/shared";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";
import type { TransactionOrderNode } from "./queries.js";

function detectCurrency(orders: TransactionOrderNode[]): string {
  for (const o of orders) {
    for (const t of o.transactions) {
      const code = t.amountSet?.shopMoney?.currencyCode;
      if (code) return code;
    }
  }
  return "USD";
}

function nodeToRow(o: TransactionOrderNode, t: TransactionOrderNode["transactions"][number], currency: string): TransactionRow {
  const amountMinor = t.amountSet ? moneyToMinor(t.amountSet.shopMoney.amount) : 0n;
  return {
    transaction_id: t.id.split("/").pop() ?? t.id,
    order_id: o.id.split("/").pop() ?? o.id,
    order_name: o.name,
    gateway: t.gateway,
    amount: minorToMoney(amountMinor, currency),
    status: t.status,
    error_code: t.errorCode,
    processed_at: t.processedAt ?? "",
  };
}

export function computeTransactionReport(args: {
  orders: TransactionOrderNode[];
  view: TransactionView;
  plan: Plan;
  range: DateRange;
  truncated: boolean;
  historyClampedTo: HistoryClamp | null;
}): TransactionResponse {
  const { orders, view, plan, range, truncated, historyClampedTo } = args;
  const currency = detectCurrency(orders);
  const proOnly = view === "all" || view === "failed";

  if (view === "by_gateway") {
    const buckets = new Map<
      string,
      {
        count: number;
        failed: number;
        total_minor: bigint;
      }
    >();
    for (const o of orders) {
      for (const t of o.transactions) {
        // Only count SALE / CAPTURE money flows for headline numbers.
        if (t.kind && !["SALE", "CAPTURE", "AUTHORIZATION"].includes(t.kind)) continue;
        const gateway = t.gateway ?? "(unknown)";
        const acc = buckets.get(gateway) ?? {
          count: 0,
          failed: 0,
          total_minor: 0n,
        };
        acc.count += 1;
        if (t.status?.toUpperCase() === "FAILURE") acc.failed += 1;
        acc.total_minor += t.amountSet ? moneyToMinor(t.amountSet.shopMoney.amount) : 0n;
        buckets.set(gateway, acc);
      }
    }
    const rows: TransactionGatewayRow[] = Array.from(buckets.entries()).map(
      ([gateway, acc]) => {
        const success = acc.count - acc.failed;
        const successRate = acc.count > 0 ? success / acc.count : 0;
        const avg = acc.count > 0 ? acc.total_minor / BigInt(acc.count) : 0n;
        return {
          gateway,
          transaction_count: acc.count,
          failed_count: acc.failed,
          total_value: minorToMoney(acc.total_minor, currency),
          success_rate_pct: successRate,
          avg_value: minorToMoney(avg, currency),
        };
      },
    );
    rows.sort((a, b) => b.transaction_count - a.transaction_count);
    return {
      view: "by_gateway",
      range,
      rows,
      truncated,
      history_clamped_to: historyClampedTo,
    };
  }

  // all | failed — Pro-only
  if (plan === "free" && proOnly) {
    return {
      view,
      range,
      rows: [],
      truncated: false,
      history_clamped_to: historyClampedTo,
      pro_only: true,
    };
  }
  const rows: TransactionRow[] = [];
  for (const o of orders) {
    for (const t of o.transactions) {
      if (view === "failed" && t.status?.toUpperCase() !== "FAILURE") continue;
      rows.push(nodeToRow(o, t, currency));
    }
  }
  rows.sort((a, b) => (a.processed_at < b.processed_at ? 1 : -1));
  return {
    view,
    range,
    rows,
    truncated,
    history_clamped_to: historyClampedTo,
    pro_only: false,
  };
}

// Exported for unit tests
export const _internal = { computeTransactionReport, nodeToRow };
