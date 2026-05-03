import { useState } from "react";
import {
  Page, Card, IndexTable, Banner, Text, InlineStack,
  SkeletonBodyText, EmptyState, Tooltip,
} from "@shopify/polaris";
import { usePaymentMix } from "../../hooks/usePaymentMix.js";
import { RangePicker } from "../../components/RangePicker.js";
import { ExportButton } from "../../components/ExportButton.js";
import { formatMoney, formatMargin } from "../../lib/format.js";
import type { DateRangePreset } from "@fbc/shared";

export function PaymentsPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const { data, loading, error } = usePaymentMix(preset);

  const headings = [
    { title: "Gateway" },
    { title: "Orders" },
    { title: "Revenue" },
    { title: "Est. Fees" },
    { title: "Est. Net" },
    { title: "% of Revenue" },
  ];

  return (
    <Page
      title="Payment Method Mix"
      subtitle="Revenue breakdown and estimated processing fees per gateway."
    >
      <Card>
        <InlineStack align="space-between" blockAlign="center" gap="400">
          <RangePicker value={preset} onChange={setPreset} />
          <ExportButton panel="payments" preset={preset} />
        </InlineStack>
      </Card>

      {error && (
        <Banner tone="critical" title="Failed to load payment data">
          <Text as="p">{error}</Text>
        </Banner>
      )}

      {data && !data.rates_configured && (
        <Banner tone="info" title="Configure gateway rates for accurate fee estimates">
          <Text as="p">
            Add your payment processing rates in Settings → Gateways to see estimated fees.
            Default rates are being used for now.
          </Text>
        </Banner>
      )}

      <Banner tone="info" title="Fees are estimates">
        <Text as="p">
          Based on your configured rates. Actual fees may differ. Configure rates in Settings → Gateways.
        </Text>
      </Banner>

      <Card>
        {loading ? (
          <SkeletonBodyText lines={5} />
        ) : data && data.rows.length === 0 ? (
          <EmptyState heading="No orders in this period" image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E">
            <Text as="p" tone="subdued">Try a wider date range.</Text>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: "gateway", plural: "gateways" }}
            itemCount={data?.rows.length ?? 0}
            headings={headings as [{ title: string }, ...{ title: string }[]]}
            selectable={false}
          >
            {data?.rows.map((row, idx) => (
              <IndexTable.Row id={row.gateway} key={row.gateway} position={idx}>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">{row.display_name}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{row.orders}</IndexTable.Cell>
                <IndexTable.Cell>{formatMoney(row.revenue)}</IndexTable.Cell>
                <IndexTable.Cell>
                  <Tooltip content="Estimated based on configured rates">
                    <Text as="span" tone="subdued">{formatMoney(row.est_fees)}</Text>
                  </Tooltip>
                </IndexTable.Cell>
                <IndexTable.Cell>{formatMoney(row.est_net)}</IndexTable.Cell>
                <IndexTable.Cell>{formatMargin(row.pct_of_revenue)}</IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>
    </Page>
  );
}
