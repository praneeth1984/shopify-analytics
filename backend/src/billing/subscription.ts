/**
 * Shopify Billing API integration.
 *
 * Wraps `appSubscriptionCreate` and `appSubscriptionCancel` against the Admin
 * GraphQL API. Pricing for Pro is fixed at $29 USD / month (EVERY_30_DAYS) so
 * merchants get predictable billing — no usage-based fees, no tiers per the
 * product spec in CLAUDE.md.
 *
 * The subscription `name` MUST start with "pro" (case-insensitive) so
 * `derivePlan()` in `plan/get-plan.ts` recognises it as a Pro tier when it
 * resolves the active plan via `currentAppInstallation.activeSubscriptions`.
 */

import type { GraphQLClient } from "../shopify/graphql-client.js";
import { Upstream } from "../lib/errors.js";

/** Subscription product name. The leading "Pro " is the marker `derivePlan`
 *  matches against — keep it. */
export const PRO_SUBSCRIPTION_NAME = "Pro Monthly";

/** $29.00 USD/month. Stored as a decimal string per Shopify's MoneyInput type. */
export const PRO_PRICE_AMOUNT = "4.99";
export const PRO_PRICE_CURRENCY = "USD";

/** Shopify's RecurringInterval enum value for monthly billing. */
const RECURRING_INTERVAL_MONTHLY = "EVERY_30_DAYS";

export const APP_SUBSCRIPTION_CREATE_MUTATION = /* GraphQL */ `
  mutation AppSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $test: Boolean
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      test: $test
      lineItems: $lineItems
    ) {
      appSubscription {
        id
        name
        status
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

export const ACTIVE_SUBSCRIPTIONS_WITH_ID_QUERY = /* GraphQL */ `
  query ActiveSubscriptionsWithId {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
      }
    }
  }
`;

export const APP_SUBSCRIPTION_CANCEL_MUTATION = /* GraphQL */ `
  mutation AppSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

type AppSubscriptionCreateResponse = {
  appSubscriptionCreate: {
    appSubscription: { id: string; name: string; status: string } | null;
    confirmationUrl: string | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
};

type ActiveSubscriptionsWithIdResponse = {
  currentAppInstallation: {
    activeSubscriptions: Array<{ id: string; name: string; status: string }>;
  } | null;
};

type AppSubscriptionCancelResponse = {
  appSubscriptionCancel: {
    appSubscription: { id: string; status: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
};

export async function createProSubscription(
  graphql: GraphQLClient,
  returnUrl: string,
  test = false,
): Promise<{ confirmationUrl: string }> {
  const { data } = await graphql<AppSubscriptionCreateResponse>(
    APP_SUBSCRIPTION_CREATE_MUTATION,
    {
      name: PRO_SUBSCRIPTION_NAME,
      returnUrl,
      test,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: PRO_PRICE_AMOUNT, currencyCode: PRO_PRICE_CURRENCY },
              interval: RECURRING_INTERVAL_MONTHLY,
            },
          },
        },
      ],
    },
  );

  const result = data.appSubscriptionCreate;
  if (result.userErrors.length > 0) {
    const detail = result.userErrors.map((e) => e.message).join("; ");
    throw Upstream(detail);
  }
  if (!result.confirmationUrl) {
    throw Upstream("Subscription created without confirmation URL");
  }
  return { confirmationUrl: result.confirmationUrl };
}

export async function cancelActiveSubscription(
  graphql: GraphQLClient,
): Promise<{ cancelled: boolean }> {
  const { data: listData } = await graphql<ActiveSubscriptionsWithIdResponse>(
    ACTIVE_SUBSCRIPTIONS_WITH_ID_QUERY,
  );
  const subs = listData.currentAppInstallation?.activeSubscriptions ?? [];
  // Active here means status === "ACTIVE"; Shopify also surfaces "PENDING" /
  // "FROZEN" rows via this field but we only cancel real ACTIVE ones.
  const active = subs.find((s) => s.status?.toUpperCase() === "ACTIVE");
  if (!active) return { cancelled: false };

  const { data } = await graphql<AppSubscriptionCancelResponse>(
    APP_SUBSCRIPTION_CANCEL_MUTATION,
    { id: active.id },
  );
  const result = data.appSubscriptionCancel;
  if (result.userErrors.length > 0) {
    const detail = result.userErrors.map((e) => e.message).join("; ");
    throw Upstream("Could not cancel subscription", detail);
  }
  return { cancelled: true };
}
