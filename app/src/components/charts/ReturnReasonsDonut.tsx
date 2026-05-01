/**
 * Donut chart of return reasons with a center label showing the total
 * returned-units count. Reasons under 2% are collapsed into an "Other" slice
 * so we don't render a confetti of micro-segments.
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
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { ReturnReasonRow } from "@fbc/shared";
import { ChartCard } from "./ChartCard.js";
import { PaginatedDataTable } from "./PaginatedDataTable.js";
import { useChartTheme } from "../../lib/chart-theme.js";
import { formatNumber } from "../../lib/format.js";

type Props = {
  reasons: ReturnReasonRow[];
};

const OTHER_THRESHOLD = 0.02;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Slice = {
  key: string;
  label: string;
  units: number;
  pct: number;
};

function collapseOther(reasons: ReturnReasonRow[]): Slice[] {
  const big: Slice[] = [];
  let otherUnits = 0;
  let otherPct = 0;
  for (const r of reasons) {
    if (r.pct_of_returns < OTHER_THRESHOLD) {
      otherUnits += r.units;
      otherPct += r.pct_of_returns;
    } else {
      big.push({ key: r.code, label: r.label, units: r.units, pct: r.pct_of_returns });
    }
  }
  if (otherUnits > 0) {
    big.push({ key: "__other__", label: "Other", units: otherUnits, pct: otherPct });
  }
  return big;
}

export default function ReturnReasonsDonut({ reasons }: Props) {
  const theme = useChartTheme();
  const [tableOpen, setTableOpen] = useState(false);
  const reducedMotion = prefersReducedMotion();

  const slices = useMemo(() => collapseOther(reasons), [reasons]);
  const totalUnits = useMemo(() => reasons.reduce((s, r) => s + r.units, 0), [reasons]);

  if (reasons.length === 0) return null;

  type TooltipRow = Slice;
  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
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
            {row.label}
          </Text>
          <Text as="span" variant="bodySm">
            {`${formatNumber(row.units)} units · ${(row.pct * 100).toFixed(1)}%`}
          </Text>
        </BlockStack>
      </Box>
    );
  };

  const tableRows: string[][] = slices.map((s) => [
    s.label,
    formatNumber(s.units),
    `${(s.pct * 100).toFixed(1)}%`,
  ]);

  const footer = (
    <>
      <BlockStack gap="100">
        {slices.map((s, i) => (
          <InlineStack key={s.key} align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: theme.donutPalette[i % theme.donutPalette.length],
                }}
              />
              <Text as="span" variant="bodySm">
                {s.label}
              </Text>
            </InlineStack>
            <Text as="span" variant="bodySm" tone="subdued">
              {`${formatNumber(s.units)} · ${(s.pct * 100).toFixed(1)}%`}
            </Text>
          </InlineStack>
        ))}
      </BlockStack>
      <InlineStack align="end">
        <Button
          variant="plain"
          onClick={() => setTableOpen((v) => !v)}
          ariaExpanded={tableOpen}
          ariaControls="reasons-data-table"
        >
          {tableOpen ? "Hide data table" : "Show data table"}
        </Button>
      </InlineStack>
      <Collapsible id="reasons-data-table" open={tableOpen}>
        <Box paddingBlockStart="200">
          <PaginatedDataTable
            columnContentTypes={["text", "numeric", "numeric"]}
            headings={["Reason", "Units", "Share"]}
            rows={tableRows}
          />
        </Box>
      </Collapsible>
    </>
  );

  return (
    <ChartCard
      title="Return reasons"
      subtitle={`${formatNumber(totalUnits)} units returned`}
      footer={footer}
    >
      <div
        role="img"
        aria-label="Return reasons donut chart"
        style={{ width: "100%", height: "100%", position: "relative" }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={renderTooltip} />
            <Pie
              data={slices}
              dataKey="units"
              nameKey="label"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              isAnimationActive={!reducedMotion}
              stroke="none"
            >
              {slices.map((s, i) => (
                <Cell key={s.key} fill={theme.donutPalette[i % theme.donutPalette.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            flexDirection: "column",
          }}
        >
          <Text as="p" variant="headingLg">
            {formatNumber(totalUnits)}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            units returned
          </Text>
        </div>
      </div>
    </ChartCard>
  );
}
