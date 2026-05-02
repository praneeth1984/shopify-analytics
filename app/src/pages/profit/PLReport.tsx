import { useState } from "react";
import {
  BlockStack, Card, Text, InlineStack, Divider, Banner, Button,
  SkeletonBodyText, Tooltip, Badge,
} from "@shopify/polaris";
import type { DateRangePreset, ComparisonMode } from "@fbc/shared";
import { useProfit } from "../../hooks/useProfit.js";
import { RangePicker } from "../../components/RangePicker.js";
import { ComparisonPicker } from "../../components/ComparisonPicker.js";
import { useExpenses } from "../../hooks/useExpenses.js";
import { formatMoney } from "../../lib/format.js";
import { navigate } from "../../App.js";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function totalExpenses(expenses: ReturnType<typeof useExpenses>["data"]): number {
  if (!expenses) return 0;
  const e = expenses.expenses;
  return (
    e.meta_ads +
    e.google_ads +
    e.tiktok_ads +
    e.other_marketing +
    e.other.reduce((s, o) => s + o.amount, 0)
  );
}

type PLRowProps = {
  label: string;
  value: string | null;
  sublabel?: string;
  indent?: boolean;
  negative?: boolean;
  tone?: "success" | "critical" | "subdued";
  missing?: string;
};

function PLRow({ label, value, sublabel, indent, negative, tone, missing }: PLRowProps) {
  return (
    <InlineStack align="space-between" blockAlign="baseline">
      <BlockStack gap="0">
        <Text as="p" tone={tone} variant={indent ? "bodySm" : "bodyMd"}>
          {indent ? `  ${label}` : label}
        </Text>
        {sublabel && <Text as="p" variant="bodySm" tone="subdued">{sublabel}</Text>}
      </BlockStack>
      {missing ? (
        <Tooltip content={missing}>
          <Text as="p" tone="subdued">—</Text>
        </Tooltip>
      ) : (
        <Text as="p" fontWeight="semibold" tone={tone}>
          {negative && value ? `(${value})` : value ?? "—"}
        </Text>
      )}
    </InlineStack>
  );
}

