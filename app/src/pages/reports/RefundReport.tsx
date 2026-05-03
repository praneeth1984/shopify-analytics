/**
 * F45 — Refund Report.
 *
 * Top: 3 KPI cards (Total Refunded / Refund Count / % of Gross Revenue).
 * Below: Polaris IndexTable of refunds.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Card,
  Grid,
  IndexTable,
  InlineStack,
  Page,
  SkeletonBodyText,
  Text,
} from "@shopify/polaris";
import type { DateRangePreset, RefundReportResponse } from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney, formatNumber } from "../../lib/format.js";
import { RangePicker } from "../../components/RangePicker.js";
import { ExportButton } from "../../components/ExportButton.js";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso.slice(0, 10);
  }
}

export function RefundReportPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [data, setData] = useState<RefundReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ preset });
      const result = await apiFetch<RefundReportResponse>(
        `/api/metrics/refunds?${params.toString()}`,
      );
      setData(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load refunds.");
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    void load();
  }, [load]);

  const tableMarkup = useMemo(
    () =>
      (data?.refunds ?? []).map((r, idx) => (
        <IndexTable.Row id={r.refund_id} key={r.refund_id} position={idx}>
          <IndexTable.Cell>{formatDate(r.refunded_at)}</IndexTable.Cell>
          <IndexTable.Cell>{r.order_name}</IndexTable.Cell>
          <IndexTable.Cell>{formatMoney(r.amount)}</IndexTable.Cell>
          <IndexTable.Cell>{formatNumber(r.line_items_refunded)}</IndexTable.Cell>
          <IndexTable.Cell>{r.restocked ? "Yes" : "No"}</IndexTable.Cell>
          <IndexTable.Cell>{r.note ?? "—"}</IndexTable.Cell>
        </IndexTable.Row>
      )),
    [data],
  );

  return (
    <Page
      title="Refund Report"
      subtitle="Refunds in the selected period"
      backAction={{ content: "Reports", url: "/reports" }}
      primaryAction={
        <ExportButton panel="refunds" preset={preset} label="Export CSV" />
      }
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" title="Could not load refunds">
            <p>{error}</p>
          </Banner>
        ) : null}

        <Card>
          <InlineStack gap="200" wrap>
            <RangePicker value={preset} onChange={setPreset} />
          </InlineStack>
        </Card>

        {loading && !data ? (
          <Card>
            <SkeletonBodyText lines={3} />
          </Card>
        ) : null}

        {data ? (
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
              <Card>
                <BlockStack gap="200">
                  <Text as="span" variant="bodySm" tone="subdued">Total refunded</Text>
                  <Text as="p" variant="heading2xl">{formatMoney(data.summary.total_refunded)}</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
              <Card>
                <BlockStack gap="200">
                  <Text as="span" variant="bodySm" tone="subdued">Refund count</Text>
                  <Text as="p" variant="heading2xl">{formatNumber(data.summary.refund_count)}</Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Avg {formatMoney(data.summary.avg_refund)}
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
              <Card>
                <BlockStack gap="200">
                  <Text as="span" variant="bodySm" tone="subdued">% of gross revenue</Text>
                  <Text as="p" variant="heading2xl">
                    {(data.summary.pct_of_gross_revenue * 100).toFixed(1)}%
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        ) : null}

        {data ? (
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "refund", plural: "refunds" }}
              itemCount={data.refunds.length}
              selectable={false}
              loading={loading}
              headings={[
                { title: "Refund Date" },
                { title: "Order" },
                { title: "Amount" },
                { title: "Items Refunded" },
                { title: "Restocked" },
                { title: "Note" },
              ]}
              emptyState={
                <Box padding="400">
                  <Text as="p" tone="subdued">
                    No refunds in the selected period. Try expanding the date range.
                  </Text>
                </Box>
              }
            >
              {tableMarkup}
            </IndexTable>
          </Card>
        ) : null}
      </BlockStack>
    </Page>
  );
}
