import type { GraphQLClient } from "../shopify/graphql-client.js";
import type { Plan } from "@fbc/shared";

const CUSTOMERS_QUERY = /* GraphQL */ `
  query CustomerList($first: Int!, $after: String, $query: String) {
    customers(first: $first, after: $after, query: $query, sortKey: TOTAL_SPENT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        firstName
        lastName
        email
        ordersCount
        totalSpentV2 { amount currencyCode }
        createdAt
        updatedAt
        tags
        addresses(first: 1) { city countryCode province }
        orders(first: 10, sortKey: PROCESSED_AT, reverse: false) {
          nodes { processedAt }
        }
      }
    }
  }
`;

export type CustomerRow = {
  id: string;
  maskedName: string;
  maskedEmail: string;
  city: string;
  country: string;
  totalOrders: number;
  totalSpentAmount: string;
  totalSpentCurrency: string;
  avgOrderValueAmount: string;
  avgOrderValueCurrency: string;
  firstOrderDate: string;
  lastOrderDate: string;
  avgDaysBetweenOrders: number | null;
  tags: string[];
};

export type CustomerListResponse = {
  customers: CustomerRow[];
  total: number;
  plan: Plan;
  planCappedTo: number | null;
};

function maskName(first: string, last: string): string {
  const initial = first ? first[0] + "." : "";
  const surname = last ? last[0] + "***" : "";
  return [initial, surname].filter(Boolean).join(" ") || "Customer";
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***@***.***";
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function avgDaysBetween(dates: string[]): number | null {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort();
  const first = new Date(sorted[0]!).getTime();
  const last = new Date(sorted[sorted.length - 1]!).getTime();
  return Math.round((last - first) / ((dates.length - 1) * 24 * 60 * 60 * 1000));
}

type GQLCustomerNode = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  ordersCount: number;
  totalSpentV2: { amount: string; currencyCode: string };
  createdAt: string;
  updatedAt: string;
  tags: string[];
  addresses: Array<{ city: string; countryCode: string; province: string }>;
  orders: { nodes: Array<{ processedAt: string }> };
};

type CustomerListResp = {
  customers: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: GQLCustomerNode[];
  };
};

export async function computeCustomerList(
  graphql: GraphQLClient,
  plan: Plan,
): Promise<CustomerListResponse> {
  const freeLimit = 100;
  const pageSize = plan === "free" ? freeLimit : 250;
  const maxPages = plan === "free" ? 1 : 20;

  const customers: GQLCustomerNode[] = [];
  let after: string | null = null;
  let pages = 0;

  while (pages < maxPages) {
    const { data } = (await graphql<CustomerListResp>(CUSTOMERS_QUERY, {
      first: pageSize,
      after,
      query: null,
    })) as { data: CustomerListResp };
    customers.push(...data.customers.nodes);
    pages++;
    if (!data.customers.pageInfo.hasNextPage) break;
    after = data.customers.pageInfo.endCursor;
    if (!after) break;
  }

  const rows: CustomerRow[] = customers.map((node) => {
    const addr = node.addresses[0];
    const orderDates = node.orders.nodes.map((o) => o.processedAt);
    const totalSpent = parseFloat(node.totalSpentV2.amount);
    const currency = node.totalSpentV2.currencyCode;
    const aov = node.ordersCount > 0 ? totalSpent / node.ordersCount : 0;
    return {
      id: node.id.split("/").pop() ?? node.id,
      maskedName: maskName(node.firstName ?? "", node.lastName ?? ""),
      maskedEmail: maskEmail(node.email ?? ""),
      city: addr?.city ?? "",
      country: addr?.countryCode ?? "",
      totalOrders: node.ordersCount,
      totalSpentAmount: totalSpent.toFixed(2),
      totalSpentCurrency: currency,
      avgOrderValueAmount: aov.toFixed(2),
      avgOrderValueCurrency: currency,
      firstOrderDate: orderDates[0] ?? node.createdAt,
      lastOrderDate: orderDates[orderDates.length - 1] ?? node.updatedAt,
      avgDaysBetweenOrders: avgDaysBetween(orderDates),
      tags: node.tags,
    };
  });

  return {
    customers: rows,
    total: rows.length,
    plan,
    planCappedTo: plan === "free" ? freeLimit : null,
  };
}
