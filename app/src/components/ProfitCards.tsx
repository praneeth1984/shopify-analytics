/**
 * Three Polaris Cards: Gross profit, Margin %, Profit per order.
 *
 * Per the architect's design: when no COGS exists, show an empty/CTA state
 * pointing at Settings instead of zeroes. We use the parent-supplied
 * `onSetupCogs` to navigate so Dashboard can use App Bridge.
 */

import { Card, BlockStack, Text, Button, InlineStack, Badge, Box } from "@shopify/polaris";
import type { ProfitMetrics } from "@fbc/shared";
import { formatMoney, formatMargin, formatDeltaPct, deltaTone } from "../lib/format.js";

type Props = {
  data: ProfitMetrics | null;
  loading: boolean;
  onSetupCogs: () => void;
};

export function ProfitCards({ data, loading, onSetupCogs }: Props) {
  if (!loading && data && !data.has_any_cogs) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h3" variant="headingMd">
            See profit, not just revenue
          </Text>
          <Text as="p" tone="subdued">
            Add product costs to unlock gross profit, margin, and profit-per-order. Already
            know your typical margin? Set a default to start with estimates today.
          </Text>
          <InlineStack>
            <Button variant="primary" onClick={onSetupCogs}>
              Set up costs
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <InlineStack gap="400" wrap>
        <SkeletonCard label="Gross profit" />
        <SkeletonCard label="Margin %" />
        <SkeletonCard label="Profit per order" />
      </InlineStack>
    );
  }

  const profit = data.gross_profit;
  const margin = data.gross_margin;
  const ppo = data.profit_per_order;
  const profitDelta = data.comparison_delta.gross_profit;
  const marginDeltaPts = data.comparison_delta.gross_margin; // absolute, e.g. +0.05
  const ppoDelta = data.comparison_delta.profit_per_order;

  return (
    <InlineStack gap="400" wrap>
      <Box minWidth="220px">
        <Card>
          <BlockStack gap="200">
            <Text as="span" variant="bodySm" tone="subdued">
              Gross profit
            </Text>
            <Text as="p" variant="heading2xl">
              {formatMoney(profit)}
            </Text>
            <DeltaBadge deltaPct={profitDelta} caption="vs previous period" />
          </BlockStack>
        </Card>
      </Box>
      <Box minWidth="220px">
        <Card>
          <BlockStack gap="200">
            <Text as="span" variant="bodySm" tone="subdued">
              Margin
            </Text>
            <Text as="p" variant="heading2xl">
              {formatMargin(margin)}
            </Text>
            <PointDeltaBadge deltaPts={marginDeltaPts} />
          </BlockStack>
        </Card>
      </Box>
      <Box minWidth="220px">
        <Card>
          <BlockStack gap="200">
            <Text as="span" variant="bodySm" tone="subdued">
              Profit per order
            </Text>
            <Text as="p" variant="heading2xl">
              {formatMoney(ppo)}
            </Text>
            <DeltaBadge deltaPct={ppoDelta} caption="vs previous period" />
          </BlockStack>
        </Card>
      </Box>
    </InlineStack>
  );
}

function SkeletonCard({ label }: { label: string }) {
  return (
    <Box minWidth="220px">
      <Card>
        <BlockStack gap="200">
          <Text as="span" variant="bodySm" tone="subdued">
            {label}
          </Text>
          <Text as="p" variant="heading2xl">
            —
          </Text>
        </BlockStack>
      </Card>
    </Box>
  );
}

function DeltaBadge({ deltaPct, caption }: { deltaPct: number | null; caption: string }) {
  const tone = deltaTone(deltaPct);
  return (
    <InlineStack gap="200" align="start" blockAlign="center">
      <Badge tone={tone === "subdued" ? undefined : tone}>{formatDeltaPct(deltaPct)}</Badge>
      <Text as="span" variant="bodySm" tone="subdued">
        {caption}
      </Text>
    </InlineStack>
  );
}

function PointDeltaBadge({ deltaPts }: { deltaPts: number | null }) {
  if (deltaPts === null || !Number.isFinite(deltaPts)) {
    return (
      <InlineStack gap="200" align="start" blockAlign="center">
        <Badge>—</Badge>
        <Text as="span" variant="bodySm" tone="subdued">
          vs previous period
        </Text>
      </InlineStack>
    );
  }
  const tone = deltaPts > 0 ? "success" : deltaPts < 0 ? "critical" : undefined;
  const sign = deltaPts > 0 ? "+" : "";
  return (
    <InlineStack gap="200" align="start" blockAlign="center">
      <Badge tone={tone}>{`${sign}${(deltaPts * 100).toFixed(1)} pts`}</Badge>
      <Text as="span" variant="bodySm" tone="subdued">
        vs previous period
      </Text>
    </InlineStack>
  );
}
