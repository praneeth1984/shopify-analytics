/**
 * GraphQL queries for the dashboard.
 *
 * We deliberately request only the minimum fields needed; fewer fields = lower
 * Shopify rate-limit cost = more concurrent merchants on free tier.
 *
 * The orders query is shared between overview, profit, and returns endpoints
 * so a single fetch can power all three. Line-item, refund, and return fields
 * are included to support each aggregator without a second pass.
 */

export const ORDERS_OVERVIEW_QUERY = /* GraphQL */ `
  query OrdersOverview($query: String!, $first: Int!, $after: String) {
    orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        processedAt
        returnStatus
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        currentSubtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalRefundedSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        paymentGatewayNames
        discountCodes
        totalShippingPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        shippingLines(first: 5) {
          edges {
            node {
              source
              discountedPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
        customer {
          id
          numberOfOrders
        }
        lineItems(first: 50) {
          edges {
            node {
              id
              quantity
              refundableQuantity
              variant {
                id
                sku
              }
              product {
                id
                title
              }
              discountedUnitPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              originalUnitPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              originalTotalSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
        refunds {
          id
          createdAt
          totalRefundedSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          refundLineItems(first: 50) {
            edges {
              node {
                quantity
                subtotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                lineItem {
                  id
                  product {
                    id
                    title
                  }
                  variant {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const SHOP_CURRENCY_QUERY = /* GraphQL */ `
  query ShopCurrency {
    shop {
      currencyCode
      ianaTimezone
    }
  }
