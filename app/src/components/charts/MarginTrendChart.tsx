/**
 * Margin trend over time. The series is delivered in basis points so we can
 * keep the backend math integer-safe; we render as percentages here.
 *
 * If every bucket is null (no revenue or no costs entered), we render a
 * compact Polaris EmptyState instead of an empty chart so merchants get a
 * direct call-to-action.
 */

import { useMemo, useState } from "react";
import {
  Bleed,
  BlockStack,
  Box,
  Button,
  Collapsible,
  DataTable,
  EmptyState,
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
import type { ProfitMetrics } from "@fbc/shared";
import { ChartCard } from "./ChartCard.js";
import { useChartTheme } from "../../lib/chart-theme.js";

type Props = {
  data: ProfitMetrics;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function formatPctFromBp(bp: number | null | undefined): string {
  if (bp == null || !Number.isFinite(bp)) return "—";
  return `${(bp / 100).toFixed(1)}%`;
}

export default function MarginTrendChart({ data }: Props) {
  const theme = useChartTheme();
  const [tableOpen, setTableOpen] = useState(false);
  const reducedMotion = prefersReducedMotion();

  const rows = useMemo(
    () =>
      data.margin_series.map((p) => ({
        date: p.date,
        margin: p.value, // basis points
      })),
    [data.margin_series],
  );

  const allNull = rows.length === 0 || rows.every((r) => r.margin == null);

  if (allNull) {
    return (
      <ChartCard
        title="Margin over time"
        subtitle={data.granularity === "day" ? "Daily margin" : "Weekly margin"}
        emptyState={
          <EmptyState
            heading="No margin data yet"
            image=""
            action={undefined}
            fullWidth
          >
            <p>Add product costs in Settings to see margin trends.</p>
          </EmptyState>
        }
      >
        {null}
      </ChartCard>
    );
  }

  type TooltipRow = { date: string; margin: number | null };
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
            {`Margin: ${formatPctFromBp(row.margin)}`}
          </Text>
        </BlockStack>
      </Box>
    );
  };

  const tableRows: string[][] = rows.map((r) => [r.date, formatPctFromBp(r.margin)]);
  const tickStep = rows.length <= 14 ? 1 : rows.length <= 30 ? 3 : Math.ceil(rows.length / 12);
  const visibleTicks = rows
    .map((r, i) => (i % tickStep === 0 ? r.date : ""))
    .filter((v) => v !== "");

  return (
    <ChartCard
      title="Margin over time"
      subtitle={data.granularity === "day" ? "Daily margin" : "Weekly margin"}
    >
      <div
        role="img"
        aria-label="Gross margin over time line chart"
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
              dataKey="margin"
              stroke={theme.primary}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Bleed marginInline="0">
        <InlineStack align="end">
          <Button
            variant="plain"
            onClick={() => setTableOpen((v) => !v)}
            ariaExpanded={tableOpen}
            ariaControls="margin-data-table"
          >
            {tableOpen ? "Hide data table" : "Show data table"}
          </Button>
        </InlineStack>
      </Bleed>
      <Collapsible id="margin-data-table" open={tableOpen}>
        <Box paddingBlockStart="200">
          <DataTable
            columnContentTypes={["text", "numeric"]}
            headings={["Date", "Margin"]}
            rows={tableRows}
          />
        </Box>
      </Collapsible>
    </ChartCard>
  );
}
