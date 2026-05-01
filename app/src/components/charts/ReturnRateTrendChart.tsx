/**
 * Return rate over time, with a 7-bucket rolling average overlay so the
 * underlying noise of small-sample buckets doesn't dominate the chart.
 *
 * Returns `null` (no card rendered) when the series has fewer than 3 non-null
 * data points, so we don't pretend to chart a few orphan points. The parent
 * dashboard already shows a number card / banner in that case.
 */

import { useMemo, useState } from "react";
import {
  BlockStack,
  Box,
  Button,
  Collapsible,
  InlineStack,
  Text,
} from "@shopify/polaris";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type { TimeSeriesPoint } from "@fbc/shared";
import { ChartCard } from "./ChartCard.js";
import { PaginatedDataTable } from "./PaginatedDataTable.js";
import { useChartTheme } from "../../lib/chart-theme.js";
import { rollingAverage } from "../../lib/rolling-average.js";

type Props = {
  series: TimeSeriesPoint[];
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function formatPctFromBp(bp: number | null | undefined): string {
  if (bp == null || !Number.isFinite(bp)) return "—";
  return `${(bp / 100).toFixed(1)}%`;
}

export default function ReturnRateTrendChart({ series }: Props) {
  const nonNullCount = series.filter((p) => p.value != null).length;

  const theme = useChartTheme();
  const [tableOpen, setTableOpen] = useState(false);
  const reducedMotion = prefersReducedMotion();

  const rolling = useMemo(() => rollingAverage(series, 7), [series]);

  const rows = useMemo(
    () =>
      series.map((p, i) => ({
        date: p.date,
        rate: p.value,
        rolling: rolling[i] ?? null,
      })),
    [series, rolling],
  );

  // Hooks must run unconditionally; bail out at render time.
  if (nonNullCount < 3) return null;

  type TooltipRow = { date: string; rate: number | null; rolling: number | null };
  const renderTooltip = ({ active, payload, label }: TooltipContentProps) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload as TooltipRow | undefined;
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
            {`Return rate: ${formatPctFromBp(row.rate)}`}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {`7-bucket avg: ${formatPctFromBp(row.rolling)}`}
          </Text>
        </BlockStack>
      </Box>
    );
  };

  const tableRows: string[][] = rows.map((r) => [
    r.date,
    formatPctFromBp(r.rate),
    formatPctFromBp(r.rolling),
  ]);

  const tickStep = rows.length <= 14 ? 1 : rows.length <= 30 ? 3 : Math.ceil(rows.length / 12);
  const visibleTicks = rows
    .map((r, i) => (i % tickStep === 0 ? r.date : ""))
    .filter((v) => v !== "");

  const footer = (
    <>
      <InlineStack align="end">
        <Button
          variant="plain"
          onClick={() => setTableOpen((v) => !v)}
          ariaExpanded={tableOpen}
          ariaControls="return-rate-data-table"
        >
          {tableOpen ? "Hide data table" : "Show data table"}
        </Button>
      </InlineStack>
      <Collapsible id="return-rate-data-table" open={tableOpen}>
        <Box paddingBlockStart="200">
          <PaginatedDataTable
            columnContentTypes={["text", "numeric", "numeric"]}
            headings={["Date", "Return rate", "Rolling avg"]}
            rows={tableRows}
          />
        </Box>
      </Collapsible>
    </>
  );

  return (
    <ChartCard
      title="Return rate over time"
      subtitle="By original order date • Times in UTC"
      footer={footer}
    >
      <div
        role="img"
        aria-label="Return rate over time line chart with rolling average"
        style={{ width: "100%", height: "100%" }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              ticks={visibleTicks}
              stroke={theme.comparison}
              fontSize={12}
              tickMargin={6}
            />
            <YAxis
              stroke={theme.comparison}
              fontSize={12}
              tickFormatter={(v: number) => (Number.isFinite(v) ? `${(v / 100).toFixed(1)}%` : "")}
              width={60}
            />
            <Tooltip content={renderTooltip} />
            <Line
              type="monotone"
              dataKey="rate"
              name="Return rate"
              stroke={theme.primary}
              strokeWidth={1}
              strokeOpacity={0.45}
              dot={false}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
            />
            <Line
              type="monotone"
              dataKey="rolling"
              name="7-bucket rolling average"
              stroke={theme.primary}
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
