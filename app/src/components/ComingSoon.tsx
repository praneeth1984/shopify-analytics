import { EmptyState, Badge, BlockStack, Text } from "@shopify/polaris";

type Props = {
  feature: string;
  phase?: "Phase 2" | "Phase 3";
};

export function ComingSoon({ feature, phase = "Phase 2" }: Props) {
  return (
    <EmptyState heading={feature} image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E">
      <BlockStack gap="200">
        <Badge>{phase}</Badge>
        <Text as="p" tone="subdued">
          This feature is coming soon. We are building it for a future release.
        </Text>
      </BlockStack>
    </EmptyState>
  );
}
