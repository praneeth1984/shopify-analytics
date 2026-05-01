/**
 * R-RET-1: returns by product.
 *
 * For each order:
 *   - lineItems contribute ordered_units per product (and per variant on Pro).
 *   - returns[].returnLineItems[] contribute returned_units.
 *   - refunds[].refundLineItems[] contribute refunded_value at the line item's
 *     unit price, in BigInt minor units.
 *
 * Filters products with ordered_units < 5 (low-volume noise floor) and reports
 * the count separately so the UI can explain why some products were hidden.
 *
 * Sort: return_rate desc, tiebreak returned_units desc. Top 10 returned.
 *
 * Pro plan additionally returns a per-variant breakdown on each product.
 *
 * No second Admin API call: all inputs come from the shared orders fetch.
 */

import type { Money, Plan, ReturnedProduct, ReturnedVariant } from "@fbc/shared";
import type { OrderNode } from "./queries.js";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";

const LOW_VOLUME_THRESHOLD = 5;
const TOP_LIMIT = 10;
const DELETED_PRODUCT_TITLE = "Deleted product";
const FALLBACK_PRODUCT_KEY = "__deleted__";

type VariantTally = {
  variantId: string;
  sku: string | null;
  orderedUnits: number;
  returnedUnits: number;
};

type ProductTally = {
  productId: string;
  title: string;
  orderedUnits: number;
  returnedUnits: number;
  refundedValueMinor: bigint;
  variants: Map<string, VariantTally>;
};

function getOrCreate(
  byProduct: Map<string, ProductTally>,
  productId: string,
  title: string,
): ProductTally {
  let p = byProduct.get(productId);
  if (!p) {
    p = {
      productId,
      title,
      orderedUnits: 0,
      returnedUnits: 0,
      refundedValueMinor: 0n,
      variants: new Map(),
    };
    byProduct.set(productId, p);
  }
  return p;
}

function ensureVariant(p: ProductTally, variantId: string, sku: string | null): VariantTally {
  let v = p.variants.get(variantId);
  if (!v) {
    v = { variantId, sku, orderedUnits: 0, returnedUnits: 0 };
    p.variants.set(variantId, v);
  }
  return v;
}

function detectCurrency(orders: OrderNode[]): string {
  for (const o of orders) {
    const code = o.currentTotalPriceSet.shopMoney.currencyCode;
    if (code) return code;
  }
  return "USD";
}

export type ReturnsByProductData = {
  products: ReturnedProduct[];
  excluded_low_volume_count: number;
};

export function computeReturnsByProduct(orders: OrderNode[], plan: Plan): ReturnsByProductData {
  const byProduct = new Map<string, ProductTally>();
  const currency = detectCurrency(orders);

  for (const order of orders) {
    // Ordered units come from the line items themselves.
    for (const edge of order.lineItems.edges) {
      const li = edge.node;
      const productId = li.product?.id ?? FALLBACK_PRODUCT_KEY;
      const title = li.product?.title ?? DELETED_PRODUCT_TITLE;
      const tally = getOrCreate(byProduct, productId, title);
      tally.orderedUnits += li.quantity;
      if (li.variant?.id) {
        const v = ensureVariant(tally, li.variant.id, li.variant.sku);
        v.orderedUnits += li.quantity;
      }
    }

    // Returned units and refunded value both come from refunds[].refundLineItems[].
    // fulfillmentLineItem on ReturnLineItem is not available in the API;
    // refundLineItems carry the same product info and are more reliable.
    const liById = new Map<string, { product: { id: string; title: string } | null; unitPriceMinor: bigint; variantId: string | null; sku: string | null }>();
    for (const edge of order.lineItems.edges) {
      liById.set(edge.node.id, {
        product: edge.node.product,
        unitPriceMinor: moneyToMinor(edge.node.discountedUnitPriceSet.shopMoney.amount),
        variantId: edge.node.variant?.id ?? null,
        sku: edge.node.variant?.sku ?? null,
      });
    }
    for (const refund of order.refunds) {
      for (const rliEdge of refund.refundLineItems.edges) {
        const rli = rliEdge.node;
        const liId = rli.lineItem?.id;
        const matched = liId ? liById.get(liId) : undefined;
        const productId = rli.lineItem?.product?.id ?? matched?.product?.id ?? FALLBACK_PRODUCT_KEY;
        const title = rli.lineItem?.product?.title ?? matched?.product?.title ?? DELETED_PRODUCT_TITLE;
        const tally = getOrCreate(byProduct, productId, title);
        tally.returnedUnits += rli.quantity;
        tally.refundedValueMinor += (matched?.unitPriceMinor ?? 0n) * BigInt(rli.quantity);
        const variantId = rli.lineItem?.variant?.id ?? matched?.variantId ?? null;
        if (variantId) {
          const v = ensureVariant(tally, variantId, matched?.sku ?? null);
          v.returnedUnits += rli.quantity;
        }
      }
    }
  }

  let excluded_low_volume_count = 0;
  const ranked: ReturnedProduct[] = [];
  for (const p of byProduct.values()) {
    if (p.orderedUnits < LOW_VOLUME_THRESHOLD) {
      excluded_low_volume_count += 1;
      continue;
    }
    const return_rate =
      p.orderedUnits === 0 ? 0 : p.returnedUnits / p.orderedUnits;
    const refunded_value: Money = minorToMoney(p.refundedValueMinor, currency);
    const product: ReturnedProduct = {
      product_id: p.productId,
      title: p.title,
      ordered_units: p.orderedUnits,
      returned_units: p.returnedUnits,
      return_rate,
      refunded_value,
    };
    if (plan === "pro" || plan === "insights") {
      const variants: ReturnedVariant[] = [];
      for (const v of p.variants.values()) {
        if (v.orderedUnits === 0 && v.returnedUnits === 0) continue;
        variants.push({
          variant_id: v.variantId,
          sku: v.sku,
          ordered_units: v.orderedUnits,
          returned_units: v.returnedUnits,
          return_rate: v.orderedUnits === 0 ? 0 : v.returnedUnits / v.orderedUnits,
        });
      }
      variants.sort((a, b) => b.returned_units - a.returned_units);
      product.variants = variants;
    }
    ranked.push(product);
  }

  ranked.sort((a, b) => {
    if (b.return_rate !== a.return_rate) return b.return_rate - a.return_rate;
    return b.returned_units - a.returned_units;
  });

  return {
    products: ranked.slice(0, TOP_LIMIT),
    excluded_low_volume_count,
  };
}
