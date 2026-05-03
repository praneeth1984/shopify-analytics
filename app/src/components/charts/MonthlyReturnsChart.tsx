/**
 * F47 — Order vs Return monthly chart.
 *
 * Bars: orders (blue) and returned orders (red).
 * Line on right Y-axis: return rate %.
 */

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyReturnRow } from "@fbc/shared";
import { ChartCard } from "./ChartCard.js";
import { useChartTheme } from "../../lib/chart-theme.js";
import { formatNumber } from "../../lib/format.js";

type Props = {
  rows: MonthlyReturnRow[];
};

type ChartRow = {
  month: string;
  orders: number;
  returned: number;
  rate: number;
};

export default function MonthlyReturnsChart({ rows }: Props) {
  const theme = useChartTheme();
  const data: ChartRow[] = rows.map((r) => ({
    month: r.month,
    orders: r.orders,
    returned: r.returned_orders,
    rate: r.return_rate_pct,
  }));

  const ariaLabel = `Monthly orders and returns chart, ${rows.length} months`;

  if (rows.every((r) => r.orders === 0)) {
    return (
      <ChartCard
        title="Orders vs Returns by month"
        subtitle="Monthly totals and return rate"
        emptyState={
          <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center" }}>
            No orders in the selected window. Try expanding the range or come back after your next sale.
          </div>
        }
      >
        <div />
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Orders vs Returns by month" subtitle="Monthly totals and return rate">
      <div role="img" aria-label={ariaLabel} style={{ width: "100%", height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="month" stroke={theme.comparison} fontSize={12} tickMargin={6} />
            <YAxis
              yAxisId="orders"
              orientation="left"
              stroke={theme.comparison}
              fontSize={12}
              tickFormatter={(v: number) => formatNumber(v)}
              width={60}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              stroke={theme.comparison}
              fontSize={12}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              width={50}
            />
            <Tooltip
              formatter={(value, name) => {
                const v = typeof value === "number" ? value : Number(value);
                if (name === "Return Rate") return [`${v.toFixed(1)}%`, name];
                return [formatNumber(v), name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="orders" dataKey="orders" name="Orders" fill={theme.primary} />
            <Bar yAxisId="orders" dataKey="returned" name="Returned" fill={theme.donutPalette[2]} />
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="rate"
              name="Return Rate"
              stroke={theme.donutPalette[2]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
