/**
 * Shared chrome for every chart in the dashboard.
 *
 * Recharts' `<ResponsiveContainer>` requires a parent with explicit pixel
 * height, so we render a 320px-tall div as the chart slot. When `emptyState`
 * is provided, we substitute it for the chart content but keep the slot at
 * full height so the dashboard doesn't reflow when data lands.
 */

import type { ReactNode } from "react";
import { BlockStack, Box, Card, InlineStack, Text } from "@shopify/polaris";

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  emptyState?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function ChartCard({ title, subtitle, action, emptyState, footer, children }: Props) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h3" variant="headingMd">
              {title}
            </Text>
            {subtitle ? (
              <Text as="span" variant="bodySm" tone="subdued">
                {subtitle}
              </Text>
            ) : null}
          </BlockStack>
          {action ?? null}
        </InlineStack>
        <Box minHeight="320px">
          {emptyState ?? <div style={{ height: 320, width: "100%" }}>{children}</div>}
        </Box>
        {footer ?? null}
      </BlockStack>
    </Card>
  );
}
