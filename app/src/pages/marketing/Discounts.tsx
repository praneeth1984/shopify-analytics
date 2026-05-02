import { useState } from "react";
import {
  Page, Card, IndexTable, Banner, Text, InlineStack,
  SkeletonBodyText, EmptyState, Tooltip,
} from "@shopify/polaris";
import { useDiscountCodes } from "../../hooks/useDiscountCodes.js";
import { RangePicker } from "../../components/RangePicker.js";
import { ExportButton } from "../../components/ExportButton.js";
import { formatMoney, formatMargin } from "../../lib/format.js";
import type { DateRangePreset } from "@fbc/shared";

export function DiscountsPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const { data, loading, error } = useDiscountCodes(preset);

  const headings = [
    { title: "Code" },
    { title: "Orders" },
    { title: "Revenue" },
    { title: "Avg Discount %" },
    { title: "Avg Order Value" },
    { title: "Repeat Customer Rate" },
  ];

  return (
    <Page
      title="Discount Code Performance"
      subtitle="Which discount codes are driving orders and customer loyalty."
    >
      <Card>
        <InlineStack align="space-between" blockAlign="center" gap="400">
          <RangePicker value={preset} onChange={setPreset} />
          <ExportButton panel="discounts" preset={preset} />
        </InlineStack>
      </Card>

      {error && (
        <Banner tone="critical" title="Failed to load discount data">
          <Text as="p">{error}</Text>
        </Banner>
      )}

      {data?.plan_capped_to !== null && data?.total_count !== undefined && data.total_count > (data.plan_capped_to ?? 0) && (
        <Banner tone="info" title={`Showing top ${data.plan_capped_to ?? 10} codes`}>
          <Text as="p">
            Upgrade to Pro to see all {data.total_count} discount codes with unlimited history.
          </Text>
        </Banner>
      )}

      <Card>
        {loading ? (
          <SkeletonBodyText lines={6} />
        ) : data && data.codes.length === 0 ? (
          <EmptyState heading="No discount codes used in this period" image="">
            <Text as="p" tone="subdued">Try a wider date range.</Text>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: "discount code", plural: "discount codes" }}
            itemCount={data?.codes.length ?? 0}
            headings={headings as [{ title: string }, ...{ title: string }[]]}
            selectable={false}
          >
            {data?.codes.map((row, idx) => (
              <IndexTable.Row id={row.code} key={row.code} position={idx}>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">{row.code}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{row.orders}</IndexTable.Cell>
                <IndexTable.Cell>{formatMoney(row.revenue)}</IndexTable.Cell>
                <IndexTable.Cell>{formatMargin(row.avg_discount_pct)}</IndexTable.Cell>
                <IndexTable.Cell>{formatMoney(row.avg_order_value)}</IndexTable.Cell>
                <IndexTable.Cell>
                  {row.repeat_customer_rate !== null ? (
                    formatMargin(row.repeat_customer_rate)
                  ) : (
                    <Tooltip content="Need at least 5 unique customers to compute rate">
                      <Text as="span" tone="subdued">—</Text>
                    </Tooltip>
                  )}
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>

      {data && (
        <Text as="p" tone="subdued">
          Orders with multiple codes are counted once per code.
        </Text>
      )}
    </Page>
  );
}
