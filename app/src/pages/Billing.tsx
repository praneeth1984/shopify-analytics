/**
 * Plan & Billing page — current plan overview and upgrade flow.
 *
 * Two plans only: Free and Pro. Monthly billing only.
 */

import {
  Badge, BlockStack, Button, Card, Grid, InlineStack,
  Layout, List, Page, Text,
} from "@shopify/polaris";
import { PRO_MONTHLY_PRICE } from "@fbc/shared";
import { useBilling } from "../hooks/useBilling.js";

type PlanCard = {
  name: string;
  price: string;
  description: string;
  features: string[];
  current?: boolean;
  comingSoon?: boolean;
};

const PLANS: PlanCard[] = [
  {
    name: "Free",
    price: "$0 / month",
    description: "Everything most stores need to understand performance.",
    features: [
      "Revenue, orders, AOV, unique customers",
      "Profit dashboard and top-product breakdown",
      "Returns analytics",
      "90 days of history",
      "Manual cost entry for up to 20 SKUs",
      "Country and state geography",
    ],
    current: true,
  },
  {
    name: "Pro",
    price: `${PRO_MONTHLY_PRICE} / month`,
    description: "Everything in Free, plus deeper history and detail.",
    features: [
      "Unlimited history",
      "Unlimited per-variant cost entry",
      "City-level geography and grid heat map",
      "Daily auto-refresh of profit and returns",
      "Cancel anytime — no annual lock-in",
    ],
    comingSoon: true,
  },
];

export function Billing() {
  const { manage } = useBilling();

  return (
    <Page
      title="Plan & Billing"
      subtitle="You're on the Free plan. Paid tiers are coming soon."
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Current plan</Text>
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="success">Free</Badge>
                  <Text as="span" tone="subdued">No charges</Text>
                </InlineStack>
              </BlockStack>
            </Card>

            <Grid>
              {PLANS.map((plan) => (
                <Grid.Cell
                  key={plan.name}
                  columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}
                >
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h3" variant="headingMd">{plan.name}</Text>
                          {plan.current && <Badge tone="success">Current</Badge>}
                          {plan.comingSoon && <Badge>Coming Soon</Badge>}
                        </InlineStack>
                        <Text
                          as="span"
                          fontWeight={plan.comingSoon ? "semibold" : undefined}
                          tone={plan.current ? "subdued" : undefined}
                        >
                          {plan.price}
                        </Text>
                      </InlineStack>

                      <Text as="p" tone="subdued">{plan.description}</Text>

                      <List type="bullet">
                        {plan.features.map((f) => (
                          <List.Item key={f}>{f}</List.Item>
                        ))}
                      </List>

                      {plan.name === "Pro" && (
                        <Button
                          variant="primary"
                          onClick={() => { void manage(); }}
                        >
                          {`Upgrade to Pro — ${PRO_MONTHLY_PRICE}/mo`}
                        </Button>
                      )}
                    </BlockStack>
                  </Card>
                </Grid.Cell>
              ))}
            </Grid>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
