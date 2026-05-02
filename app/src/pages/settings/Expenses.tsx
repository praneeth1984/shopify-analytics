import { BlockStack, Text } from "@shopify/polaris";
import { ExpensesCard } from "../../components/ExpensesCard.js";

export function ExpensesSettingsTab() {
  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued">
        Track monthly marketing and ad spend so the P&L Report can calculate your net profit.
      </Text>
      <ExpensesCard />
    </BlockStack>
  );
}
