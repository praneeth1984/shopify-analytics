/**
 * Small Polaris sub-line shown beneath a metric card (typically Revenue) when
 * there are pending returns that have not yet been refunded. Renders nothing
 * when count is zero so the layout doesn't reserve space.
 */

import { Text } from "@shopify/polaris";
import type { Money } from "@fbc/shared";
import { formatMoney } from "../lib/format.js";

type Props = {
  count: number;
  value: Money | null;
};

export function PendingReturnsHint({ count, value }: Props) {
  if (count <= 0) return null;
  const valuePart = value ? ` (${formatMoney(value)})` : "";
  const noun = count === 1 ? "pending return" : "pending returns";
  return (
    <Text as="span" variant="bodySm" tone="subdued">
      {`${count.toLocaleString()} ${noun} not yet refunded${valuePart}`}
    </Text>
  );
}
