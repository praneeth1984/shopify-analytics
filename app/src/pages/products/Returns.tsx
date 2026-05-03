import { useState } from "react";
import { BlockStack, Grid, Page, Text } from "@shopify/polaris";
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
        <RangePicker value={preset} onChange={setPreset} />

        <TopReturnedProducts preset={preset} />

        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
            <ReturnReasonsBreakdown preset={preset} />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
            <ReturnResolution preset={preset} />
          </Grid.Cell>
        </Grid>

        <Text as="p" variant="bodySm" tone="subdued">
          Return rate and refund data reflects orders in the selected date range.
          Returns history is capped at 90 days on the Free plan.
        </Text>
      </BlockStack>
    </Page>
  );
}
