import { useState } from "react";
import {
  Page, Card, IndexTable, Banner, Text, InlineStack, BlockStack,
  SkeletonBodyText, EmptyState, Badge,
} from "@shopify/polaris";
import { useProductAffinity } from "../../hooks/useProductAffinity.js";
import { RangePicker } from "../../components/RangePicker.js";
import { formatMargin } from "../../lib/format.js";
import type { DateRangePreset } from "@fbc/shared";

export function ProductAffinityPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const { data, loading, error } = useProductAffinity(preset);

  const headings = [
    { title: "Product A" },
    { title: "Product B" },
    { title: "Co-purchases" },
    { title: "% of A's orders" },
  ] as [{ title: string }, ...{ title: string }[]];

  return (
    <Page
      title="Product Affinity"
      subtitle="Products most frequently purchased together in the same order."
    >
      <BlockStack gap="400">
        <Card>
          <RangePicker value={preset} onChange={setPreset} />
        </Card>

        {error && (
          <Banner tone="critical" title="Failed to load affinity data">
            <Text as="p">{error}</Text>
          </Banner>
        )}

        {data?.plan_capped_to !== null &&
          data?.total_count !== undefined &&
          data.total_count > (data.plan_capped_to ?? 0) && (
            <Banner tone="info" title={`Showing top ${data.plan_capped_to} product pairs`}>
              <Text as="p">
                Upgrade to Pro to see all {data.total_count} pairs with unlimited history.
              </Text>
            </Banner>
          )}

        <Card>
          {loading ? (
            <SkeletonBodyText lines={6} />
          ) : data && data.pairs.length === 0 ? (
            <EmptyState heading="No product pairs found" image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E">
              <Text as="p" tone="subdued">
                Need at least 3 co-purchases per pair. Try a wider date range.
              </Text>
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={{ singular: "pair", plural: "pairs" }}
              itemCount={data?.pairs.length ?? 0}
              headings={headings}
              selectable={false}
            >
              {data?.pairs.map((row, idx) => (
                <IndexTable.Row
                  id={`${row.product_a_id}-${row.product_b_id}`}
                  key={`${row.product_a_id}-${row.product_b_id}`}
                  position={idx}
                >
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">{row.product_a_title}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">{row.product_b_title}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge>{String(row.co_purchase_count)}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{formatMargin(row.pct_of_a_orders)}</IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>

        {data && (
          <Text as="p" tone="subdued">
            Only pairs with ≥3 co-purchases are shown. Products from the same variant family are
            counted as one product.
          </Text>
        )}
      </BlockStack>
    </Page>
  );
}
