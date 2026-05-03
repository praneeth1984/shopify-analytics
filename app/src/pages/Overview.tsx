import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  Page,
  Layout,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Grid,
  InlineStack,
  SkeletonBodyText,
  Spinner,
  Text,
} from "@shopify/polaris";

const GeographyMap = lazy(() => import("../components/geography/GeographyMap.js"));
import type {
  ComparisonMode,
  DateRangePreset,
  OverviewMetrics,
  Plan,
  ProfitMetrics,
} from "@fbc/shared";
import { PRO_MONTHLY_PRICE } from "@fbc/shared";

import { navigate } from "../App.js";
import { MetricCard } from "../components/MetricCard.js";
import { RangePicker } from "../components/RangePicker.js";
import { SectionCard } from "../components/SectionCard.js";
import { SkeletonMetric } from "../components/SkeletonMetric.js";
import { useBilling } from "../hooks/useBilling.js";
import { useCogs } from "../hooks/useCogs.js";
import { useGeography } from "../hooks/useGeography.js";
import { usePreferences } from "../hooks/usePreferences.js";
import { useProfit } from "../hooks/useProfit.js";
import { apiFetch, ApiError } from "../lib/api.js";
import { formatMoney, formatNumber } from "../lib/format.js";

type OverviewResponse = OverviewMetrics & { truncated: boolean };

const COMPARISON: ComparisonMode = "previous_period";

const SECTIONS: ReadonlyArray<{
  id: string;
  title: string;
  href: string;
  ctaLabel: string;
  description: string;
}> = [
  {
    id: "profit",
    title: "Profit",
    href: "/profit",
    ctaLabel: "View profit",
    description: "Gross profit, margin %, P&L, and break-even by date range.",
  },
  {
    id: "products",
    title: "Products",
    href: "/products",
    ctaLabel: "View products",
    description: "Top sellers, returns, inventory at risk, attribution, and bundles.",
  },
  {
    id: "customers",
    title: "Customers",
    href: "/customers",
    ctaLabel: "View customers",
    description: "New vs returning, LTV, retention cohorts, RFM segments, geography.",
  },
  {
    id: "marketing",
    title: "Acquisition",
    href: "/marketing",
    ctaLabel: "View acquisition",
    description: "Discount codes, traffic sources, and abandoned cart recovery.",
  },
  {
    id: "reports",
    title: "Reports",
    href: "/reports",
    ctaLabel: "View reports",
    description: "Order, refund, tax, payout, fulfillment, and tag reports. Plus CSV export.",
  },
  {
    id: "settings",
    title: "Costs & settings",
    href: "/settings",
    ctaLabel: "View settings",
    description: "Per-variant COGS, default margin %, plan and CSV backup.",
  },
];

function buildOverviewUrl(preset: DateRangePreset): string {
  const params = new URLSearchParams({ preset, comparison: COMPARISON });
  return `/api/metrics/overview?${params.toString()}`;
}

function statusFor(
  id: string,
  data: OverviewResponse | null,
  profit: ProfitMetrics | null,
  cogsCount: number | null,
  defaultMarginPct: number | null,
  plan: Plan,
): string | null {
  if (id === "profit") {
    if (!profit) return null;
    const hasDefault = defaultMarginPct !== null && defaultMarginPct > 0;
    if ((cogsCount === 0 || cogsCount === null) && !hasDefault) {
      return "Add product costs to see gross profit. Takes 2 minutes.";
    }
    const marginPct = (profit.gross_margin * 100).toFixed(1);
    return `Margin ${marginPct}% · ${formatMoney(profit.gross_profit)}`;
  }
  if (id === "products") {
    if (!profit) return null;
    const top = profit.top_profitable_products?.[0];
    if (!top) return "No product sales in this range";
    return `Top seller: ${top.title} · ${formatNumber(top.units_sold)} units sold`;
  }
  if (id === "customers") {
    if (!data) return null;
    if (data.unique_customers.current === 0) return "No customers yet in this range";
    const newCount = data.new_customers;
    const returningCount = data.returning_customers;
    if (newCount + returningCount === 0) {
      return `${formatNumber(data.unique_customers.current)} customers this period`;
    }
    return `${formatNumber(newCount)} new · ${formatNumber(returningCount)} returning`;
  }
  if (id === "marketing") {
    if (!data) return null;
    if (data.orders.current === 0) {
      return "No orders to attribute yet — see traffic sources";
    }
    return `${formatNumber(data.orders.current)} orders this period · see which channels drove them`;
  }
  if (id === "reports") {
    return "12 reports available · download any panel as CSV";
  }
  if (id === "settings") {
    if (cogsCount === null) return null;
    const marginPctDisplay = defaultMarginPct !== null
      ? Math.round(defaultMarginPct * 100)
      : 0;
    if (plan === "free") {
      if (cogsCount >= 20) return "20 of 20 SKUs filled — Pro removes the cap";
      return `${cogsCount} of 20 SKUs have costs · default margin ${marginPctDisplay}%`;
    }
    if (cogsCount === 0) {
      return "No product costs set yet — add them to unlock gross profit";
    }
    return `${cogsCount} SKUs have costs · default margin ${marginPctDisplay}%`;
  }
  return null;
}

