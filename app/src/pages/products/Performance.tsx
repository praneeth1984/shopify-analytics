import { useState } from "react";
import {
  Page, Card, IndexTable, Banner, Text, InlineStack, Badge,
  SkeletonBodyText, EmptyState, Tooltip,
} from "@shopify/polaris";
import { useProductsPerformance } from "../../hooks/useProductsPerformance.js";
import { RangePicker } from "../../components/RangePicker.js";
import { ExportButton } from "../../components/ExportButton.js";
import { formatMoney, formatMargin } from "../../lib/format.js";
import type { DateRangePreset } from "@fbc/shared";

export function ProductsPerformancePage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const { data, loading, error } = useProductsPerformance(preset);

  const showFees = data?.rows.some((r) => r.est_fees_allocated !== null) ?? false;

  const headings = [
    { title: "Product" },
    { title: "Units Sold" },
    { title: "Returns" },
    { title: "Gross Revenue" },
    { title: "Refunded" },
    { title: "Net Revenue" },
    { title: "COGS" },
    { title: "Gross Profit" },
    { title: "Margin" },
    ...(showFees ? [{ title: "Est. Fees" }, { title: "Net Profit" }] : []),
    { title: "Return Rate" },
  ];

  return (
    <Page
      title="Product Performance"
      subtitle="Net revenue and profitability per product after refunds and COGS."
      secondaryActions={[]}
    >
      <Card>
        <InlineStack align="space-between" blockAlign="center" gap="400">
          <RangePicker value={preset} onChange={setPreset} />
          <ExportButton panel="products" preset={preset} />
        </InlineStack>
      </Card>

      {error && (
        <Banner tone="critical" title="Failed to load product performance">
          <Text as="p">{error}</Text>
        </Banner>
      )}

      {data && !data.has_any_cogs && (
        <Banner tone="info" title="Add costs to see profit">
          <Text as="p">
            Configure COGS in Settings to see gross profit and margin per product.
          </Text>
        </Banner>
      )}

      {data?.plan_capped_to !== null && data?.total_count !== undefined && data.total_count > (data.plan_capped_to ?? 0) && (
        <Banner tone="info" title={`Showing top ${data.plan_capped_to ?? 10} products`}>
          <Text as="p">
            Upgrade to Pro to see all {data.total_count} products with unlimited history.
          </Text>
        </Banner>
      )}

      <Card>
        {loading ? (
          <SkeletonBodyText lines={8} />
        ) : data && data.rows.length === 0 ? (
          <EmptyState heading="No products in this period" image="">
            <Text as="p" tone="subdued">Try a wider date range.</Text>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: "product", plural: "products" }}
            itemCount={data?.rows.length ?? 0}
            headings={headings as [{ title: string }, ...{ title: string }[]]}
            selectable={false}
          >
            {data?.rows.map((row, idx) => (
              <IndexTable.Row id={row.product_id} key={row.product_id} position={idx}>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">{row.title}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{row.units_sold}</IndexTable.Cell>
                <IndexTable.Cell>{row.units_refunded}</IndexTable.Cell>
                <IndexTable.Cell>{formatMoney(row.gross_revenue)}</IndexTable.Cell>
                <IndexTable.Cell>
                  {row.refunded_amount.amount !== "0.00"
                    ? <Text as="span" tone="critical">−{formatMoney(row.refunded_amount)}</Text>
                    : "—"}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">{formatMoney(row.net_revenue)}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {row.cogs ? formatMoney(row.cogs) : (
                    <Tooltip content="Add COGS in Settings to see cost per product">
                      <Text as="span" tone="subdued">—</Text>
                    </Tooltip>
                  )}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {row.gross_profit ? (
                    <Text
                      as="span"
                      tone={parseFloat(row.gross_profit.amount) >= 0 ? "success" : "critical"}
                    >
                      {formatMoney(row.gross_profit)}
                    </Text>
                  ) : (
                    <Tooltip content="Add COGS in Settings to see profit">
                      <Text as="span" tone="subdued">—</Text>
                    </Tooltip>
                  )}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {row.gross_margin !== null ? formatMargin(row.gross_margin) : "—"}
                </IndexTable.Cell>
                {showFees && (
                  <>
                    <IndexTable.Cell>
                      {row.est_fees_allocated ? (
                        <Text as="span" tone="critical">−{formatMoney(row.est_fees_allocated)}</Text>
                      ) : "—"}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {row.est_net_profit ? (
                        <Text
                          as="span"
                          tone={parseFloat(row.est_net_profit.amount) >= 0 ? "success" : "critical"}
                        >
                          {formatMoney(row.est_net_profit)}
                        </Text>
                      ) : "—"}
                    </IndexTable.Cell>
                  </>
                )}
                <IndexTable.Cell>
                  {row.return_rate > 0 ? (
                    <Badge tone={row.return_rate > 0.1 ? "warning" : undefined}>
                      {formatMargin(row.return_rate)}
                    </Badge>
                  ) : "—"}
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>
    </Page>
  );
}
