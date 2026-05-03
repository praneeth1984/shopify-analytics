import type { GraphQLClient } from "../shopify/graphql-client.js";
import type { Plan } from "@fbc/shared";

const PAYOUTS_QUERY = /* GraphQL */ `
  query PayoutList($first: Int!) {
    shopifyPaymentsAccount {
      payouts(first: $first, sortKey: DATE, reverse: true) {
        nodes {
          id
          status
          issuedAt
          net { amount currencyCode }
          gross { amount currencyCode }
          totalFee { amount currencyCode }
          transactionsCount { count }
        }
      }
    }
  }
`;

export type PayoutRow = {
  id: string;
  date: string;
  status: string;
  grossAmount: string;
  grossCurrency: string;
  feeAmount: string;
  feeCurrency: string;
  netAmount: string;
  netCurrency: string;
  transactionCount: number;
};

export type PayoutsResponse =
  | { available: false; reason: string }
  | { available: true; payouts: PayoutRow[]; plan: Plan };

type PayoutNode = {
  id: string;
  status: string;
  issuedAt: string;
  net: { amount: string; currencyCode: string };
  gross: { amount: string; currencyCode: string };
  totalFee: { amount: string; currencyCode: string };
  transactionsCount: { count: number };
};

type PayoutsResp = {
  shopifyPaymentsAccount: {
    payouts: { nodes: PayoutNode[] };
  } | null;
};

export async function computePayoutsReport(
  graphql: GraphQLClient,
  plan: Plan,
): Promise<PayoutsResponse> {
  const limit = plan === "free" ? 3 : 50;

  let resp: PayoutsResp;
  try {
    const r = await graphql<PayoutsResp>(PAYOUTS_QUERY, { first: limit });
    resp = r.data;
  } catch {
    return { available: false, reason: "query_error" };
  }

  if (!resp.shopifyPaymentsAccount) {
    return { available: false, reason: "not_on_shopify_payments" };
  }

  const payouts: PayoutRow[] = resp.shopifyPaymentsAccount.payouts.nodes.map((n) => ({
    id: n.id.split("/").pop() ?? n.id,
    date: n.issuedAt?.slice(0, 10) ?? "",
    status: n.status?.toLowerCase() ?? "unknown",
    grossAmount: n.gross?.amount ?? "0",
    grossCurrency: n.gross?.currencyCode ?? "USD",
    feeAmount: n.totalFee?.amount ?? "0",
    feeCurrency: n.totalFee?.currencyCode ?? "USD",
    netAmount: n.net?.amount ?? "0",
    netCurrency: n.net?.currencyCode ?? "USD",
    transactionCount: n.transactionsCount?.count ?? 0,
  }));

  return { available: true, payouts, plan };
}
