import { useState } from "react";
import {
  BlockStack, Card, Text, InlineStack, Banner, Badge,
  SkeletonBodyText, EmptyState, IndexTable,
} from "@shopify/polaris";
import { useRfm } from "../../hooks/useRfm.js";
import { RangePicker } from "../../components/RangePicker.js";
import { formatMoney } from "../../lib/format.js";
import type { DateRangePreset, RfmSegmentLabel } from "@fbc/shared";

const SEGMENT_META: Record<RfmSegmentLabel, { label: string; tone: "success" | "warning" | "critical" | undefined; description: string }> = {
  champions: { label: "Champions", tone: "success", description: "High frequency, high spend, recent" },
  loyal: { label: "Loyal", tone: "success", description: "Order often, good spenders" },
  potential_loyalist: { label: "Potential Loyalists", tone: undefined, description: "Recent customers, moderate frequency" },
  at_risk: { label: "At Risk", tone: "warning", description: "Used to order often but haven't recently" },
  cant_lose: { label: "Can't Lose", tone: "warning", description: "Big spenders who went quiet" },
  hibernating: { label: "Hibernating", tone: "critical", description: "Low recency and low frequency" },
  lost: { label: "Lost", tone: "critical", description: "Very low recency, low frequency" },
};

export function RfmPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_90_days");
  const { data, loading, error } = useRfm(preset);

  const headings = [
    { title: "Segment" },
    { title: "Description" },
    { title: "Customers" },
    { title: "% of Total" },
    { title: "Avg Orders" },
    { title: "Avg Revenue" },
    { title: "Avg Days Since Last" },
  ];

  return (
    <BlockStack gap="400">
      <Card>
        <InlineStack align="space-between" blockAlign="center" gap="400">
          <RangePicker value={preset} onChange={setPreset} />
          {data && (
            <Text as="p" tone="subdued">{`${data.total_customers} customers analyzed`}</Text>
          )}
        </InlineStack>
      </Card>

      {error && (
        <Banner tone="critical" title="Failed to load RFM segments">
          <Text as="p">{error}</Text>
        </Banner>
      )}

      <Card>
        {loading ? (
          <SkeletonBodyText lines={8} />
        ) : data && data.segments.length === 0 ? (
          <EmptyState heading="Not enough customer data" image="">
            <Text as="p" tone="subdued">
              RFM segmentation requires at least a few customers with order history.
              Try a wider date range.
            </Text>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: "segment", plural: "segments" }}
            itemCount={data?.segments.length ?? 0}
            headings={headings as [{ title: string }, ...{ title: string }[]]}
            selectable={false}
          >
            {data?.segments.map((seg, idx) => {
              const meta = SEGMENT_META[seg.segment];
              return (
                <IndexTable.Row id={seg.segment} key={seg.segment} position={idx}>
                  <IndexTable.Cell>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" tone="subdued">{meta.description}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">{String(seg.count)}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{`${(seg.pct_of_customers * 100).toFixed(1)}%`}</IndexTable.Cell>
                  <IndexTable.Cell>{seg.avg_orders.toFixed(1)}</IndexTable.Cell>
                  <IndexTable.Cell>{formatMoney(seg.avg_revenue)}</IndexTable.Cell>
                  <IndexTable.Cell>{`${seg.avg_days_since_last}d`}</IndexTable.Cell>
                </IndexTable.Row>
              );
            })}
          </IndexTable>
        )}
      </Card>

      <Text as="p" variant="bodySm" tone="subdued">
        RFM segments customers by Recency, Frequency, and Monetary value within the selected period.
        Use segments to target re-engagement campaigns.
      </Text>
    </BlockStack>
  );
}
