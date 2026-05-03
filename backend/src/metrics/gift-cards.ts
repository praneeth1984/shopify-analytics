import type { GraphQLClient } from "../shopify/graphql-client.js";
import type { Plan } from "@fbc/shared";

const GIFT_CARDS_QUERY = /* GraphQL */ `
  query GiftCards($first: Int!, $after: String) {
    giftCards(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        initialValue { amount currencyCode }
        balance { amount currencyCode }
        expiresOn
        createdAt
        lastCharacters
        usageCount
        customer { id }
      }
    }
  }
`;

export type GiftCardOverview = {
  totalIssued: number;
  totalValueIssuedAmount: string;
  totalValueIssuedCurrency: string;
  totalRedeemedAmount: string;
  totalRedeemedCurrency: string;
  outstandingLiabilityAmount: string;
  outstandingLiabilityCurrency: string;
  expiringIn30Days: number;
};

export type GiftCardRow = {
  id: string;
  lastCharacters: string;
  initialValueAmount: string;
  initialValueCurrency: string;
  balanceAmount: string;
  balanceCurrency: string;
  usageCount: number;
  expiresOn: string | null;
  createdAt: string;
  hasCustomer: boolean;
};

export type GiftCardsResponse =
  | { scope_missing: true }
  | {
      scope_missing: false;
      overview: GiftCardOverview;
      expiredOrUnused: GiftCardRow[];
      issuance: GiftCardRow[];
      plan: Plan;
    };

type GiftCardNode = {
  id: string;
  initialValue: { amount: string; currencyCode: string };
  balance: { amount: string; currencyCode: string };
  expiresOn: string | null;
  createdAt: string;
  lastCharacters: string;
  usageCount: number;
  customer: { id: string } | null;
};

type GiftCardsResp = {
  giftCards: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: GiftCardNode[];
  };
};

export async function computeGiftCards(
  graphql: GraphQLClient,
  plan: Plan,
): Promise<GiftCardsResponse> {
  const cards: GiftCardNode[] = [];
  let after: string | null = null;
  const maxPages = plan === "free" ? 1 : 20;
  let pages = 0;

  try {
    while (pages < maxPages) {
      const { data } = (await graphql<GiftCardsResp>(GIFT_CARDS_QUERY, {
        first: 250,
        after,
      })) as { data: GiftCardsResp };
      cards.push(...data.giftCards.nodes);
      pages++;
      if (!data.giftCards.pageInfo.hasNextPage) break;
      after = data.giftCards.pageInfo.endCursor;
      if (!after) break;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("ACCESS_DENIED") || msg.includes("read_gift_cards")) {
      return { scope_missing: true };
    }
    throw err;
  }

  const currency = cards[0]?.initialValue?.currencyCode ?? "USD";
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let totalValueIssued = 0;
  let totalRedeemed = 0;
  let outstandingLiability = 0;
  let expiringIn30Days = 0;

  for (const c of cards) {
    const initial = parseFloat(c.initialValue?.amount ?? "0");
    const balance = parseFloat(c.balance?.amount ?? "0");
    totalValueIssued += initial;
    totalRedeemed += (initial - balance);
    outstandingLiability += balance;
    if (c.expiresOn) {
      const exp = new Date(c.expiresOn);
      if (exp > now && exp <= in30Days) expiringIn30Days++;
    }
  }

  const toRow = (c: GiftCardNode): GiftCardRow => ({
    id: c.id.split("/").pop() ?? c.id,
    lastCharacters: c.lastCharacters ?? "****",
    initialValueAmount: c.initialValue?.amount ?? "0",
    initialValueCurrency: c.initialValue?.currencyCode ?? currency,
    balanceAmount: c.balance?.amount ?? "0",
    balanceCurrency: c.balance?.currencyCode ?? currency,
    usageCount: c.usageCount ?? 0,
    expiresOn: c.expiresOn ?? null,
    createdAt: c.createdAt,
    hasCustomer: !!c.customer,
  });

  const expiredOrUnused = cards.filter((c) => {
    const expired = c.expiresOn ? new Date(c.expiresOn) < now : false;
    const unused = (c.usageCount ?? 0) === 0 && parseFloat(c.balance?.amount ?? "0") > 0;
    return expired || unused;
  }).map(toRow);

  return {
    scope_missing: false,
    overview: {
      totalIssued: cards.length,
      totalValueIssuedAmount: totalValueIssued.toFixed(2),
      totalValueIssuedCurrency: currency,
      totalRedeemedAmount: totalRedeemed.toFixed(2),
      totalRedeemedCurrency: currency,
      outstandingLiabilityAmount: outstandingLiability.toFixed(2),
      outstandingLiabilityCurrency: currency,
      expiringIn30Days,
    },
    expiredOrUnused,
    issuance: plan === "free" ? [] : cards.map(toRow),
    plan,
  };
}
