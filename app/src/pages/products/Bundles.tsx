import { useState } from "react";
import {
  Card, IndexTable, Banner, Text, InlineStack, Badge,
  SkeletonBodyText, EmptyState, BlockStack,
} from "@shopify/polaris";
import { useBundles } from "../../hooks/useBundles.js";
import { RangePicker } from "../../components/RangePicker.js";
import type { DateRangePreset } from "@fbc/shared";

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function BundlesPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const { data, loading, error } = useBundles(preset);

  const headings = [
    { title: "Product A" },
    { title: "Product B" },
    { title: "Co-Purchased" },
    { title: "% of Either's Orders" },
  ];

  return (
    <BlockStack gap="400">
      <Card>
        <InlineStack align="space-between" blockAlign="center" gap="400">
          <RangePicker value={preset} onChange={setPreset} />
          {data?.plan_capped_to !== null && data?.total_count !== undefined && data.total_count > (data.plan_capped_to ?? 0) && (
            <Badge tone="info">{`Pro: see all ${data.total_count} bundles`}</Badge>
          )}
        </InlineStack>
      </Card>

      {error && (
        <Banner tone="critical" title="Failed to load bundle insights">
          <Text as="p">{error}</Text>
        </Banner>
      )}

      <Card>
        {loading ? (
          <SkeletonBodyText lines={6} />
        ) : data && data.bundles.length === 0 ? (
          <EmptyState heading="No strong bundles detected" image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E">
            <Text as="p" tone="subdued">
              Bundle pairs require ≥3 co-purchases in at least 5% of either product&apos;s orders.
              Try a wider date range.
            </Text>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: "bundle", plural: "bundles" }}
            itemCount={data?.bundles.length ?? 0}
            headings={headings as [{ title: string }, ...{ title: string }[]]}
            selectable={false}
          >
            {data?.bundles.map((row, idx) => (
              <IndexTable.Row id={`${row.product_a_id}|${row.product_b_id}`} key={`${row.product_a_id}|${row.product_b_id}`} position={idx}>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">{row.product_a_title}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">{row.product_b_title}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{row.co_purchase_count}</IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={row.pct_of_either_orders >= 0.2 ? "success" : undefined}>
                    {fmtPct(row.pct_of_either_orders)}
                  </Badge>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>

      <Text as="p" variant="bodySm" tone="subdued">
        Bundle pairs appear in ≥5% of either product&apos;s orders. Strong candidates for
        bundle offers or frequently-bought-together upsells.
      </Text>
    </BlockStack>
  );
}
