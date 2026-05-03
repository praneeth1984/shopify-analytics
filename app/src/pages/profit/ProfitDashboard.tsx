import { useState } from "react";
import { BlockStack, Card, InlineStack, Banner, Button, Text } from "@shopify/polaris";
import type { DateRangePreset, ComparisonMode } from "@fbc/shared";
import { useProfit } from "../../hooks/useProfit.js";
import { ProfitCards } from "../../components/ProfitCards.js";
import { TopProfitableProducts } from "../../components/TopProfitableProducts.js";
import { CogsCoverageBanner } from "../../components/CogsCoverageBanner.js";
import { RangePicker } from "../../components/RangePicker.js";
import { ComparisonPicker } from "../../components/ComparisonPicker.js";
import { navigate } from "../../App.js";

type Props = {
  onSetupCogs: () => void;
};

export function ProfitDashboard({ onSetupCogs }: Props) {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [comparison, setComparison] = useState<ComparisonMode>("previous_period");
  const profit = useProfit(preset, comparison);

  return (
    <BlockStack gap="400">
      <Card>
        <InlineStack gap="200" wrap>
          <RangePicker value={preset} onChange={setPreset} />
          <ComparisonPicker value={comparison} onChange={setComparison} />
        </InlineStack>
      </Card>

      {profit.error && (
        <Banner tone="critical" title="Failed to load profit data">
          <Text as="p">{profit.error}</Text>
        </Banner>
      )}

      {profit.data?.history_clamped_to && (
        <Banner tone="info" title="Showing last 90 days (Free plan)">
          <InlineStack gap="200" blockAlign="center">
            <Text as="p">Upgrade to Pro for unlimited profit history.</Text>
            <Button variant="plain" onClick={() => navigate("/billing")}>Upgrade</Button>
          </InlineStack>
        </Banner>
      )}

      {profit.data?.cogs_coverage && (
        <CogsCoverageBanner coverage={profit.data.cogs_coverage} onSetupCogs={onSetupCogs} />
      )}

      <ProfitCards data={profit.data} loading={profit.loading} onSetupCogs={onSetupCogs} />

      {(profit.loading || (profit.data?.top_profitable_products?.length ?? 0) > 0) && (
        <TopProfitableProducts
          products={profit.data?.top_profitable_products ?? []}
          loading={profit.loading}
        />
      )}
    </BlockStack>
  );
}
