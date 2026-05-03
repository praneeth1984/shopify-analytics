/**
 * F31 + F48 — Fulfillment Operations + Shipping Report.
 *
 * Tabs: Unfulfilled / Stuck (Paid) / Partial / Performance / Shipping.
 * The first three are operational lists with no date range; the last two are
 * date-range aggregates.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  IndexTable,
  InlineStack,
  Page,
  SkeletonBodyText,
  Tabs,
  Text,
} from "@shopify/polaris";
import type {
  DateRangePreset,
  FulfillmentResponse,
  FulfillmentView,
} from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney, formatNumber } from "../../lib/format.js";
import { RangePicker } from "../../components/RangePicker.js";
import { TablePagination, useClientPagination } from "../../components/TablePagination.js";

const TABS: { id: FulfillmentView; content: string; panelID: string }[] = [
  { id: "unfulfilled", content: "Unfulfilled", panelID: "unfulfilled-panel" },
  { id: "stuck", content: "Stuck (Paid)", panelID: "stuck-panel" },
  { id: "partial", content: "Partially Shipped", panelID: "partial-panel" },
  { id: "performance", content: "Performance", panelID: "perf-panel" },
  { id: "shipping", content: "Shipping", panelID: "shipping-panel" },
];

const STUCK_DAYS_ALERT = 3;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso.slice(0, 10);
  }
}

export function FulfillmentReportPage() {
  const [tabIdx, setTabIdx] = useState(0);
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [data, setData] = useState<FulfillmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const view = TABS[tabIdx]?.id ?? "unfulfilled";
  const isRangeView = view === "performance" || view === "shipping";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view });
      if (isRangeView) params.set("preset", preset);
      const result = await apiFetch<FulfillmentResponse>(
        `/api/metrics/fulfillment?${params.toString()}`,
      );
      setData(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load fulfillment data.");
    } finally {
      setLoading(false);
    }
  }, [view, preset, isRangeView]);

  useEffect(() => {
    void load();
  }, [load]);

  const operationalRows = useMemo(() => {
    if (!data || data.view === "performance" || data.view === "shipping") return [];
    return data.rows;
  }, [data]);

  const hasOldStuck = operationalRows.some((r) => r.days_waiting > STUCK_DAYS_ALERT);
  const pgOp = useClientPagination(operationalRows);
  const shippingRows = useMemo(() => {
    if (!data || data.view !== "shipping") return [];
    return data.rows;
  }, [data]);
  const pgShipping = useClientPagination(shippingRows);

  return (
    <Page
      title="Fulfillment"
      subtitle="Operational view of orders, fulfillment timing, and shipping P&L"
      backAction={{ content: "Reports", url: "/reports" }}
    >
      <BlockStack gap="400">
        {error && (
          <Banner tone="critical" title="Could not load fulfillment data">
            <p>{error}</p>
          </Banner>
        )}

        <Card padding="0">
          <Tabs
            tabs={TABS}
            selected={tabIdx}
            onSelect={(i) => setTabIdx(i)}
          />
        </Card>

        {isRangeView && (
          <Card>
            <InlineStack gap="200" blockAlign="center">
              <RangePicker value={preset} onChange={setPreset} />
            </InlineStack>
          </Card>
        )}

        {!isRangeView && hasOldStuck && (
          <Banner tone="warning" title="Stale orders need attention">
            <p>
              You have orders waiting longer than {STUCK_DAYS_ALERT} days. Customers
              who pay but don't see shipping updates often initiate chargebacks.
            </p>
          </Banner>
        )}

        {loading && !data ? (
          <Card>
            <SkeletonBodyText lines={6} />
          </Card>
        ) : null}

        {data && (data.view === "unfulfilled" || data.view === "stuck" || data.view === "partial") && (
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "order", plural: "orders" }}
              itemCount={pgOp.page.length}
              selectable={false}
              loading={loading}
              headings={[
                { title: "Order" }, { title: "Created" }, { title: "Days waiting" },
                { title: "Items" }, { title: "Total" }, { title: "Payment" },
              ]}
              emptyState={
                <Box padding="400">
                  <Text as="p" tone="subdued">No orders match this view. Nothing's stuck.</Text>
                </Box>
              }
            >
              {pgOp.page.map((r, idx) => (
                <IndexTable.Row id={r.order_id} key={r.order_id} position={idx}>
                  <IndexTable.Cell>{r.name}</IndexTable.Cell>
                  <IndexTable.Cell>{formatDate(r.created_at)}</IndexTable.Cell>
                  <IndexTable.Cell>
                    {r.days_waiting > STUCK_DAYS_ALERT
                      ? <Badge tone="warning">{`${r.days_waiting} days`}</Badge>
                      : `${r.days_waiting} days`}
                  </IndexTable.Cell>
                  <IndexTable.Cell>{formatNumber(r.item_count)}</IndexTable.Cell>
                  <IndexTable.Cell>{formatMoney(r.total_price)}</IndexTable.Cell>
                  <IndexTable.Cell>{r.financial_status ?? "—"}</IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
            <TablePagination {...pgOp.props} />
          </Card>
        )}

        {data && data.view === "performance" && (
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="600" wrap>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Median fulfillment time
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {data.performance.median_fulfillment_days !== null
                      ? `${data.performance.median_fulfillment_days} days`
                      : "—"}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    % within 3 days
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {`${(data.performance.pct_within_3d * 100).toFixed(1)}%`}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Total fulfilled
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {formatNumber(data.performance.total_fulfilled)}
                  </Text>
                </BlockStack>
              </InlineStack>

              <Text as="p" variant="bodySm" tone="subdued">
                {`Within 1 day: ${(data.performance.pct_within_1d * 100).toFixed(1)}% — `}
                {`within 7 days: ${(data.performance.pct_within_7d * 100).toFixed(1)}%`}
              </Text>

              {data.performance.total_fulfilled === 0 && (
                <Text as="p" tone="subdued">
                  No fulfilled orders in this period — try a wider date range.
                </Text>
              )}
            </BlockStack>
          </Card>
        )}

        {data && data.view === "shipping" && (
          <Card padding="0">
            <Box padding="300">
              <Text as="p" variant="bodySm" tone="subdued">
                Carrier cost is not exposed by the Shopify Admin API. Shipping P&L
                will appear once a carrier integration (e.g. ShipStation) is connected.
              </Text>
            </Box>
            <IndexTable
              resourceName={{ singular: "order", plural: "orders" }}
              itemCount={pgShipping.page.length}
              selectable={false}
              loading={loading}
              headings={[
                { title: "Order" }, { title: "Carrier" }, { title: "Service" },
                { title: "Charged" }, { title: "Carrier Cost" }, { title: "P&L" },
              ]}
              emptyState={
                <Box padding="400">
                  <Text as="p" tone="subdued">No orders with shipping in this period.</Text>
                </Box>
              }
            >
              {pgShipping.page.map((r, idx) => (
                <IndexTable.Row id={r.order_id} key={r.order_id} position={idx}>
                  <IndexTable.Cell>{r.name}</IndexTable.Cell>
                  <IndexTable.Cell>{r.carrier ?? "—"}</IndexTable.Cell>
                  <IndexTable.Cell>{r.service ?? "—"}</IndexTable.Cell>
                  <IndexTable.Cell>{formatMoney(r.shipping_charged)}</IndexTable.Cell>
                  <IndexTable.Cell>{r.carrier_cost ? formatMoney(r.carrier_cost) : "—"}</IndexTable.Cell>
                  <IndexTable.Cell>{r.shipping_pnl ? formatMoney(r.shipping_pnl) : "—"}</IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
            <TablePagination {...pgShipping.props} />
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
