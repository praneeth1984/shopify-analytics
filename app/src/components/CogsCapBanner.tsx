/**
 * Informational banner shown when the merchant has used >= their COGS cap on
 * Free. Per the architect's spec this is informational only — never a modal,
 * never blocks editing existing entries.
 */

import { Banner, BlockStack, Button, InlineStack, Text } from "@shopify/polaris";
import type { Plan } from "@fbc/shared";
import { navigate } from "../App.js";

type Props = {
  plan: Plan;
  used: number;
  cap: number;
};

export function CogsCapBanner({ plan, used, cap }: Props) {
  if (plan !== "free") return null;
  if (!Number.isFinite(cap)) return null;
  if (used < cap) return null;

  return (
    <Banner tone="info" title={`You've reached ${cap} of ${cap} costs on the Free plan`}>
      <BlockStack gap="200">
        <Text as="p">
          Existing costs keep working and your profit numbers stay accurate. To add costs for
          more products, upgrade to Pro for unlimited SKUs and full history.
        </Text>
        <InlineStack>
          <Button variant="primary" onClick={() => navigate("/billing")}>
            View plans
          </Button>
        </InlineStack>
      </BlockStack>
    </Banner>
  );
}
