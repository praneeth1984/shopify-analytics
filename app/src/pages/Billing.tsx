/**
 * Plan & Billing page — current plan overview and upcoming tier roadmap.
 *
 * Pro and AI plans are shown as "Coming Soon" — billing is not yet active.
 * The page is informational only until managed pricing is enabled post-submission.
 */

import {
  Badge, BlockStack, Box, Card, InlineStack,
  Layout, List, Page, Text,
} from "@shopify/polaris";

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
    price: "$0",
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
    price: "$4.99 / month",
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
  {
    name: "AI",
    price: "$9.99 / month",
    description: "Everything in Pro, plus AI-powered insights and recommendations.",
    features: [
      "Weekly AI performance brief",
      "Anomaly detection and alerts",
      "Peer benchmarks vs. similar stores",
      "Natural-language Q&A on your data",
      "Priority support",
    ],
    comingSoon: true,
  },
];

export function Billing() {
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

            <InlineStack gap="400" align="start" wrap>
              {PLANS.map((plan) => (
                <Box key={plan.name} minWidth="280px" maxWidth="360px">
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
                    </BlockStack>
                  </Card>
                </Box>
              ))}
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
