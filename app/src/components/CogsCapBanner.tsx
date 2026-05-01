/**
 * Informational banner shown when the merchant has used >= their COGS cap on
 * Free. Per the architect's spec this is informational only — never a modal,
 * never blocks editing existing entries.
 */

import { Banner, Text } from "@shopify/polaris";
import type { Plan } from "@fbc/shared";

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
      <Text as="p">
        Existing costs keep working and your profit numbers stay accurate. To add costs for
        more products, upgrade to Pro for unlimited SKUs and full history.
      </Text>
    </Banner>
  );
}
