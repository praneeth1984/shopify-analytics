import { useState } from "react";
import {
  Page, Card, IndexTable, Banner, Box, Button, Grid, Text, InlineStack, BlockStack,
  SkeletonBodyText, EmptyState,
} from "@shopify/polaris";
import { useTopCustomers } from "../../hooks/useTopCustomers.js";
import { useRepeatRate } from "../../hooks/useRepeatRate.js";
import { RangePicker } from "../../components/RangePicker.js";
import { ExportButton } from "../../components/ExportButton.js";
import { formatMoney, formatMargin, formatDeltaPct } from "../../lib/format.js";
import { MetricCard } from "../../components/MetricCard.js";
import type { DateRangePreset } from "@fbc/shared";

export function CustomersOverviewPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const customers = useTopCustomers(preset);
  const repeatRate = useRepeatRate(preset);

  const customerHeadings = [
    { title: "Rank" },
    { title: "Customer" },
    { title: "Total Revenue" },
    { title: "Orders" },
    { title: "AOV" },
    { title: "Last Order" },
    { title: "Days Since Last" },
  ];

  return (
    <Page
      title="Customers"
      subtitle="Top customers and repeat purchase metrics."
    >
      <BlockStack gap="400">
        <Card>
          <RangePicker value={preset} onChange={setPreset} />
        </Card>

        {/* Repeat Rate KPIs */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Repeat Purchase Rate</Text>

            {repeatRate.error && (
              <Banner tone="critical" title="We couldn't load this report">
                <Text as="p">
                  Try refreshing in a moment. If it keeps failing, use the Feedback page to let us know.
                </Text>
                <Box paddingBlockStart="200">
                  <Button onClick={() => window.location.reload()}>Retry</Button>
                </Box>
              </Banner>
            )}

            {repeatRate.loading ? (
              <SkeletonBodyText lines={3} />
            ) : repeatRate.data?.insufficient_data ? (
              <Banner tone="info" title="Not enough first-time customers">
                <Text as="p">
                  Need at least 20 first-time customers in this period to compute a reliable rate.
                  Try a wider date range.
                </Text>
              </Banner>
            ) : (
              <Grid>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                  <MetricCard
                    label="Repeat Customer Rate"
                    value={
                      repeatRate.data?.repeat_rate !== null
                        ? formatMargin(repeatRate.data?.repeat_rate ?? 0)
                        : "—"
                    }
                    delta={repeatRate.data?.repeat_rate_delta_pct ?? null}
                    caption="Customers with 2+ lifetime orders"
                  />
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                  <MetricCard
                    label="Revenue from Repeat Customers"
                    value={formatMargin(repeatRate.data?.revenue_from_repeat_pct ?? 0)}
                    delta={null}
                    caption="% of revenue from repeat customers"
                  />
                </Grid.Cell>
              </Grid>
            )}
          </BlockStack>
        </Card>

        {/* Top Customers Table */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Top Customers by Revenue</Text>
              <ExportButton panel="customers" preset={preset} />
            </InlineStack>

            {customers.error && (
              <Banner tone="critical" title="We couldn't load this report">
                <Text as="p">
                  Try refreshing in a moment. If it keeps failing, use the Feedback page to let us know.
                </Text>
                <Box paddingBlockStart="200">
                  <Button onClick={() => window.location.reload()}>Retry</Button>
                </Box>
              </Banner>
            )}

            {customers.data?.plan_capped_to !== null &&
              customers.data?.total_count !== undefined &&
              customers.data.total_count > (customers.data.plan_capped_to ?? 0) && (
                <Banner tone="info" title={`Showing top ${customers.data.plan_capped_to ?? 10} customers`}>
                  <Text as="p">
                    Upgrade to Pro to see all {customers.data.total_count} customers with unlimited history.
                  </Text>
                </Banner>
              )}

            {customers.loading ? (
              <SkeletonBodyText lines={6} />
            ) : customers.data?.insufficient_data ? (
              <EmptyState heading="Not enough customers in this period" image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E">
                <Text as="p" tone="subdued">
                  Need at least 5 customers to rank. Try a wider date range.
                </Text>
              </EmptyState>
            ) : customers.data && customers.data.customers.length === 0 ? (
              <EmptyState heading="No customers in this period" image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E">
                <Text as="p" tone="subdued">Try a wider date range.</Text>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "customer", plural: "customers" }}
                itemCount={customers.data?.customers.length ?? 0}
                headings={customerHeadings as [{ title: string }, ...{ title: string }[]]}
                selectable={false}
              >
                {customers.data?.customers.map((row, idx) => (
                  <IndexTable.Row id={`${row.rank}`} key={`${row.masked_email}-${row.last_order_date}`} position={idx}>
                    <IndexTable.Cell>{row.rank}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm" tone="subdued">{row.masked_email}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="semibold">{formatMoney(row.total_revenue)}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{row.orders}</IndexTable.Cell>
                    <IndexTable.Cell>{formatMoney(row.aov)}</IndexTable.Cell>
                    <IndexTable.Cell>{row.last_order_date.slice(0, 10)}</IndexTable.Cell>
                    <IndexTable.Cell>{row.days_since_last}d</IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
