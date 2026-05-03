import { useEffect, useState } from "react";
import {
  Banner, BlockStack, Box, Button, Card, DataTable, EmptyState,
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

function getCurrentShop(): string | null {
  if (typeof window === "undefined") return null;
  return window.shopify?.config?.shop ?? null;
}

function startReauth() {
  const shop = getCurrentShop();
  if (!shop) return;
  if (typeof window !== "undefined" && window.top) {
    window.top.location.href = `/auth/install?shop=${encodeURIComponent(shop)}`;
  }
}

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
          <>
            <Banner tone="warning" title="Abandoned cart tracking needs a quick permission update">
              <BlockStack gap="200">
                <Text as="p">
                  To show abandoned checkouts we need one extra permission. Click below to authorise — it takes 5 seconds.
                </Text>
                <Box>
                  <Button variant="primary" onClick={startReauth}>
                    Enable abandoned cart tracking
                  </Button>
                </Box>
              </BlockStack>
            </Banner>
            <Card>
              <EmptyState
                heading="Abandoned cart data is one click away"
                image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E"
                action={{
                  content: "Enable abandoned cart tracking",
                  onAction: startReauth,
                }}
              >
                <p>
                  We need the <strong>read_checkouts</strong> permission to show you which checkouts
                  were started but not completed, the products inside them, and how much revenue was
                  left on the table.
                </p>
              </EmptyState>
            </Card>
          </>
        )}

        {!data?.scope_missing && (
          <>
            <RangePicker value={preset} onChange={setPreset} />

            {data?.historyClampedTo && (
              <Banner tone="info" title="Free plan: showing last 30 days">
                <Text as="p" variant="bodySm">Upgrade to Pro for full history.</Text>
              </Banner>
            )}

            {error && (
              <Banner tone="critical" title="Could not load abandoned cart data">
                <Text as="p">{error}</Text>
              </Banner>
            )}

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