`;

// ---- Order shape returned by ORDERS_OVERVIEW_QUERY ----
//
// Centralised here so the shared `fetchOrdersForRange` and every aggregator
// (overview / profit / returns) work off the same type. Aggregators that only
// need a subset of fields can structurally narrow at call sites.

export type LineItemNode = {
  id: string;
  quantity: number;
  refundableQuantity: number;
  variant: { id: string; sku: string | null } | null;
  product: { id: string; title: string } | null;
  discountedUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  originalUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  originalTotalSet: { shopMoney: { amount: string; currencyCode: string } };
};

export type RefundLineItemNode = {
  quantity: number;
  subtotalSet: { shopMoney: { amount: string; currencyCode: string } } | null;
  lineItem: {
    id: string;
    product: { id: string; title: string } | null;
    variant: { id: string } | null;
  } | null;
};

export type RefundNode = {
  id: string;
  createdAt: string;
  totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } };
  refundLineItems: { edges: Array<{ node: RefundLineItemNode }> };
};

export type ReturnLineItemNode = {
  quantity: number;
  returnReason: string | null;
};

export type ReturnNode = {
  id: string;
  status: string;
  returnLineItems: { edges: Array<{ node: ReturnLineItemNode }> };
};

export type OrderReturnStatus =
  | "NO_RETURN"
  | "RETURN_REQUESTED"
  | "IN_PROGRESS"
  | "RETURNED"
  | "INSPECTION_COMPLETE"
  | string;

export type ShippingLineNode = {
  source: string | null;
  discountedPriceSet: { shopMoney: { amount: string; currencyCode: string } };
};

export type OrderNode = {
  id: string;
  processedAt: string;
  returnStatus: OrderReturnStatus;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  currentSubtotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } };
  paymentGatewayNames: string[];
  discountCodes: string[];
  totalShippingPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  shippingLines: { edges: Array<{ node: ShippingLineNode }> };
  customer: { id: string; numberOfOrders: number } | null;
  lineItems: { edges: Array<{ node: LineItemNode }> };
  refunds: RefundNode[];
  returns?: { edges: Array<unknown> };
};

/** Lightweight query used only by the returns-reasons endpoint.
 *  Kept separate to avoid blowing the 1000-point cost budget on the main query. */
export const ORDERS_RETURNS_QUERY = /* GraphQL */ `
  query OrdersReturns($query: String!, $first: Int!, $after: String) {
    orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        returns(first: 5) {
          edges {
            node {
              returnLineItems(first: 20) {
                edges {
                  node {
                    quantity
                    returnReason
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export type ReturnReasonOrderNode = {
  id: string;
  returns: {
    edges: Array<{
      node: {
        returnLineItems: {
          edges: Array<{ node: ReturnLineItemNode }>;
        };
      };
    }>;
  };
};

/**
 * Lightweight query for geographic analytics (F01).
 * Only requests shipping address coordinates + revenue + customer id.
 * Kept separate from ORDERS_OVERVIEW_QUERY so adding address fields does not
 * raise the rate-limit cost on all existing metric paths.
 */
export const ORDERS_GEOGRAPHY_QUERY = /* GraphQL */ `
  query OrdersGeography($query: String!, $first: Int!, $after: String) {
    orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        processedAt
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        customer {
          id
        }
        shippingAddress {
          latitude
          longitude
          city
          province
          countryCode
          country
        }
      }
    }
  }
`;

export type GeoOrderShippingAddress = {
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  province: string | null;
  countryCode: string | null;
  country: string | null;
};

export type GeoOrderNode = {
  id: string;
  processedAt: string;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  customer: { id: string } | null;
  shippingAddress: GeoOrderShippingAddress | null;
};

/**
 * F43 — Order Report query (raw order rows for the merchant-facing table).
 *
 * Kept separate from ORDERS_OVERVIEW_QUERY because we need order-level fields
 * (name, displayFinancialStatus, displayFulfillmentStatus, tags, source) that
 * the overview path does not, and we want to keep the overview cost low.
 */
export const ORDERS_REPORT_QUERY = /* GraphQL */ `
  query OrdersReport($query: String!, $first: Int!, $after: String) {
    orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        processedAt
        createdAt
        sourceName
        displayFinancialStatus
        displayFulfillmentStatus
        tags
        paymentGatewayNames
        currentSubtotalLineItemsQuantity
        totalPriceSet { shopMoney { amount currencyCode } }
        totalRefundedSet { shopMoney { amount currencyCode } }
        totalDiscountsSet { shopMoney { amount currencyCode } }
        totalShippingPriceSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
      }
    }
  }
`;

export type OrderReportNode = {
  id: string;
  name: string;
  processedAt: string;
  createdAt: string;
  sourceName: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  tags: string[];
  paymentGatewayNames: string[];
  currentSubtotalLineItemsQuantity: number;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } };
  totalDiscountsSet: { shopMoney: { amount: string; currencyCode: string } };
  totalShippingPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  totalTaxSet: { shopMoney: { amount: string; currencyCode: string } };
};

/**
 * F45 — Refund Report query.
 *
 * Lightweight order list focused on refund details (note, refund line item
 * counts) so the refunds page doesn't pay the full ORDERS_OVERVIEW_QUERY cost.
 * Order-level fields are limited to what the report table needs.
 */
export const ORDERS_REFUNDS_QUERY = /* GraphQL */ `
  query OrdersRefunds($query: String!, $first: Int!, $after: String) {
    orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        totalPriceSet { shopMoney { amount currencyCode } }
        refunds {
          id
          createdAt
          note
          totalRefundedSet { shopMoney { amount currencyCode } }
          refundLineItems(first: 50) {
            edges {
              node {
                quantity
                restockType
              }
            }
          }
        }
      }
    }
  }
`;

export type RefundReportLineItemNode = {
  quantity: number;
  restockType: string | null;
};

export type RefundReportRefundNode = {
  id: string;
  createdAt: string;
  note: string | null;
  totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } };
  refundLineItems: { edges: Array<{ node: RefundReportLineItemNode }> };
};

export type RefundReportOrderNode = {
  id: string;
  name: string;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  refunds: RefundReportRefundNode[];
};

/**
 * Inventory velocity query — fetches product variants with stock levels.
 * Uses productVariants connection (separate from orders), paginated.
 * Capped at 250 variants per page, max 40 pages (10,000 variants budget).
 */
export const INVENTORY_VARIANTS_QUERY = /* GraphQL */ `
  query InventoryVariants($first: Int!, $after: String) {
    productVariants(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        sku
        product {
          id
          title
          status
        }
        inventoryQuantity
      }
    }
  }
`;

export type InventoryVariantNode = {
  id: string;
  title: string;
  sku: string | null;
  product: { id: string; title: string; status: string } | null;
  inventoryQuantity: number | null;
};
