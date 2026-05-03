/**
 * Informational banner shown when the merchant has used >= their COGS cap on
 * Free. Per the architect's spec this is informational only — never a modal,
 * never blocks editing existing entries.
 */

import { Banner, BlockStack, Button, InlineStack, Text } from "@shopify/polaris";
import type { Plan } from "@fbc/shared";
import { PRO_MONTHLY_PRICE } from "@fbc/shared";
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
    <Banner
      tone="info"
      title={`You've added costs for ${used} of ${cap} products on the Free plan`}
    >
      <BlockStack gap="200">
        <Text as="p">
          Pro removes the cap so you can track costs for every variant.
        </Text>
        <InlineStack>
          <Button variant="primary" onClick={() => navigate("/billing")}>
            {`Upgrade to Pro — ${PRO_MONTHLY_PRICE}/mo`}
          </Button>
        </InlineStack>
      </BlockStack>
    </Banner>
  );
}
