import { useState } from "react";
import { BlockStack, Card, InlineStack, Page, Text } from "@shopify/polaris";
import type { DateRangePreset } from "@fbc/shared";
import { RangePicker } from "../../components/RangePicker.js";
import { TopReturnedProducts } from "../../components/TopReturnedProducts.js";
import { ReturnReasonsBreakdown } from "../../components/ReturnReasonsBreakdown.js";
import { ReturnResolution } from "../../components/ReturnResolution.js";

export function ProductReturnsPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");

  return (
    <Page title="Returns" subtitle="Which products get returned, why, and how refunds resolve.">
      <BlockStack gap="400">
        <Card>
          <InlineStack align="end">
            <RangePicker value={preset} onChange={setPreset} />
          </InlineStack>
        </Card>

        <TopReturnedProducts preset={preset} />

        <InlineStack gap="400" align="start" wrap>
          <div style={{ flex: "1 1 300px" }}>
            <ReturnReasonsBreakdown preset={preset} />
          </div>
          <div style={{ flex: "1 1 300px" }}>
            <ReturnResolution preset={preset} />
          </div>
        </InlineStack>

        <Text as="p" variant="bodySm" tone="subdued">
          Return rate and refund data reflects orders in the selected date range.
          Returns history is capped at 90 days on the Free plan.
        </Text>
      </BlockStack>
    </Page>
  );
}
