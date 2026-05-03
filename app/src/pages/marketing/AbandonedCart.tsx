import { useEffect, useState } from "react";
import {
  Banner, BlockStack, Box, Card, DataTable,
  Page, SkeletonBodyText, Text,
} from "@shopify/polaris";
import type { DateRangePreset } from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney } from "../../lib/format.js";
import { RangePicker } from "../../components/RangePicker.js";

type AbandonedCartReport =
  | { scope_missing: true }
  | {
      scope_missing: false;
      checkoutsInitiated: number;
      checkoutsCompleted: number;
      checkoutsAbandoned: number;
      abandonmentRate: number;
      estimatedLostRevenueAmount: string;
      estimatedLostRevenueCurrency: string;
      dailySeries: Array<{ date: string; abandoned: number; rate: number }>;
      topAbandonedProducts: Array<{ productTitle: string; count: number }>;
      plan: string;
      historyClampedTo: string | null;
    };

export function AbandonedCartPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [data, setData] = useState<AbandonedCartReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<AbandonedCartReport>(`/api/metrics/abandoned-cart?preset=${preset}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [preset]);

  return (
    <Page title="Abandoned Cart">
      <BlockStack gap="400">
        {data?.scope_missing && (
          <Banner tone="warning" title="Checkout permission not enabled">
            <Text as="p" variant="bodySm">
              Abandoned cart tracking requires the <strong>read_checkouts</strong> scope.
              Reinstall the app to enable this report.
            </Text>
          </Banner>
        )}

        {!data?.scope_missing && (
          <>
            <RangePicker value={preset} onChange={setPreset} />

            {data?.historyClampedTo && (
              <Banner tone="info">
                <Text as="p" variant="bodySm">Free plan: showing last 30 days. Upgrade to Pro for full history.</Text>
              </Banner>
            )}

            {error && <Banner tone="critical"><Text as="p">{error}</Text></Banner>}

            {loading && <Card><SkeletonBodyText lines={5} /></Card>}

            {!loading && data && !data.scope_missing && (
              <>
                <Card>
                  <BlockStack gap="300">
                    <StatRow label="Checkouts initiated" value={String(data.checkoutsInitiated)} />
                    <StatRow label="Completed" value={String(data.checkoutsCompleted)} />
                    <StatRow label="Abandoned" value={String(data.checkoutsAbandoned)} />
                    <StatRow label="Abandonment rate" value={`${(data.abandonmentRate * 100).toFixed(1)}%`} />
                    <StatRow
                      label="Est. lost revenue"
                      value={formatMoney({ amount: data.estimatedLostRevenueAmount, currency_code: data.estimatedLostRevenueCurrency })}
                    />
                  </BlockStack>
                </Card>

                {data.topAbandonedProducts.length > 0 && (
                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Top Abandoned Products</Text>
                      <DataTable
                        columnContentTypes={["text", "numeric"]}
                        headings={["Product", "Abandoned count"]}
                        rows={data.topAbandonedProducts.map((p) => [p.productTitle, p.count])}
                      />
                    </BlockStack>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </BlockStack>
    </Page>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="p" variant="bodyMd" fontWeight="semibold">{value}</Text>
    </Box>
  );
}
