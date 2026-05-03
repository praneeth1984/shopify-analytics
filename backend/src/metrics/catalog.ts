/**
 * F51 — Product Catalog Reports.
 *
 * Three views:
 *   - never_sold — products with zero units sold in the period
 *   - all        — full product list with sales overlay (units sold + revenue)
 *   - by_tag     — group products by their tags, with per-tag aggregate sales
 *
 * Free: top 50 rows. Pro: full list.
 */

import type {
  CatalogProductRow,
  CatalogResponse,
  CatalogTagRow,
  CatalogView,
  DateRange,
  HistoryClamp,
  Money,
  Plan,
} from "@fbc/shared";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";
import type { CatalogProductNode, OrderNode } from "./queries.js";

const FREE_CAP = 50;

type ProductSales = {
  units_sold: number;
  refunded_units: number;
  revenue_minor: bigint;
};

function buildSalesIndex(orders: OrderNode[]): Map<string, ProductSales> {
  const idx = new Map<string, ProductSales>();
  for (const o of orders) {
    for (const edge of o.lineItems.edges) {
      const li = edge.node;
      if (!li.product) continue;
      const acc = idx.get(li.product.id) ?? {
        units_sold: 0,
        refunded_units: 0,
        revenue_minor: 0n,
      };
      acc.units_sold += li.quantity;
      acc.revenue_minor += moneyToMinor(li.originalTotalSet.shopMoney.amount);
      idx.set(li.product.id, acc);
    }
    for (const refund of o.refunds) {
      for (const rliEdge of refund.refundLineItems.edges) {
        const rli = rliEdge.node;
        const pid = rli.lineItem?.product?.id;
        if (!pid) continue;
        const acc = idx.get(pid);
        if (acc) acc.refunded_units += rli.quantity;
      }
    }
  }
  return idx;
}

function detectCurrency(orders: OrderNode[], products: CatalogProductNode[]): string {
  for (const o of orders) {
    const code = o.totalPriceSet.shopMoney.currencyCode;
    if (code) return code;
  }
  for (const p of products) {
    const code = p.priceRangeV2?.minVariantPrice.currencyCode;
    if (code) return code;
  }
  return "USD";
}

function toProductRow(
  p: CatalogProductNode,
  sales: ProductSales | undefined,
  currency: string,
): CatalogProductRow {
  const units = sales?.units_sold ?? 0;
  const refunded = sales?.refunded_units ?? 0;
  const revenueMinor = sales?.revenue_minor ?? 0n;
  const returnRate = units > 0 ? refunded / units : 0;
  const minPrice: Money | null = p.priceRangeV2
    ? minorToMoney(moneyToMinor(p.priceRangeV2.minVariantPrice.amount), currency)
    : null;
  const maxPrice: Money | null = p.priceRangeV2
    ? minorToMoney(moneyToMinor(p.priceRangeV2.maxVariantPrice.amount), currency)
    : null;
  return {
    product_id: p.id,
    title: p.title,
    vendor: p.vendor,
    product_type: p.productType,
    tags: p.tags,
    price_min: minPrice,
    price_max: maxPrice,
    inventory_total: p.totalInventory,
    created_at: p.createdAt,
    units_sold: units,
    revenue: minorToMoney(revenueMinor, currency),
    return_rate_pct: returnRate,
  };
}

export function computeCatalog(args: {
  view: CatalogView;
  products: CatalogProductNode[];
  orders: OrderNode[];
  plan: Plan;
  range: DateRange;
  truncated: boolean;
  historyClampedTo: HistoryClamp | null;
}): CatalogResponse {
  const { view, products, orders, plan, range, truncated, historyClampedTo } = args;
  const currency = detectCurrency(orders, products);
  const salesIdx = buildSalesIndex(orders);
  const planCap = plan === "free" ? FREE_CAP : null;

  if (view === "by_tag") {
    const byTag = new Map<string, { count: number; units: number; revenue_minor: bigint }>();
    for (const p of products) {
      const sales = salesIdx.get(p.id);
      for (const tag of p.tags) {
        const acc = byTag.get(tag) ?? { count: 0, units: 0, revenue_minor: 0n };
        acc.count += 1;
        acc.units += sales?.units_sold ?? 0;
        acc.revenue_minor += sales?.revenue_minor ?? 0n;
        byTag.set(tag, acc);
      }
    }
    const allRows: CatalogTagRow[] = Array.from(byTag.entries()).map(([tag, acc]) => ({
      tag,
      product_count: acc.count,
      units_sold: acc.units,
      revenue: minorToMoney(acc.revenue_minor, currency),
    }));
    allRows.sort((a, b) => {
      const aRev = moneyToMinor(a.revenue.amount);
      const bRev = moneyToMinor(b.revenue.amount);
      return bRev > aRev ? 1 : bRev < aRev ? -1 : 0;
    });
    const totalCount = allRows.length;
    const rows = planCap !== null ? allRows.slice(0, planCap) : allRows;
    return {
      view: "by_tag",
      range,
      rows,
      truncated,
      history_clamped_to: historyClampedTo,
      total_count: totalCount,
      plan_capped_to: planCap,
    };
  }

  // never_sold / all — product-level rows
  const allProductRows: CatalogProductRow[] = [];
  for (const p of products) {
    const sales = salesIdx.get(p.id);
    if (view === "never_sold" && (sales?.units_sold ?? 0) > 0) continue;
    allProductRows.push(toProductRow(p, sales, currency));
  }
  // all view: sort by revenue desc; never_sold view: sort by created_at desc
  if (view === "all") {
    allProductRows.sort((a, b) => {
      const aRev = moneyToMinor(a.revenue.amount);
      const bRev = moneyToMinor(b.revenue.amount);
      return bRev > aRev ? 1 : bRev < aRev ? -1 : 0;
    });
  } else {
    allProductRows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
  const totalCount = allProductRows.length;
  const rows = planCap !== null ? allProductRows.slice(0, planCap) : allProductRows;

  return {
    view,
    range,
    rows,
    truncated,
    history_clamped_to: historyClampedTo,
    total_count: totalCount,
    plan_capped_to: planCap,
  };
}

// Exported for unit tests
export const _internal = { buildSalesIndex, toProductRow };
