import { useState } from "react";
import {
  Page, Card, IndexTable, Banner, Text, InlineStack, BlockStack,
  SkeletonBodyText, EmptyState, Tooltip,
} from "@shopify/polaris";
import { usePriceAnalysis } from "../../hooks/usePriceAnalysis.js";
import { RangePicker } from "../../components/RangePicker.js";
import { formatMoney, formatMargin } from "../../lib/format.js";
import type { DateRangePreset } from "@fbc/shared";

export function PriceAnalysisPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const { data, loading, error } = usePriceAnalysis(preset);

  const headings = [
    { title: "Price Band" },
    { title: "Products" },
    { title: "Units Sold" },
    { title: "Revenue" },
    { title: "Avg Margin" },
    { title: "Return Rate" },
  ] as [{ title: string }, ...{ title: string }[]];

  const hasData = data && data.bands.some((b) => b.units_sold > 0);

  return (
    <Page
      title="Price Point Analysis"
      subtitle="How sales volume and margin distribute across price tiers."
    >
      <BlockStack gap="400">
        <Card>
          <RangePicker value={preset} onChange={setPreset} />
        </Card>

        {error && (
          <Banner tone="critical" title="Failed to load price analysis">
            <Text as="p">{error}</Text>
          </Banner>
        )}

        <Card>
          {loading ? (
            <SkeletonBodyText lines={6} />
          ) : !hasData ? (
            <EmptyState heading="No orders in this period" image="">
              <Text as="p" tone="subdued">Try a wider date range.</Text>
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={{ singular: "price band", plural: "price bands" }}
              itemCount={data?.bands.length ?? 0}
              headings={headings}
              selectable={false}
            >
              {data?.bands.map((row, idx) => (
                <IndexTable.Row id={row.band.label} key={row.band.label} position={idx}>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">{row.band.label}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{row.products}</IndexTable.Cell>
                  <IndexTable.Cell>{row.units_sold}</IndexTable.Cell>
                  <IndexTable.Cell>{formatMoney(row.revenue)}</IndexTable.Cell>
                  <IndexTable.Cell>
                    {row.avg_margin_pct !== null ? (
                      formatMargin(row.avg_margin_pct)
                    ) : (
                      <Tooltip content="Add COGS in Settings to see margin per price band">
                        <Text as="span" tone="subdued">—</Text>
                      </Tooltip>
                    )}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {row.return_rate > 0 ? formatMargin(row.return_rate) : "—"}
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
