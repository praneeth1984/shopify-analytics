/**
 * Informational banner shown on the Dashboard when COGS coverage < 100%.
 * Per the architect's design we are explicit about which line items are
 * estimated (default margin) vs missing (no contribution to profit) so the
 * merchant can decide whether to refine.
 */

import { Banner, Text, BlockStack, Button } from "@shopify/polaris";
import type { CogsCoverage } from "@fbc/shared";

type Props = {
  coverage: CogsCoverage;
  onSetupCogs: () => void;
};

export function CogsCoverageBanner({ coverage, onSetupCogs }: Props) {
  const total = coverage.lineItemsTotal;
  if (total === 0) return null;
  const explicit = coverage.lineItemsWithExplicitCogs;
  const fullyCovered = explicit === total;
  if (fullyCovered) return null;

  const missing = coverage.lineItemsWithoutAnyCost;
  const estimated = coverage.lineItemsUsingDefaultMargin;
  const explicitPct = Math.round((explicit / total) * 100);

  const action = (
    <Button onClick={onSetupCogs} variant="plain">
      Add costs in Settings
    </Button>
  );

  return (
    <Banner tone="info" title={`Profit shown for ${explicitPct}% of line items with explicit cost`}>
      <BlockStack gap="100">
        <Text as="p">
          {estimated > 0
            ? `${estimated.toLocaleString()} line item${estimated === 1 ? "" : "s"} estimated using your default margin.`
            : null}
        </Text>
        {missing > 0 ? (
          <Text as="p">
            {missing.toLocaleString()} line item{missing === 1 ? "" : "s"} have no cost or default
            margin and aren't contributing to gross profit yet.
          </Text>
        ) : null}
        {action}
      </BlockStack>
    </Banner>
  );
}
