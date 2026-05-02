import { useState } from "react";
import {
  BlockStack, Card, Text, TextField, Banner, InlineStack, Button,
  InlineGrid, Divider,
} from "@shopify/polaris";
import type { ProfitMetrics } from "@fbc/shared";
import { formatMoney, formatNumber } from "../../lib/format.js";

type Props = {
  profit: ProfitMetrics | null;
  loading: boolean;
};

function parsePositive(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) || n < 0 ? null : n;
}

export function BreakEvenCalculator({ profit, loading }: Props) {
  const currency = profit?.gross_revenue.currency_code ?? "USD";

  // AOV = gross revenue / orders. COGS/order = (revenue − profit) / orders.
  const derivedAov = profit
    ? parseFloat(profit.gross_revenue.amount) / Math.max(profit.orders_counted, 1)
    : null;
  const derivedCogs = profit
    ? (parseFloat(profit.gross_revenue.amount) - parseFloat(profit.gross_profit.amount)) /
      Math.max(profit.orders_counted, 1)
    : null;

  const [aovStr, setAovStr] = useState("");
  const [cogsStr, setCogsStr] = useState("");
  const [varCostStr, setVarCostStr] = useState("");
  const [fixedCostStr, setFixedCostStr] = useState("");

  function reset() {
    setAovStr("");
    setCogsStr("");
    setVarCostStr("");
    setFixedCostStr("");
  }

  const aov = parsePositive(aovStr) ?? derivedAov ?? 0;
  const cogsPerOrder = parsePositive(cogsStr) ?? derivedCogs ?? 0;
  const varCost = parsePositive(varCostStr) ?? 0;
  const fixedCost = parsePositive(fixedCostStr) ?? 0;

  const contributionMargin = aov - cogsPerOrder - varCost;
  const breakEvenOrders =
    contributionMargin > 0 ? Math.ceil(fixedCost / contributionMargin) : null;

  const currentOrderRate = profit?.orders_counted ?? null;
  const surplus =
    breakEvenOrders !== null && currentOrderRate !== null
      ? currentOrderRate - breakEvenOrders
      : null;

  const missingInputs = aov === 0 || fixedCost === 0;

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Break-Even Order Volume</Text>
          <Text as="p" tone="subdued">
            How many orders per month do you need to cover all costs? Edit any value below to run
            what-if scenarios. Changes are not saved.
          </Text>

          {loading && (
            <Banner tone="info">
              <Text as="p">Loading data from your store…</Text>
            </Banner>
          )}

          {!profit && !loading && (
            <Banner tone="warning" title="No profit data loaded">
              <Text as="p">Select a date range on the Dashboard to populate these inputs.</Text>
            </Banner>
          )}

          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
            <TextField
              label="Average order value (AOV)"
              type="number"
              prefix={currency}
              value={aovStr || (derivedAov !== null ? derivedAov.toFixed(2) : "")}
              onChange={setAovStr}
              helpText="Auto-filled from your selected period"
              autoComplete="off"
            />
            <TextField
              label="Average COGS per order"
              type="number"
              prefix={currency}
              value={cogsStr || (derivedCogs !== null ? derivedCogs.toFixed(2) : "")}
              onChange={setCogsStr}
              helpText="Estimated from your COGS settings"
              autoComplete="off"
            />
            <TextField
              label="Other variable costs per order"
              type="number"
              prefix={currency}
              value={varCostStr}
              onChange={setVarCostStr}
              helpText="Shipping + payment fees per order (estimated)"
              autoComplete="off"
            />
            <TextField
              label="Total monthly fixed costs"
              type="number"
              prefix={currency}
              value={fixedCostStr}
              onChange={setFixedCostStr}
              helpText="Ad spend, apps, Shopify plan, rent, etc."
              autoComplete="off"
            />
          </InlineGrid>

          <InlineStack align="end">
            <Button onClick={reset} variant="plain">Reset to auto-filled values</Button>
          </InlineStack>

          <Divider />

          {missingInputs ? (
            <Banner tone="info">
              <Text as="p">
                Enter your monthly fixed costs to see the break-even order volume.
              </Text>
            </Banner>
          ) : contributionMargin <= 0 ? (
            <Banner tone="critical" title="Negative contribution margin">
              <Text as="p">
                Your cost per order ({formatMoney({ amount: (cogsPerOrder + varCost).toFixed(2), currency_code: currency })}) exceeds your AOV ({formatMoney({ amount: aov.toFixed(2), currency_code: currency })}). You lose money on every order.
              </Text>
            </Banner>
          ) : (
            <BlockStack gap="300">
              <InlineGrid columns={2} gap="400">
                <Card>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">Contribution margin per order</Text>
                    <Text as="p" variant="headingLg">
                      {formatMoney({ amount: contributionMargin.toFixed(2), currency_code: currency })}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">AOV − COGS − variable costs</Text>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">Break-even orders / month</Text>
                    <Text as="p" variant="headingLg">
                      {breakEvenOrders !== null ? formatNumber(breakEvenOrders) : "—"}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">Fixed costs ÷ contribution margin</Text>
                  </BlockStack>
                </Card>
              </InlineGrid>

              {surplus !== null && currentOrderRate !== null && breakEvenOrders !== null && (
                <Banner tone={surplus >= 0 ? "success" : "warning"}>
                  <Text as="p">
                    {surplus >= 0
                      ? `At your current rate of ${formatNumber(currentOrderRate)} orders this period, you are ${formatNumber(surplus)} orders above break-even.`
                      : `At your current rate of ${formatNumber(currentOrderRate)} orders this period, you are ${formatNumber(Math.abs(surplus))} orders below break-even.`}
                  </Text>
                </Banner>
              )}
            </BlockStack>
          )}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
