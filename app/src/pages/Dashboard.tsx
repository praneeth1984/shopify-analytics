import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Grid,
  InlineStack,
  Layout,
  SkeletonBodyText,
  Card,
  Text,
  TextField,
} from "@shopify/polaris";
import type { ComparisonMode, DateRangePreset, OverviewMetrics } from "@fbc/shared";

import { navigate } from "../App.js";

import { MetricCard } from "../components/MetricCard.js";
import { RangePicker } from "../components/RangePicker.js";
import { ComparisonPicker } from "../components/ComparisonPicker.js";
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
import { SavedViewsButton } from "../components/SavedViewsButton.js";
import { apiFetch, ApiError } from "../lib/api.js";
import { formatMoney, formatNumber } from "../lib/format.js";

const RevenueOrdersChart = lazy(() => import("../components/charts/RevenueOrdersChart.js"));
const SalesByDowChart = lazy(() => import("../components/charts/SalesByDowChart.js"));
const MarginTrendChart = lazy(() => import("../components/charts/MarginTrendChart.js"));
const ReturnRateTrendChart = lazy(() => import("../components/charts/ReturnRateTrendChart.js"));
const ReturnReasonsDonut = lazy(() => import("../components/charts/ReturnReasonsDonut.js"));

type OverviewResponse = OverviewMetrics & { truncated: boolean };

type Props = {
  onNavigateToSettings: () => void;
};

function comparisonCaption(mode: ComparisonMode): string {
  if (mode === "previous_year") return "vs. same period last year";
  if (mode === "none") return "";
  return "vs. previous period";
}

function buildOverviewUrl(
  preset: DateRangePreset,
  comparison: ComparisonMode,
  customStart: string,
  customEnd: string,
  tags: string[],
): string {
  const params = new URLSearchParams({ preset, comparison });
  if (preset === "custom" && customStart && customEnd) {
    params.set("start", customStart);
    params.set("end", customEnd);
  }
  if (tags.length > 0) params.set("tags", tags.join(","));
  return `/api/metrics/overview?${params.toString()}`;
}

export function Dashboard({ onNavigateToSettings }: Props) {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [comparison, setComparison] = useState<ComparisonMode>("previous_period");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [tagInput, setTagInput] = useState<string>("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustomReady = preset !== "custom" || (customStart !== "" && customEnd !== "");

  function applyTags() {
    const tags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);
    setActiveTags(tags);
  }

  function clearTags() {
    setTagInput("");
    setActiveTags([]);
  }

  const profit = useProfit(preset, comparison, customStart, customEnd);
  const returnReasons = useReturnReasons(preset);
  const currencyCode = data?.revenue.current.currency_code ?? "USD";
  const caption = comparisonCaption(comparison);

  const load = useCallback(
    async (p: DateRangePreset, c: ComparisonMode, start: string, end: string, tags: string[]) => {
      if (p === "custom" && (!start || !end)) return;
      setLoading(true);
      setError(null);
      try {
        const result = await apiFetch<OverviewResponse>(buildOverviewUrl(p, c, start, end, tags));
        setData(result);
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "Could not load metrics.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(preset, comparison, customStart, customEnd, activeTags);
  }, [load, preset, comparison, customStart, customEnd, activeTags]);

  return (
    <Layout>
      <Layout.Section>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center" gap="200" wrap>
            <InlineStack gap="300" blockAlign="center">
              <Text as="h2" variant="headingLg">
                Overview
              </Text>
              <SavedViewsButton />
            </InlineStack>
            <InlineStack gap="200" blockAlign="center" wrap>
              <RangePicker value={preset} onChange={setPreset} />
              {preset === "custom" && (
                <>
                  <TextField
                    label="From"
                    labelHidden
                    type="date"
                    value={customStart}
                    onChange={setCustomStart}
                    autoComplete="off"
                  />
                  <TextField
                    label="To"
                    labelHidden
                    type="date"
                    value={customEnd}
                    onChange={setCustomEnd}
                    autoComplete="off"
                  />
                </>
              )}
              <ComparisonPicker value={comparison} onChange={setComparison} />
            </InlineStack>
          </InlineStack>

          <InlineStack gap="200" blockAlign="end">
            <Box minWidth="200px">
              <TextField
                label="Filter by tags"
                labelHidden
                placeholder="e.g. wholesale, vip (comma-separated)"
                value={tagInput}
                onChange={setTagInput}
                autoComplete="off"
                connectedRight={
                  <Button onClick={applyTags} variant="secondary">Filter</Button>
                }
              />
            </Box>
            {activeTags.length > 0 && (
              <Button onClick={clearTags} variant="plain" tone="critical">
                {`Clear filter (${activeTags.join(", ")})`}
              </Button>
            )}
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
              <BlockStack gap="200">
                <Text as="p">
                  Profit history is capped at 90 days on the Free plan. Upgrade to Pro for
                  unlimited history.
                </Text>
                <InlineStack>
                  <Button variant="plain" onClick={() => navigate("/billing")}>
                    Upgrade to Pro
                  </Button>
                </InlineStack>
              </BlockStack>
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
              {loading || !data || !isCustomReady ? (
                <SkeletonCard label="Revenue" />
              ) : (
                <BlockStack gap="100">
                  <MetricCard
                    label="Revenue"
                    value={formatMoney(data.revenue.current)}
                    delta={comparison !== "none" ? data.revenue.delta_pct : null}
                    caption={caption}
                  />
                  <PendingReturnsHint
                    count={data.pending_returns?.count ?? 0}
                    value={data.pending_returns?.value ?? null}
                  />
                </BlockStack>
              )}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
              {loading || !data || !isCustomReady ? (
                <SkeletonCard label="Orders" />
              ) : (
                <MetricCard
                  label="Orders"
                  value={formatNumber(data.orders.current)}
                  delta={comparison !== "none" ? data.orders.delta_pct : null}
                  caption={caption}
                />
              )}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
              {loading || !data || !isCustomReady ? (
                <SkeletonCard label="Average order value" />
              ) : (
                <MetricCard
                  label="Average order value"
                  value={formatMoney(data.average_order_value.current)}
                  delta={comparison !== "none" ? data.average_order_value.delta_pct : null}
                  caption={caption}
                />
              )}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
              {loading || !data || !isCustomReady ? (
                <SkeletonCard label="Unique customers" />
              ) : (
                <MetricCard
                  label="Unique customers"
                  value={formatNumber(data.unique_customers.current)}
                  delta={comparison !== "none" ? data.unique_customers.delta_pct : null}
                  caption={caption}
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
