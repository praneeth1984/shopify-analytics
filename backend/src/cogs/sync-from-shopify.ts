/**
 * Syncs COGS entries from Shopify's inventoryItem.unitCost into the
 * metafield store. Only variants that have a cost set in Shopify are imported;
 * variants with no cost are skipped.
 *
 * Free plan: capped at FREE_COGS_CAP entries. The sync takes the first N
 * variants (by Shopify's default ordering) up to the cap and marks the
 * response as `capped: true` when more were available.
 *
 * Merge semantics: existing manual overrides are preserved. Shopify costs only
 * overwrite an existing entry if the variant is not already in the store, i.e.
 * the import is "fill gaps, don't stomp overrides." Pass `overwrite: true` to
 * replace existing entries.
 */

import type { GraphQLClient } from "../shopify/graphql-client.js";
import type { CogsEntry, Plan } from "@fbc/shared";
import { PLAN_LIMITS } from "@fbc/shared";
import {
  VARIANT_COSTS_QUERY,
  type VariantCostNode,
  type VariantCostsResponse,
} from "../shopify/queries/inventory-costs.graphql.js";

const PAGE_SIZE = 250;
const MAX_PAGES = 10; // 2,500-variant budget

export type SyncResult = {
  synced: number;   // entries written into the store
  skipped: number;  // variants with no Shopify cost
  capped: boolean;  // Free plan cap was hit
};

function nodeToEntry(node: VariantCostNode): CogsEntry | null {
  const unitCost = node.inventoryItem?.unitCost;
  if (!unitCost || !unitCost.amount || Number(unitCost.amount) <= 0) return null;
  return {
    variantId: node.id.split("/").pop() ?? node.id,
    productId: node.product.id.split("/").pop() ?? node.product.id,
    title: node.displayName,
    sku: node.sku,
    cost: { amount: unitCost.amount, currency_code: unitCost.currencyCode },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Fetches all variants from Shopify that have a unit cost set, respects the
 * plan cap, and returns the list of CogsEntry items ready for bulk-upsert.
 */
export async function fetchShopifyVariantCosts(
  graphql: GraphQLClient,
  plan: Plan,
  overwrite: boolean,
  existingVariantIds: Set<string>,
): Promise<{ entries: CogsEntry[]; skipped: number; capped: boolean }> {
  const cap = PLAN_LIMITS[plan].cogsCap; // Infinity for Pro
  const entries: CogsEntry[] = [];
  let skipped = 0;
  let after: string | null = null;
  let pages = 0;
  let capped = false;

  outer: while (pages < MAX_PAGES) {
    const { data } = (await graphql<VariantCostsResponse>(VARIANT_COSTS_QUERY, {
      first: PAGE_SIZE,
      after,
    })) as { data: VariantCostsResponse };

    for (const node of data.productVariants.nodes) {
      const entry = nodeToEntry(node);
      if (!entry) {
        skipped++;
        continue;
      }

      // Skip if already in store and not overwriting.
      if (!overwrite && existingVariantIds.has(entry.variantId)) {
        continue;
      }

      entries.push(entry);

      if (entries.length >= cap) {
        capped = Number.isFinite(cap);
        break outer;
      }
    }

    pages++;
    if (!data.productVariants.pageInfo.hasNextPage) break;
    after = data.productVariants.pageInfo.endCursor;
    if (!after) break;
  }

  return { entries, skipped, capped };
}
