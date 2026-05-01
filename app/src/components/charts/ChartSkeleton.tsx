/**
 * Loading placeholder for lazy-loaded chart components. Uses the same Polaris
 * Card chrome as ChartCard so the layout doesn't reflow when the real chart
 * mounts.
 */

import { Box, Card, SkeletonBodyText } from "@shopify/polaris";

export function ChartSkeleton() {
  return (
    <Card>
      <Box minHeight="320px">
        <SkeletonBodyText lines={8} />
      </Box>
    </Card>
  );
}
