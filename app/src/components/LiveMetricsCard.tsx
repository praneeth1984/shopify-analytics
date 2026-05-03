/**
 * F42 — Live "Today so far" metrics.
 *
 * Polls /api/metrics/live every 5 minutes. The endpoint is not gated by plan
 * and always returns the trailing 24 hours, so we render the card unconditionally
 * at the top of the dashboard.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  SkeletonBodyText,
} from "@shopify/polaris";
import type { LiveMetrics } from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";
import { formatMoney, formatNumber } from "../lib/format.js";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function formatLastUpdated(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function LiveMetricsCard() {
  const [data, setData] = useState<LiveMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<LiveMetrics>("/api/metrics/live");
      setData(result);
      setError(null);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load live metrics.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h3" variant="headingMd">Today so far</Text>
          <SkeletonBodyText lines={2} />
        </BlockStack>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h3" variant="headingMd">Today so far</Text>
          <Text as="p" tone="critical">{error}</Text>
        </BlockStack>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text as="h3" variant="headingMd">Today so far</Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {`Last updated ${formatLastUpdated(data.as_of)}`}
          </Text>
        </InlineStack>
        <InlineStack gap="800" wrap>
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">Revenue</Text>
            <Text as="p" variant="headingLg">{formatMoney(data.gross_revenue)}</Text>
          </BlockStack>
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">Orders</Text>
            <Text as="p" variant="headingLg">{formatNumber(data.orders)}</Text>
          </BlockStack>
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">AOV</Text>
            <Text as="p" variant="headingLg">{formatMoney(data.aov)}</Text>
          </BlockStack>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
