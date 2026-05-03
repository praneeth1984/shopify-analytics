/**
 * Fetches all product variants with their Shopify-stored unit cost
 * (Products > [variant] > "Cost per item" in the admin).
 *
 * Requires the read_inventory scope (already granted).
 */

export const VARIANT_COSTS_QUERY = /* GraphQL */ `
  query VariantCosts($first: Int!, $after: String) {
    productVariants(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        sku
        displayName
        price
        product {
          id
          title
        }
        inventoryItem {
          unitCost {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

export type VariantCostNode = {
  id: string;
  sku: string | null;
  displayName: string;
  price: string;
  product: { id: string; title: string };
  inventoryItem: {
    unitCost: { amount: string; currencyCode: string } | null;
  } | null;
};

export type VariantCostsResponse = {
  productVariants: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: VariantCostNode[];
  };
};
