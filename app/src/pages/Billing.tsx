/**
 * Billing page — current plan, plan comparison, and Manage plan CTA.
 *
 * Uses Shopify Managed Pricing: upgrade, downgrade, and cancellation are all
 * handled on Shopify's own pricing page. This page shows the merchant what
 * they have and provides a single entry point to change it.
 */

import { useCallback, useState } from "react";
import {
  Badge, Banner, BlockStack, Box, Button, Card, InlineStack,
  Layout, List, Page, Spinner, Text,
} from "@shopify/polaris";
import { useBilling } from "../hooks/useBilling.js";

const PRO_PRICE_LABEL = "$4.99 / month · 15-day free trial";

export function Billing() {
  const billing = useBilling();
  const [managing, setManaging] = useState(false);

  const isPro = billing.plan === "pro";

  const handleManage = useCallback(async () => {
    setManaging(true);
    try { await billing.manage(); } finally { setManaging(false); }
  }, [billing]);

  return (
    <Page title="Plan & Billing" subtitle="Manage your FirstBridge Analytics subscription.">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {billing.error ? (
              <Banner tone="critical" title="Something went wrong">
                <p>{billing.error}</p>
              </Banner>
            ) : null}

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Current plan</Text>
                {billing.loading ? (
                  <InlineStack gap="200" blockAlign="center">
                    <Spinner accessibilityLabel="Loading current plan" size="small" />
                    <Text as="span" tone="subdued">Checking your plan…</Text>
                  </InlineStack>
                ) : (
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={isPro ? "success" : undefined}>
                      {isPro ? "Pro" : "Free"}
                    </Badge>
                    <Text as="span" tone="subdued">
                      {isPro ? PRO_PRICE_LABEL : "No charges"}
                    </Text>
                  </InlineStack>
                )}
              </BlockStack>
            </Card>

            <Layout>
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h3" variant="headingMd">Free</Text>
                      <Text as="span" tone="subdued">$0</Text>
                    </InlineStack>
                    <Text as="p" tone="subdued">
                      Everything most stores need to understand performance.
                    </Text>
                    <List type="bullet">
                      <List.Item>Revenue, orders, AOV, unique customers</List.Item>
                      <List.Item>Profit dashboard and top-product breakdown</List.Item>
                      <List.Item>Returns analytics</List.Item>
                      <List.Item>90 days of history</List.Item>
                      <List.Item>Manual cost entry for up to 20 SKUs</List.Item>
                      <List.Item>Country and state geography</List.Item>
                    </List>
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h3" variant="headingMd">Pro</Text>
                      <Text as="span" fontWeight="semibold">$4.99 / month</Text>
                    </InlineStack>
                    <Text as="p" tone="subdued">
                      Everything in Free, plus deeper history and detail.
                    </Text>
                    <List type="bullet">
                      <List.Item>Unlimited history</List.Item>
                      <List.Item>Unlimited per-variant cost entry</List.Item>
                      <List.Item>City-level geography and grid heat map</List.Item>
                      <List.Item>Daily auto-refresh of profit and returns</List.Item>
                      <List.Item>Cancel anytime — no annual lock-in</List.Item>
                    </List>

                    <Box paddingBlockStart="200">
                      <Button
                        variant={isPro ? "secondary" : "primary"}
                        onClick={handleManage}
                        loading={managing}
                        disabled={billing.loading}
                      >
                        {isPro ? "Manage plan" : `Upgrade to Pro — ${PRO_PRICE_LABEL}`}
                      </Button>
                    </Box>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
