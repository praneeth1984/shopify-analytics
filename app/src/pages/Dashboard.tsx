import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Grid,
  InlineStack,
  Layout,
  SkeletonBodyText,
  Card,
  Text,
} from "@shopify/polaris";
import type { DateRangePreset, OverviewMetrics } from "@fbc/shared";

import { MetricCard } from "../components/MetricCard.js";
import { RangePicker } from "../components/RangePicker.js";
import { ProfitCards } from "../components/ProfitCards.js";
import { TopProfitableProducts } from "../components/TopProfitableProducts.js";
import { CogsCoverageBanner } from "../components/CogsCoverageBanner.js";
import { PendingReturnsHint } from "../components/PendingReturnsHint.js";
import { TopReturnedProducts } from "../components/TopReturnedProducts.js";
import { ReturnReasonsBreakdown } from "../components/ReturnReasonsBreakdown.js";
import { ReturnResolution } from "../components/ReturnResolution.js";
import { ChartSkeleton } from "../components/charts/ChartSkeleton.js";
import { useProfit } from "../hooks/useProfit.js";
import { useReturnReasons } from "../hooks/useReturnReasons.js";
import { apiFetch, ApiError } from "../lib/api.js";
import { formatMoney, formatNumber } from "../lib/format.js";

// Lazy-load chart components so the recharts bundle isn't pulled into the
// initial dashboard render. Each chart is wrapped in a Suspense boundary
// below so the page renders metric cards immediately.
const RevenueOrdersChart = lazy(() => import("../components/charts/RevenueOrdersChart.js"));
const SalesByDowChart = lazy(() => import("../components/charts/SalesByDowChart.js"));
const MarginTrendChart = lazy(() => import("../components/charts/MarginTrendChart.js"));
const ReturnRateTrendChart = lazy(() => import("../components/charts/ReturnRateTrendChart.js"));
const ReturnReasonsDonut = lazy(() => import("../components/charts/ReturnReasonsDonut.js"));

type OverviewResponse = OverviewMetrics & { truncated: boolean };

type Props = {
  onNavigateToSettings: () => void;
};

export function Dashboard({ onNavigateToSettings }: Props) {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profit = useProfit(preset, "previous_period");
  const returnReasons = useReturnReasons(preset);
  const currencyCode = data?.revenue.current.currency_code ?? "USD";

  const load = useCallback(async (p: DateRangePreset) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<OverviewResponse>(
        `/api/metrics/overview?preset=${encodeURIComponent(p)}&comparison=previous_period`,
      );
      setData(result);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load metrics.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(preset);
  }, [load, preset]);

  return (
    <Layout>
      <Layout.Section>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h2" variant="headingLg">
              Overview
            </Text>
            <RangePicker value={preset} onChange={setPreset} />
          </InlineStack>

          {error ? (
            <Banner tone="critical" title="Could not load metrics">
              <p>{error}</p>
            </Banner>
          ) : null}

          {profit.error ? (
            <Banner tone="critical" title="Could not load profit">
              <p>{profit.error}</p>
            </Banner>
          ) : null}

          {profit.data?.history_clamped_to ? (
            <Banner tone="info" title="Showing the last 90 days on Free">
              <p>
                Profit history is capped at 90 days on the Free plan. Upgrade to Pro for
                unlimited history.
              </p>
            </Banner>
          ) : null}

          {data?.truncated ? (
            <Banner tone="info" title="Showing partial results">
              <p>
                This range exceeds our quick-aggregation window. We're showing the most recent
                portion. We'll switch to a full background aggregation in an upcoming release.
              </p>
            </Banner>
          ) : null}

          {profit.data ? (
            <CogsCoverageBanner
              coverage={profit.data.cogs_coverage}
              onSetupCogs={onNavigateToSettings}
            />
          ) : null}

          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
              {loading || !data ? (
                <SkeletonCard label="Revenue" />
              ) : (
                <BlockStack gap="100">
                  <MetricCard
                    label="Revenue"
                    value={formatMoney(data.revenue.current)}
                    delta={data.revenue.delta_pct}
                    caption="vs previous period"
                  />
                  <PendingReturnsHint
                    count={data.pending_returns?.count ?? 0}
                    value={data.pending_returns?.value ?? null}
                  />
                </BlockStack>
              )}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
              {loading || !data ? (
                <SkeletonCard label="Orders" />
              ) : (
                <MetricCard
                  label="Orders"
                  value={formatNumber(data.orders.current)}
                  delta={data.orders.delta_pct}
                  caption="vs previous period"
                />
              )}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
              {loading || !data ? (
                <SkeletonCard label="Average order value" />
              ) : (
                <MetricCard
                  label="Average order value"
                  value={formatMoney(data.average_order_value.current)}
                  delta={data.average_order_value.delta_pct}
                  caption="vs previous period"
                />
              )}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
              {loading || !data ? (
                <SkeletonCard label="Unique customers" />
              ) : (
                <MetricCard
                  label="Unique customers"
                  value={formatNumber(data.unique_customers.current)}
                  delta={data.unique_customers.delta_pct}
                  caption="vs previous period"
                />
              )}
            </Grid.Cell>
          </Grid>

          {data ? (
            <Suspense fallback={<ChartSkeleton />}>
              <RevenueOrdersChart data={data} currencyCode={currencyCode} />
            </Suspense>
          ) : (
            <ChartSkeleton />
          )}

          {data ? (
            <Suspense fallback={<ChartSkeleton />}>
              <SalesByDowChart data={data.revenue_by_dow} currencyCode={currencyCode} />
            </Suspense>
          ) : null}

          <BlockStack gap="200">
            <Text as="h2" variant="headingLg">
              Profit
            </Text>
            <ProfitCards
              data={profit.data}
              loading={profit.loading}
              onSetupCogs={onNavigateToSettings}
            />
          </BlockStack>

          {profit.data ? (
            <Suspense fallback={<ChartSkeleton />}>
              <MarginTrendChart data={profit.data} />
            </Suspense>
          ) : null}

          <TopProfitableProducts
            products={profit.data?.top_profitable_products ?? []}
            loading={profit.loading}
          />

          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              Returns
            </Text>
            {data ? (
              <Suspense fallback={<ChartSkeleton />}>
                <ReturnRateTrendChart series={data.return_rate_series} />
              </Suspense>
            ) : null}
            <TopReturnedProducts preset={preset} />
            <ReturnReasonsBreakdown
              preset={preset}
              data={returnReasons.data}
              loading={returnReasons.loading}
              error={returnReasons.error}
            />
            {returnReasons.data && returnReasons.data.reasons.length > 0 ? (
              <Suspense fallback={<ChartSkeleton />}>
                <ReturnReasonsDonut reasons={returnReasons.data.reasons} />
              </Suspense>
            ) : null}
            <ReturnResolution preset={preset} />
          </BlockStack>
        </BlockStack>
      </Layout.Section>
    </Layout>
  );
}

function SkeletonCard({ label }: { label: string }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="span" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Box minHeight="48px">
          <SkeletonBodyText lines={2} />
        </Box>
      </BlockStack>
    </Card>
  );
}
