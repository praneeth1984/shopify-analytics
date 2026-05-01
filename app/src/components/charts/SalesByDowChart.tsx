/**
 * Bar chart of revenue (default) or order count by day-of-week, with a
 * Polaris segmented toggle to switch views. Always renders all 7 bars even
 * when a day has zero activity, so merchants get a stable visual.
 */

import { useMemo, useState } from "react";
import {
  Bleed,
  Box,
  Button,
  ButtonGroup,
  Collapsible,
  DataTable,
  InlineStack,
  Text,
  BlockStack,
} from "@shopify/polaris";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type { DowPoint } from "@fbc/shared";
import { ChartCard } from "./ChartCard.js";
import { useChartTheme } from "../../lib/chart-theme.js";
import { formatMoney, formatNumber } from "../../lib/format.js";

type Props = {
  data: DowPoint[];
  currencyCode: string;
};

type View = "revenue" | "orders";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function SalesByDowChart({ data, currencyCode }: Props) {
  const theme = useChartTheme();
  const [view, setView] = useState<View>("revenue");
  const [tableOpen, setTableOpen] = useState(false);
  const reducedMotion = prefersReducedMotion();

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

  const rows = useMemo(
    () =>
      data.map((p) => ({
        label: p.label,
        // Convert minor → major in the chart-data shape so Recharts ticks/axes
        // operate on dollar values directly.
        revenue: p.revenue_minor / 100,
        orders: p.orders,
      })),
    [data],
  );

  const ariaLabel =
    view === "revenue"
      ? "Revenue by day of week bar chart"
      : "Order count by day of week bar chart";

  type TooltipRow = { label: string; revenue: number; orders: number };
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
            {`Revenue: ${formatMoney({ amount: row.revenue.toFixed(2), currency_code: currencyCode })}`}
          </Text>
          <Text as="span" variant="bodySm">
            {`Orders: ${formatNumber(row.orders)}`}
          </Text>
        </BlockStack>
      </Box>
    );
  };

  const tableRows: string[][] = rows.map((r) => [
    r.label,
    formatMoney({ amount: r.revenue.toFixed(2), currency_code: currencyCode }),
    formatNumber(r.orders),
  ]);

  return (
    <ChartCard
      title="Sales by day of week"
      subtitle="Across the selected range, in UTC"
      action={
        <ButtonGroup variant="segmented">
          <Button
            pressed={view === "revenue"}
            onClick={() => setView("revenue")}
            accessibilityLabel="Show revenue"
          >
            Revenue
          </Button>
          <Button
            pressed={view === "orders"}
            onClick={() => setView("orders")}
            accessibilityLabel="Show orders"
          >
            Orders
          </Button>
        </ButtonGroup>
      }
    >
      <div role="img" aria-label={ariaLabel} style={{ width: "100%", height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke={theme.comparison} fontSize={12} />
            <YAxis
              stroke={theme.comparison}
              fontSize={12}
              tickFormatter={(v: number) =>
                view === "revenue" ? compactCurrency.format(v) : formatNumber(v)
              }
              width={70}
            />
            <Tooltip content={renderTooltip} cursor={{ fill: theme.grid, opacity: 0.4 }} />
            <Bar
              dataKey={view === "revenue" ? "revenue" : "orders"}
              fill={theme.primary}
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reducedMotion}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Bleed marginInline="0">
        <InlineStack align="end">
          <Button
            variant="plain"
            onClick={() => setTableOpen((v) => !v)}
            ariaExpanded={tableOpen}
            ariaControls="dow-data-table"
          >
            {tableOpen ? "Hide data table" : "Show data table"}
          </Button>
        </InlineStack>
      </Bleed>
      <Collapsible id="dow-data-table" open={tableOpen}>
        <Box paddingBlockStart="200">
          <DataTable
            columnContentTypes={["text", "numeric", "numeric"]}
            headings={["Day", "Revenue", "Orders"]}
            rows={tableRows}
          />
        </Box>
      </Collapsible>
    </ChartCard>
  );
}
