import { Card, BlockStack, Text, InlineStack, Badge } from "@shopify/polaris";
import { formatDeltaPct, deltaTone } from "../lib/format.js";

type Props = {
  label: string;
  value: string;
  delta: number | null;
  caption?: string;
};

export function MetricCard({ label, value, delta, caption }: Props) {
  const tone = deltaTone(delta);
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="span" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="heading2xl">
          {value}
        </Text>
        <InlineStack gap="200" align="start" blockAlign="center">
          <Badge tone={tone === "subdued" ? undefined : tone}>{formatDeltaPct(delta)}</Badge>
          {caption ? (
            <Text as="span" variant="bodySm" tone="subdued">
              {caption}
            </Text>
          ) : null}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
