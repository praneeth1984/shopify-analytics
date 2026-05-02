import { EmptyState, Badge, BlockStack, Text } from "@shopify/polaris";

type Props = {
  feature: string;
  phase?: "Phase 2" | "Phase 3";
};

export function ComingSoon({ feature, phase = "Phase 2" }: Props) {
  return (
    <EmptyState heading={feature} image="">
      <BlockStack gap="200">
        <Badge>{phase}</Badge>
        <Text as="p" tone="subdued">
          This feature is coming soon. We are building it for a future release.
        </Text>
      </BlockStack>
    </EmptyState>
  );
}
