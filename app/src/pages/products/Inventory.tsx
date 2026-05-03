import {
  Page, Card, IndexTable, Banner, Box, Text, BlockStack,
  SkeletonBodyText, EmptyState, Badge, Button, InlineStack,
} from "@shopify/polaris";
import { useInventory } from "../../hooks/useInventory.js";
import type { InventoryStatus } from "@fbc/shared";

function statusBadge(status: InventoryStatus) {
  switch (status) {
    case "out_of_stock": return <Badge tone="critical">Out of Stock</Badge>;
    case "critical":     return <Badge tone="warning">Critical</Badge>;
    case "at_risk":      return <Badge tone="warning">At Risk</Badge>;
    case "watch":        return <Badge tone="attention">Watch</Badge>;
    default:             return <Badge tone="success">Healthy</Badge>;
  }
}

export function InventoryPage() {
  const { data, loading, error, reload } = useInventory();

  const headings = [
    { title: "Product" },
    { title: "Variant" },
    { title: "SKU" },
    { title: "Stock" },
    { title: "Sold (30d)" },
    { title: "Daily Rate" },
    { title: "Days Left" },
    { title: "Status" },
  ] as [{ title: string }, ...{ title: string }[]];

  const allHealthy =
    data && data.rows.length === 0 && (data.plan_capped_to === null || data.total_count === 0);

  return (
    <Page
      title="Inventory Velocity"
      subtitle="Variants at risk of stocking out based on the last 30 days of sales."
      primaryAction={{ content: "Refresh", onAction: reload, loading }}
    >
      <BlockStack gap="400">
        {error && (
          <Banner tone="critical" title="We couldn't load this report">
            <Text as="p">
              Try refreshing in a moment. If it keeps failing, use the Feedback page to let us know.
            </Text>
            <Box paddingBlockStart="200">
              <Button onClick={reload}>Retry</Button>
            </Box>
          </Banner>
        )}

        {data?.plan_capped_to !== null && data?.total_count !== undefined && data.total_count > (data.plan_capped_to ?? 0) && (
          <Banner tone="info" title={`Showing top ${data.plan_capped_to} at-risk variants`}>
            <Text as="p">
              Upgrade to Pro to see all {data.total_count} variants including healthy inventory.
            </Text>
          </Banner>
        )}

        <Card>
          {loading ? (
            <SkeletonBodyText lines={8} />
          ) : allHealthy ? (
            <EmptyState heading="All inventory looks healthy" image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E">
              <Text as="p" tone="subdued">
                All active variants have more than 60 days of stock remaining at your current
                sell rate.
              </Text>
            </EmptyState>
          ) : data && data.rows.length === 0 ? (
            <EmptyState heading="No inventory data" image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E">
              <BlockStack gap="200">
                <Text as="p" tone="subdued">
                  No active product variants found.
                </Text>
              </BlockStack>
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={{ singular: "variant", plural: "variants" }}
              itemCount={data?.rows.length ?? 0}
              headings={headings}
              selectable={false}
            >
              {data?.rows.map((row, idx) => (
                <IndexTable.Row id={row.variant_id} key={row.variant_id} position={idx}>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">{row.product_title}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{row.variant_title}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" tone="subdued">{row.sku ?? "—"}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{row.stock}</IndexTable.Cell>
                  <IndexTable.Cell>{row.units_sold_30d}</IndexTable.Cell>
                  <IndexTable.Cell>{row.daily_sell_rate}/day</IndexTable.Cell>
                  <IndexTable.Cell>
                    {row.days_remaining !== null ? `${row.days_remaining}d` : "—"}
                  </IndexTable.Cell>
                  <IndexTable.Cell>{statusBadge(row.status)}</IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>

        {data && (
          <InlineStack align="end">
            <Text as="p" variant="bodySm" tone="subdued">
              Computed at {new Date(data.computed_at).toLocaleString()}
            </Text>
          </InlineStack>
        )}
      </BlockStack>
    </Page>
  );
}
