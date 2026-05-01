/**
 * R-RET-3 frontend: why customers return.
 *
 * Fetches GET /api/metrics/returns/reasons. For each reason renders the label,
 * a Polaris ProgressBar showing pct_of_returns, and the unit count. Empty
 * state explains the data source so merchants understand why a reason might
 * be missing.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Card,
  EmptyState,
  InlineStack,
  ProgressBar,
  SkeletonBodyText,
  Text,
} from "@shopify/polaris";
import type { DateRangePreset, ReturnReasonsResponse } from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";
import { formatNumber } from "../lib/format.js";

type Props = {
  preset: DateRangePreset;
};

export function ReturnReasonsBreakdown({ preset }: Props) {
  const [data, setData] = useState<ReturnReasonsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<ReturnReasonsResponse>(
        `/api/metrics/returns/reasons?preset=${encodeURIComponent(preset)}`,
      );
      setData(result);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load return reasons.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Why customers return
        </Text>

        {error ? (
          <Banner tone="critical" title="Could not load return reasons">
            <p>{error}</p>
          </Banner>
        ) : null}

        {data?.history_clamped_to ? (
          <Banner tone="info" title="Showing the last 90 days on Free">
            <p>
              Returns history is capped at 90 days on the Free plan. Upgrade to Pro for unlimited
              history.
            </p>
          </Banner>
        ) : null}

        {loading || !data ? (
          <Box minHeight="120px">
            <SkeletonBodyText lines={5} />
          </Box>
        ) : data.reasons.length === 0 ? (
          <EmptyState heading="No return reasons recorded yet." image="" fullWidth>
            <p>
              Reasons appear when customers submit returns through Shopify's self-serve portal.
            </p>
          </EmptyState>
        ) : (
          <BlockStack gap="300">
            {data.reasons.map((row) => {
              const pct = Math.max(0, Math.min(1, row.pct_of_returns));
              return (
                <BlockStack key={row.code} gap="100">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="span" fontWeight="medium">
                      {row.label}
                    </Text>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {`${formatNumber(row.units)} units · ${(pct * 100).toFixed(1)}%`}
                    </Text>
                  </InlineStack>
                  <ProgressBar progress={pct * 100} size="small" tone="primary" />
                </BlockStack>
              );
            })}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
