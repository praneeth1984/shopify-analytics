/**
 * GraphQL queries for variant search (used by the COGS settings UI to
 * autocomplete which variants to attach a cost to).
 */

export const PRODUCT_VARIANT_SEARCH = /* GraphQL */ `
  query ProductVariantSearch($query: String!, $first: Int!, $after: String) {
    productVariants(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        sku
        title
        displayName
        price
        image {
          url
          altText
        }
        product {
          id
          title
          featuredImage {
            url
            altText
          }
        }
      }
    }
  }
`;

export type VariantSearchNode = {
  id: string;
  sku: string | null;
  title: string;
  displayName: string;
  price: string;
  image: { url: string; altText: string | null } | null;
  product: {
    id: string;
    title: string;
    featuredImage: { url: string; altText: string | null } | null;
  };
};

export type VariantSearchResult = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: VariantSearchNode[];
};
