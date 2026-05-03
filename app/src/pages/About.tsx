import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Divider,
  Box,
  Badge,
} from "@shopify/polaris";

export function About() {
  return (
    <Page
      title="About FirstBridge"
      subtitle="The team behind this app"
      backAction={{ content: "Overview", url: "/overview" }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">

            {/* Who we are */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">FirstBridge Consulting</Text>
                  <Badge tone="success">Shopify Development Agency</Badge>
                </InlineStack>
                <Text as="p" variant="bodyMd" tone="subdued">
                  We're a Shopify development agency that builds custom apps,
                  storefronts, and integrations for growing brands. FirstBridge
                  Analytics is the tool we wished existed — genuinely useful profit
                  visibility, free to start, no per-order billing surprises.
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  We built this app ourselves, we use it ourselves, and we maintain
                  it. When something breaks, we're the ones on the hook.
                </Text>
              </BlockStack>
            </Card>

            {/* What the app does */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">What this app does</Text>
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="start">
                    <Text as="span" variant="bodyMd">📊</Text>
                    <Text as="p" variant="bodyMd">
                      <Text as="span" fontWeight="semibold">Revenue & orders</Text>
                      {" "}— headline numbers with previous-period comparison so you always know if you're up or down.
                    </Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="start">
                    <Text as="span" variant="bodyMd">💰</Text>
                    <Text as="p" variant="bodyMd">
                      <Text as="span" fontWeight="semibold">Gross profit & margin</Text>
                      {" "}— enter your product costs once; see real margin numbers, not estimates.
                    </Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="start">
                    <Text as="span" variant="bodyMd">↩️</Text>
                    <Text as="p" variant="bodyMd">
                      <Text as="span" fontWeight="semibold">Returns analytics</Text>
                      {" "}— which products get returned most, why, and how refunds are resolved.
                    </Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="start">
                    <Text as="span" variant="bodyMd">📦</Text>
                    <Text as="p" variant="bodyMd">
                      <Text as="span" fontWeight="semibold">Top profitable products</Text>
                      {" "}— ranked by gross profit so you know what to double down on.
                    </Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            <Divider />

            {/* Hire us CTA */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Need something custom?</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  If this app gives you the numbers and now you want to act on them —
                  custom integrations, bespoke analytics dashboards, Shopify app
                  development, or storefront builds — that's exactly what we do for
                  clients.
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  A single project with us typically delivers more value than years of
                  SaaS subscriptions. We scope honestly, deliver on time, and don't
                  disappear after handoff.
                </Text>
                <Box paddingBlockStart="200">
                  <InlineStack gap="300">
                    <Button
                      variant="primary"
                      url="https://firstbridgeconsulting.com"
                      external
                    >
                      Visit FirstBridge Consulting
                    </Button>
                    <Button
                      url="mailto:hello@firstbridgeconsulting.com"
                      external
                    >
                      Email us
                    </Button>
                  </InlineStack>
                </Box>
              </BlockStack>
            </Card>

            {/* Support */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Support</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Found a bug or have a feature request? Use the{" "}
                  <Text as="span" fontWeight="semibold">Feedback</Text> tab in the nav
                  — it goes straight to us. For urgent issues, email{" "}
                  <Text as="span" fontWeight="semibold">support@firstbridgeconsulting.com</Text>.
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  We respond within one business day.
                </Text>
              </BlockStack>
            </Card>

          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Quick links</Text>
                <BlockStack gap="200">
                  <Button
                    variant="plain"
                    url="https://firstbridgeconsulting.com"
                    external
                  >
                    firstbridgeconsulting.com
                  </Button>
                  <Button
                    variant="plain"
                    url="mailto:support@firstbridgeconsulting.com"
                    external
                  >
                    support@firstbridgeconsulting.com
                  </Button>
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">App version</Text>
                <Text as="p" variant="bodyMd" tone="subdued">Phase 1 — Free tier</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Pro plan coming soon. Unlimited history, daily auto-refresh, deeper
                  cohort views — flat $19/month, no per-order fees.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
