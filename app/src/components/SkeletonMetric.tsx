import { Card, BlockStack, SkeletonDisplayText, SkeletonBodyText } from "@shopify/polaris";

export function SkeletonMetric() {
  return (
    <Card>
      <BlockStack gap="200">
        <SkeletonDisplayText size="small" />
        <SkeletonBodyText lines={1} />
      </BlockStack>
    </Card>
  );
}