export function PLReportPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [comparison, setComparison] = useState<ComparisonMode>("previous_period");
  const profit = useProfit(preset, comparison);
  const expenses = useExpenses(currentMonth());

  const currency = profit.data?.gross_revenue.currency_code ?? "USD";
  const totalAdSpend = totalExpenses(expenses.data);

  const grossProfitAmt = profit.data ? parseFloat(profit.data.gross_profit.amount) : 0;
  const feesAmt = profit.data?.rates_configured
    ? parseFloat(profit.data.est_payment_fees.amount)
    : 0;

  const hasDeductions = totalAdSpend > 0 || feesAmt > 0;
  const netProfitAmt = profit.data && hasDeductions
    ? grossProfitAmt - totalAdSpend - feesAmt
    : null;

  const netProfit = netProfitAmt !== null
    ? { amount: netProfitAmt.toFixed(2), currency_code: currency }
    : null;

  const totalNetRevenue = profit.data
    ? parseFloat(profit.data.gross_revenue_before_returns.amount) +
      parseFloat(profit.data.shipping_charged.amount) -
      parseFloat(profit.data.refunded_revenue.amount)
    : 0;
  const netMargin =
    profit.data && netProfitAmt !== null && totalNetRevenue !== 0
      ? netProfitAmt / totalNetRevenue
      : null;

  function handlePrint() {
    window.print();
  }

  return (
    <BlockStack gap="400">
      <Card>
        <InlineStack align="space-between" blockAlign="center" wrap>
          <InlineStack gap="200" wrap>
            <RangePicker value={preset} onChange={setPreset} />
            <ComparisonPicker value={comparison} onChange={setComparison} />
          </InlineStack>
          <Button onClick={handlePrint} variant="plain">Print / PDF</Button>
        </InlineStack>
      </Card>

      {profit.error && (
        <Banner tone="critical" title="Failed to load P&L data">
          <Text as="p">{profit.error}</Text>
        </Banner>
      )}

      {profit.data?.history_clamped_to && (
        <Banner tone="info" title="Showing last 90 days (Free plan)">
          <InlineStack gap="200">
            <Text as="p">Upgrade to Pro for unlimited P&L history.</Text>
            <Button variant="plain" onClick={() => navigate("/billing")}>Upgrade</Button>
          </InlineStack>
        </Banner>
      )}

      <Card>
        {profit.loading ? (
          <SkeletonBodyText lines={10} />
        ) : profit.data ? (
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Profit & Loss
              {profit.data.range && (
                <Text as="span" variant="bodySm" tone="subdued">
                  {" "}· {profit.data.range.start.slice(0, 10)} to {profit.data.range.end.slice(0, 10)}
                </Text>
              )}
            </Text>

            <PLRow
              label="Gross Revenue"
              value={formatMoney(profit.data.gross_revenue_before_returns)}
              sublabel="Product revenue (line items, before returns)"
            />
            <PLRow
              label="Shipping Revenue"
              value={formatMoney(profit.data.shipping_charged)}
              sublabel="Charged to customers"
              indent
            />
            <PLRow
              label="Returns & Refunds"
              value={formatMoney(profit.data.refunded_revenue)}
              sublabel="Refunded line item value"
              indent
              negative
            />

            <Divider />

            <PLRow
              label="Net Revenue"
              value={formatMoney({
                amount: (
                  parseFloat(profit.data.gross_revenue_before_returns.amount) +
                  parseFloat(profit.data.shipping_charged.amount) -
                  parseFloat(profit.data.refunded_revenue.amount)
                ).toFixed(2),
                currency_code: currency,
              })}
              sublabel="Before COGS"
            />

            <PLRow
              label="Cost of Goods Sold (COGS)"
              value={profit.data.has_any_cogs
                ? formatMoney({
                    amount: (
                      parseFloat(profit.data.gross_revenue.amount) -
                      parseFloat(profit.data.gross_profit.amount)
                    ).toFixed(2),
                    currency_code: currency,
                  })
                : null}
              missing={!profit.data.has_any_cogs ? "Add COGS in Settings to see cost per product" : undefined}
              indent
              negative
            />

            <Divider />

            <PLRow
              label="Gross Profit"
              value={formatMoney(profit.data.gross_profit)}
              sublabel={`${(profit.data.gross_margin * 100).toFixed(1)}% gross margin`}
              tone={parseFloat(profit.data.gross_profit.amount) >= 0 ? "success" : "critical"}
            />

            <PLRow
              label="Marketing & Ad Spend"
              value={
                totalAdSpend > 0
                  ? formatMoney({ amount: totalAdSpend.toFixed(2), currency_code: currency })
                  : null
              }
              missing={totalAdSpend === 0 ? "Add ad spend in Settings → Monthly Expenses" : undefined}
              indent
              negative
            />

            <PLRow
              label="Payment Processing Fees (est.)"
              value={profit.data.rates_configured ? formatMoney(profit.data.est_payment_fees) : null}
              missing={!profit.data.rates_configured ? "Configure gateway rates in Settings → Gateway Rates" : undefined}
              indent
              negative
            />

            <Divider />

            <PLRow
              label="Net Profit"
              value={netProfit ? formatMoney(netProfit) : null}
              sublabel={
                netMargin !== null
                  ? `${(netMargin * 100).toFixed(1)}% net margin`
                  : "Add ad spend or gateway rates to see net profit"
              }
              missing={netProfit === null ? "Add expenses or configure gateway rates to see net profit" : undefined}
              tone={
                netProfit
                  ? parseFloat(netProfit.amount) >= 0
                    ? "success"
                    : "critical"
                  : undefined
              }
            />

            {!profit.data.has_any_cogs && (
              <Banner tone="info">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="p">Add COGS in Settings to see gross profit per product.</Text>
                  <Button variant="plain" onClick={() => navigate("/settings")}>Configure COGS</Button>
                </InlineStack>
              </Banner>
            )}
          </BlockStack>
        ) : null}
      </Card>

      <Text as="p" variant="bodySm" tone="subdued">
        <Badge>Free</Badge> P&L summary. Upgrade to Pro for line-item drill-down and PDF export.
      </Text>
    </BlockStack>
  );
}
