/**
 * F43 — Order Report transformer.
 *
 * Single-page fetch of `ORDERS_REPORT_QUERY` (page size 50). Status filters
 * (financial_status, fulfillment_status) are applied server-side via the
 * Shopify search query so the merchant doesn't paginate through orders only
 * to filter them client-side. Cursor-based pagination via `after`.
 */

import type { GraphQLClient } from "../shopify/graphql-client.js";
import type {
  FulfillmentFilter,
  OrderReportResponse,
  OrderRow,
  OrderStatusFilter,
} from "@fbc/shared";
import { minorToMoney, moneyToMinor } from "../cogs/lookup.js";
import { ORDERS_REPORT_QUERY } from "./queries.js";
import type { OrderReportNode } from "./queries.js";

export const ORDER_REPORT_PAGE_SIZE = 50;

type OrdersResp = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: OrderReportNode[];
  };
};

function buildSearchQuery(args: {
  start: string;
  end: string;
  status: OrderStatusFilter;
  fulfillment: FulfillmentFilter;
}): string {
  const parts: string[] = [
    `processed_at:>='${args.start}'`,
    `processed_at:<'${args.end}'`,
  ];
  switch (args.status) {
    case "paid":
      parts.push("financial_status:paid");
      break;
    case "pending":
      parts.push("financial_status:pending");
      break;
    case "refunded":
      parts.push("financial_status:refunded");
      break;
    case "cancelled":
      parts.push("status:cancelled");
      break;
    case "all":
    default:
      break;
  }
  switch (args.fulfillment) {
    case "fulfilled":
      parts.push("fulfillment_status:fulfilled");
      break;
    case "unfulfilled":
      parts.push("fulfillment_status:unfulfilled");
      break;
    case "partial":
      parts.push("fulfillment_status:partial");
      break;
    case "all":
    default:
      break;
  }
  return parts.join(" ");
}

function nodeToRow(o: OrderReportNode): OrderRow {
  const grossMinor = moneyToMinor(o.totalPriceSet.shopMoney.amount);
  const refundedMinor = moneyToMinor(o.totalRefundedSet.shopMoney.amount);
  const netMinor = grossMinor - refundedMinor;
  const currency = o.totalPriceSet.shopMoney.currencyCode || "USD";
  return {
    id: o.id.split("/").pop() ?? o.id,
    gid: o.id,
    name: o.name,
    created_at: o.createdAt,
    channel: o.sourceName,
    payment_status: o.displayFinancialStatus,
    fulfillment_status: o.displayFulfillmentStatus,
    line_item_count: o.currentSubtotalLineItemsQuantity,
    gross_revenue: minorToMoney(grossMinor, currency),
    discounts: minorToMoney(moneyToMinor(o.totalDiscountsSet.shopMoney.amount), currency),
    shipping: minorToMoney(moneyToMinor(o.totalShippingPriceSet.shopMoney.amount), currency),
    tax: minorToMoney(moneyToMinor(o.totalTaxSet.shopMoney.amount), currency),
    net_revenue: minorToMoney(netMinor, currency),
    gateway: o.paymentGatewayNames[0] ?? null,
    tags: o.tags,
  };
}

export async function fetchOrderReportPage(
  graphql: GraphQLClient,
  args: {
    start: string;
    end: string;
    status: OrderStatusFilter;
    fulfillment: FulfillmentFilter;
    cursor: string | null;
  },
): Promise<OrderReportResponse> {
  const q = buildSearchQuery(args);
  const { data } = (await graphql<OrdersResp>(ORDERS_REPORT_QUERY, {
    query: q,
    first: ORDER_REPORT_PAGE_SIZE,
    after: args.cursor,
  })) as { data: OrdersResp };
  const rows = data.orders.nodes.map(nodeToRow);
  return {
    orders: rows,
    cursor: data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null,
    truncated: false,
  };
}

// Exported for tests
export const _internal = { nodeToRow, buildSearchQuery };
