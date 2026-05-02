import type { OrderNode } from "./queries.js";
import type { BundleInsightsResponse, BundlePair, DateRange, HistoryClamp } from "@fbc/shared";

const FREE_CAP = 20;
const MIN_CO_PURCHASES = 3;
const BUNDLE_PCT_THRESHOLD = 0.05; // pair appears in ≥5% of either product's orders
const MAX_LINE_ITEMS_PER_ORDER = 50;

export function computeBundles(
  orders: OrderNode[],
  plan: string,
  range: DateRange,
  truncated: boolean,
  historyClampedTo: HistoryClamp | null,
): BundleInsightsResponse {
  const productOrderCount = new Map<string, number>();
  const coPurchaseCount = new Map<string, number>();
  const titles = new Map<string, string>();

  for (const order of orders) {
    const items = order.lineItems.edges
      .slice(0, MAX_LINE_ITEMS_PER_ORDER)
      .map((e) => e.node)
      .filter((n) => n.product?.id);

    const productIds = [...new Set(items.map((n) => n.product!.id))];

    for (const pid of productIds) {
      productOrderCount.set(pid, (productOrderCount.get(pid) ?? 0) + 1);
      const item = items.find((n) => n.product?.id === pid);
      if (item?.product?.title) titles.set(pid, item.product.title);
    }

    for (let i = 0; i < productIds.length; i++) {
      for (let j = i + 1; j < productIds.length; j++) {
        const a = productIds[i]!;
        const b = productIds[j]!;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        coPurchaseCount.set(key, (coPurchaseCount.get(key) ?? 0) + 1);
      }
    }
  }

  const bundles: BundlePair[] = [];
  for (const [key, count] of coPurchaseCount) {
    if (count < MIN_CO_PURCHASES) continue;
    const [aId, bId] = key.split("|") as [string, string];
    const aOrders = productOrderCount.get(aId) ?? 1;
    const bOrders = productOrderCount.get(bId) ?? 1;
    // Use the smaller denominator (more conservative threshold)
    const pctOfEither = count / Math.min(aOrders, bOrders);
    if (pctOfEither < BUNDLE_PCT_THRESHOLD) continue;
    bundles.push({
      product_a_id: aId,
      product_a_title: titles.get(aId) ?? aId,
      product_b_id: bId,
      product_b_title: titles.get(bId) ?? bId,
      co_purchase_count: count,
      pct_of_either_orders: pctOfEither,
    });
  }

  bundles.sort((a, b) => b.pct_of_either_orders - a.pct_of_either_orders);

  const total = bundles.length;
  const isFree = plan === "free";
  const capped = isFree ? bundles.slice(0, FREE_CAP) : bundles;

  return {
    range,
    bundles: capped,
    truncated,
    history_clamped_to: historyClampedTo,
    total_count: total,
    plan_capped_to: isFree ? FREE_CAP : null,
  };
}