export function OverviewPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profit = useProfit(preset, COMPARISON);
  const cogs = useCogs();
  const billing = useBilling();
  const geo = useGeography(preset);
  const { preferences, setPreference } = usePreferences();

  const load = useCallback(
    async (p: DateRangePreset) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFetch<OverviewResponse>(buildOverviewUrl(p));
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
    void load(preset);
  }, [load, preset]);

  const reload = useCallback(() => {
    void load(preset);
    void profit.reload();
    void cogs.reload();
  }, [load, preset, profit, cogs]);

  const cogsCount = cogs.meta?.totalCount ?? null;
  const defaultMarginPct = cogs.meta?.defaultMarginPct ?? null;
  const plan: Plan = billing.plan ?? "free";

  const showHistoryClampBanner =
    Boolean(profit.data?.history_clamped_to) && !preferences?.historyClampDismissed;

  const showEmptyOrdersBanner = data?.orders.current === 0 && !loading;

  return (
    <Page
      title="Overview"
      subtitle="How your store is doing today"
      fullWidth
      primaryAction={{
        content: loading || profit.loading ? "Refreshing…" : "Refresh",
        onAction: reload,
        loading: loading || profit.loading,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <InlineStack align="space-between" blockAlign="center" wrap gap="200">
              <Text as="h2" variant="headingLg" visuallyHidden>
                Headline metrics
              </Text>
              <RangePicker value={preset} onChange={setPreset} />
            </InlineStack>

            {error ? (
              <Banner tone="critical" title="Could not load metrics">
                <Text as="p">{error}</Text>
              </Banner>
            ) : null}

            {profit.error ? (
              <Banner tone="critical" title="Could not load profit">
                <Text as="p">{profit.error}</Text>
              </Banner>
            ) : null}

            {data?.truncated ? (
              <Banner tone="info" title="Showing your most recent 2,500 orders">
                <BlockStack gap="200">
                  <Text as="p">
                    Narrow the date range, or upgrade to Pro for unlimited aggregation.
                  </Text>
                  <InlineStack>
                    <Button variant="primary" onClick={() => navigate("/billing")}>
                      {`Upgrade to Pro — ${PRO_MONTHLY_PRICE}/mo`}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Banner>
            ) : null}

            {showHistoryClampBanner ? (
              <Banner
                tone="info"
                title="Profit shown for the last 90 days"
                onDismiss={() => {
                  void setPreference("historyClampDismissed", true);
                }}
              >
                <BlockStack gap="200">
                  <Text as="p">
                    Pro removes the cap so you can compare against last year and any custom range.
                  </Text>
                  <InlineStack>
                    <Button variant="primary" onClick={() => navigate("/billing")}>
                      {`Upgrade to Pro — ${PRO_MONTHLY_PRICE}/mo`}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Banner>
            ) : null}

            {showEmptyOrdersBanner ? (
              <Banner tone="info" title="Your dashboard is ready — make your first sale to see it come alive.">
                <Text as="p">
                  As soon as Shopify records an order, the numbers above will fill in automatically.
                </Text>
              </Banner>
            ) : null}

            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
                {loading || !data ? (
                  <SkeletonMetric />
                ) : (
                  <MetricCard
                    label="Revenue"
                    value={formatMoney(data.revenue.current)}
                    delta={data.revenue.delta_pct}
                  />
                )}
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
                {loading || !data ? (
                  <SkeletonMetric />
                ) : (
                  <MetricCard
                    label="Orders"
                    value={formatNumber(data.orders.current)}
                    delta={data.orders.delta_pct}
                  />
                )}
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
                {loading || !data ? (
                  <SkeletonMetric />
                ) : (
                  <MetricCard
                    label="Average order value"
                    value={formatMoney(data.average_order_value.current)}
                    delta={data.average_order_value.delta_pct}
                  />
                )}
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
                {profit.loading || !profit.data ? (
                  <SkeletonMetric />
                ) : (
                  <MetricCard
                    label="Gross profit"
                    value={formatMoney(profit.data.gross_profit)}
                    delta={profit.data.comparison_delta.gross_profit}
                    caption={`Margin ${(profit.data.gross_margin * 100).toFixed(1)}%`}
                  />
                )}
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
                {profit.loading || !profit.data ? (
                  <SkeletonMetric />
                ) : (
                  <TopProductCard data={profit.data} />
                )}
              </Grid.Cell>
            </Grid>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Where your orders come from</Text>
                  <Button variant="plain" onClick={() => navigate("/customers/geography")}>
                    View full report
                  </Button>
                </InlineStack>

                {geo.loading && (
                  <Box minHeight="300px">
                    <BlockStack align="center" inlineAlign="center">
                      <Spinner size="large" accessibilityLabel="Loading geography data" />
                    </BlockStack>
                  </Box>
                )}

                {!geo.loading && geo.error && (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Could not load geography data.
                  </Text>
                )}

                {!geo.loading && geo.data && geo.data.clusters.length === 0 && (
                  <Box minHeight="120px">
                    <BlockStack align="center" inlineAlign="center">
                      <Text as="p" tone="subdued">
                        No orders with shipping addresses in this period.
                      </Text>
                    </BlockStack>
                  </Box>
                )}

                {!geo.loading && geo.data && geo.data.clusters.length > 0 && (
                  <Suspense
                    fallback={
                      <Box minHeight="300px">
                        <BlockStack align="center" inlineAlign="center">
                          <Spinner size="large" accessibilityLabel="Loading map" />
                        </BlockStack>
                      </Box>
                    }
                  >
                    <GeographyMap
                      clusters={geo.data.clusters}
                      isPro={geo.data.cluster_precision === "grid_0.1deg"}
                    />
                  </Suspense>
                )}

                {!geo.loading && !geo.data && !geo.error && (
                  <SkeletonBodyText lines={6} />
                )}
              </BlockStack>
            </Card>

            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Jump to a section
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Each section drills into one part of your store. Numbers update with the date range above.
              </Text>
            </BlockStack>

            <Grid>
              {SECTIONS.map((s) => (
                <Grid.Cell key={s.id} columnSpan={{ xs: 6, sm: 6, md: 3, lg: 4, xl: 4 }}>
                  <SectionCard
                    title={s.title}
                    description={s.description}
                    status={statusFor(
                      s.id,
                      data,
                      profit.data,
                      cogsCount,
                      defaultMarginPct,
                      plan,
                    )}
                    href={s.href}
                    ctaLabel={s.ctaLabel}
                  />
                </Grid.Cell>
              ))}
            </Grid>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function TopProductCard({ data }: { data: ProfitMetrics }) {
  const top = data.top_profitable_products?.[0];
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">
          Top product
        </Text>
        {top ? (
          <>
            <Text as="p" variant="headingMd" truncate>
              {top.title}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {`${formatNumber(top.units_sold)} units · ${formatMoney(top.gross_profit)} profit`}
            </Text>
          </>
        ) : (
          <>
            <Text as="p" variant="headingMd">
              No sales yet
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Try expanding the date range
            </Text>
          </>
        )}
      </BlockStack>
    </Card>
  );
}
