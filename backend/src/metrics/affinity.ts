import type { OrderNode } from "./queries.js";
import type { AffinityPair, AffinityResponse, DateRange, HistoryClamp } from "@fbc/shared";

const FREE_CAP = 20;
const MIN_CO_PURCHASES = 3;
const MAX_LINE_ITEMS_PER_ORDER = 50; // O(k²) guard

export function computeAffinity(
  orders: OrderNode[],
  plan: string,
  range: DateRange,
  truncated: boolean,
  historyClampedTo: HistoryClamp | null,
): AffinityResponse {
  // productOrderCount[productId] = number of orders containing that product
  const productOrderCount = new Map<string, number>();
  // co[key] = count; key = sorted "a|b" string
  const coPurchaseCount = new Map<string, number>();
  // titles
  const titles = new Map<string, string>();

  for (const order of orders) {
    const items = order.lineItems.edges
      .slice(0, MAX_LINE_ITEMS_PER_ORDER)
      .map((e) => e.node)
      .filter((n) => n.product?.id);

    // Deduplicate products within the same order (variants of same product)
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

  const pairs: AffinityPair[] = [];
  for (const [key, count] of coPurchaseCount) {
    if (count < MIN_CO_PURCHASES) continue;
    const [aId, bId] = key.split("|") as [string, string];
    const aOrders = productOrderCount.get(aId) ?? 1;
    pairs.push({
      product_a_id: aId,
      product_a_title: titles.get(aId) ?? aId,
      product_b_id: bId,
      product_b_title: titles.get(bId) ?? bId,
      co_purchase_count: count,
      pct_of_a_orders: count / aOrders,
    });
  }

  pairs.sort((a, b) => b.co_purchase_count - a.co_purchase_count);

  const total = pairs.length;
  const isFree = plan === "free";
  const cappedPairs = isFree ? pairs.slice(0, FREE_CAP) : pairs;

  return {
    range,
    pairs: cappedPairs,
    truncated,
    history_clamped_to: historyClampedTo,
    total_count: total,
    plan_capped_to: isFree ? FREE_CAP : null,
  };
}
