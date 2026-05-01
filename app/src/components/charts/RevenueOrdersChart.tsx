/**
 * Revenue (left axis) + Orders (right axis) over time, with optional dashed
 * previous-period overlay. Money values arrive as minor units in
 * `revenue_series.value`; we divide by 100 only when formatting tick labels
 * and tooltips so all internal math stays in integer minor units.
 *
 * Accessibility: the chart is wrapped in a <div role="img"> with a descriptive
 * aria-label, and a Collapsible data table is rendered below for screen
 * readers and keyboard users (BFS requirement).
 */

import { useMemo, useState } from "react";
import {
  Bleed,
  BlockStack,
  Box,
  Button,
  Collapsible,
  DataTable,
  InlineStack,
  Text,
} from "@shopify/polaris";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type { Money, OverviewMetrics, TimeSeriesPoint } from "@fbc/shared";
import { ChartCard } from "./ChartCard.js";
import { useChartTheme } from "../../lib/chart-theme.js";
import { formatMoney, formatNumber } from "../../lib/format.js";

type Props = {
  data: OverviewMetrics;
  currencyCode: string;
};

type Row = {
  date: string;
  revenue: number | null; // major units (e.g. dollars), or null when no value
  orders: number | null;
  revenuePrev: number | null;
  ordersPrev: number | null;
};

function toMajor(minor: number | null): number | null {
  if (minor == null) return null;
  return minor / 100;
}

function asMoney(major: number | null, code: string): Money | null {
  if (major == null) return null;
  return { amount: major.toFixed(2), currency_code: code };
}

function tickEvery<T>(arr: T[], n: number): (T | "")[] {
  return arr.map((v, i) => (i % n === 0 ? v : ""));
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function RevenueOrdersChart({ data, currencyCode }: Props) {
  const theme = useChartTheme();
  const [tableOpen, setTableOpen] = useState(false);
  const reducedMotion = prefersReducedMotion();

  const rows = useMemo<Row[]>(() => {
    const rev = data.revenue_series;
    const ord = data.orders_series;
    const revPrev: TimeSeriesPoint[] | undefined = data.revenue_series_previous;
    const ordPrev: TimeSeriesPoint[] | undefined = data.orders_series_previous;
    return rev.map((p, i) => ({
      date: p.date,
      revenue: toMajor(p.value),
      orders: ord[i]?.value ?? null,
      revenuePrev: toMajor(revPrev?.[i]?.value ?? null),
      ordersPrev: ordPrev?.[i]?.value ?? null,
    }));
  }, [data]);

  // For dense ranges, only show every Nth tick label so axis text doesn't pile up.
  const tickStep = useMemo(() => {
    const n = rows.length;
    if (n <= 14) return 1;
    if (n <= 30) return 3;
    if (n <= 60) return 7;
    return Math.ceil(n / 12);
  }, [rows.length]);
  const visibleTicks = useMemo(
    () => tickEvery(rows.map((r) => r.date), tickStep).filter((v) => v !== ""),
    [rows, tickStep],
  ) as string[];

  const compactCurrency = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [currencyCode],
  );

  const granularityWord = data.granularity === "day" ? "daily" : "weekly";
  const ariaLabel = `Revenue and orders chart, ${granularityWord} view, ${rows.length} data points`;

  const showPrev = rows.some((r) => r.revenuePrev != null || r.ordersPrev != null);

  // Tooltip renderer.
  const renderTooltip = ({ active, payload, label }: TooltipContentProps) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload as Row | undefined;
    if (!row) return null;
    return (
      <Box
        background="bg-surface"
        padding="200"
        borderRadius="200"
        borderWidth="025"
        borderColor="border"
      >
        <BlockStack gap="100">
          <Text as="span" variant="bodySm" fontWeight="medium">
            {label ?? row.date}
          </Text>
          <Text as="span" variant="bodySm">
            {`Revenue: ${formatMoney(asMoney(row.revenue, currencyCode) ?? { amount: "0.00", currency_code: currencyCode })}`}
          </Text>
          <Text as="span" variant="bodySm">
            {`Orders: ${row.orders == null ? "—" : formatNumber(row.orders)}`}
          </Text>
          {row.revenuePrev != null ? (
            <Text as="span" variant="bodySm" tone="subdued">
              {`Previous revenue: ${formatMoney(asMoney(row.revenuePrev, currencyCode) ?? { amount: "0.00", currency_code: currencyCode })}`}
            </Text>
          ) : null}
        </BlockStack>
      </Box>
    );
  };

  const tableRows: string[][] = rows.map((r) => [
    r.date,
    r.revenue == null
      ? "—"
      : formatMoney({ amount: r.revenue.toFixed(2), currency_code: currencyCode }),
    r.orders == null ? "—" : formatNumber(r.orders),
  ]);

  return (
    <ChartCard
      title="Revenue and orders over time"
      subtitle={data.granularity === "day" ? "Daily totals" : "Weekly totals"}
    >
      <div role="img" aria-label={ariaLabel} style={{ width: "100%", height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              ticks={visibleTicks}
              stroke={theme.comparison}
              fontSize={12}
              tickMargin={6}
            />
            <YAxis
              yAxisId="rev"
              orientation="left"
              stroke={theme.comparison}
              fontSize={12}
              tickFormatter={(v: number) => compactCurrency.format(v)}
              width={70}
            />
            <YAxis
              yAxisId="ord"
              orientation="right"
              stroke={theme.comparison}
              fontSize={12}
              tickFormatter={(v: number) => formatNumber(v)}
              width={50}
            />
            <Tooltip content={renderTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {showPrev ? (
              <Line
                yAxisId="rev"
                type="monotone"
                dataKey="revenuePrev"
                name="Revenue (previous)"
                stroke={theme.comparison}
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                dot={false}
                connectNulls={false}
                isAnimationActive={!reducedMotion}
              />
            ) : null}
            <Line
              yAxisId="rev"
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke={theme.primary}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
            />
            {showPrev ? (
              <Line
                yAxisId="ord"
                type="monotone"
                dataKey="ordersPrev"
                name="Orders (previous)"
                stroke={theme.comparison}
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                dot={false}
                connectNulls={false}
                isAnimationActive={!reducedMotion}
              />
            ) : null}
            <Line
              yAxisId="ord"
              type="monotone"
              dataKey="orders"
              name="Orders"
              stroke={theme.secondary}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Bleed marginInline="0">
        <InlineStack align="end">
          <Button
            variant="plain"
            onClick={() => setTableOpen((v) => !v)}
            ariaExpanded={tableOpen}
            ariaControls="revenue-orders-data-table"
          >
            {tableOpen ? "Hide data table" : "Show data table"}
          </Button>
        </InlineStack>
      </Bleed>
      <Collapsible id="revenue-orders-data-table" open={tableOpen}>
        <Box paddingBlockStart="200">
          <DataTable
            columnContentTypes={["text", "numeric", "numeric"]}
            headings={["Date", "Revenue", "Orders"]}
            rows={tableRows}
          />
        </Box>
      </Collapsible>
    </ChartCard>
  );
}
