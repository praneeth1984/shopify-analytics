/**
 * F43 — Order Report.
 *
 * Polaris IndexTable with date range, payment status, fulfillment status
 * filters and cursor-based "Load more" pagination. Each row's order #
 * deep-links into Shopify admin in a new tab.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  IndexTable,
  InlineStack,
  Page,
  Select,
  Text,
} from "@shopify/polaris";
import type {
  DateRangePreset,
  FulfillmentFilter,
  OrderReportResponse,
  OrderRow,
  OrderStatusFilter,
} from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney, formatNumber } from "../../lib/format.js";
import { RangePicker } from "../../components/RangePicker.js";
import { ExportButton } from "../../components/ExportButton.js";

const STATUS_OPTIONS: { label: string; value: OrderStatusFilter }[] = [
  { label: "All payments", value: "all" },
  { label: "Paid", value: "paid" },
  { label: "Pending", value: "pending" },
  { label: "Refunded", value: "refunded" },
  { label: "Cancelled", value: "cancelled" },
];

const FULFILLMENT_OPTIONS: { label: string; value: FulfillmentFilter }[] = [
  { label: "All fulfillments", value: "all" },
  { label: "Fulfilled", value: "fulfilled" },
  { label: "Unfulfilled", value: "unfulfilled" },
  { label: "Partial", value: "partial" },
];

function getShopDomain(): string | null {
  if (typeof window === "undefined") return null;
  return window.shopify?.config?.shop ?? null;
}

function buildAdminUrl(shop: string | null, orderId: string): string {
  if (!shop) return "#";
  const handle = shop.replace(".myshopify.com", "");
  return `https://${handle}.myshopify.com/admin/orders/${orderId}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso.slice(0, 10);
  }
}

export function OrderReportPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [status, setStatus] = useState<OrderStatusFilter>("all");
  const [fulfillment, setFulfillment] = useState<FulfillmentFilter>("all");
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shopDomain = getShopDomain();

  const buildUrl = useCallback(
    (cursorValue: string | null): string => {
      const params = new URLSearchParams({ preset, status, fulfillment });
      if (cursorValue) params.set("cursor", cursorValue);
      return `/api/metrics/orders?${params.toString()}`;
    },
    [preset, status, fulfillment],
  );

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<OrderReportResponse>(buildUrl(null));
      setRows(result.orders);
      setCursor(result.cursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const result = await apiFetch<OrderReportResponse>(buildUrl(cursor));
      setRows((prev) => [...prev, ...result.orders]);
      setCursor(result.cursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load more.");
    } finally {
      setLoadingMore(false);
    }
  }, [buildUrl, cursor]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const tableMarkup = useMemo(
    () =>
      rows.map((r, idx) => (
        <IndexTable.Row id={r.id} key={r.id} position={idx}>
          <IndexTable.Cell>
            <a
              href={buildAdminUrl(shopDomain, r.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {r.name}
            </a>
          </IndexTable.Cell>
          <IndexTable.Cell>{formatDate(r.created_at)}</IndexTable.Cell>
          <IndexTable.Cell>{r.channel ?? "—"}</IndexTable.Cell>
          <IndexTable.Cell>{r.payment_status ?? "—"}</IndexTable.Cell>
          <IndexTable.Cell>{r.fulfillment_status ?? "—"}</IndexTable.Cell>
          <IndexTable.Cell>{formatNumber(r.line_item_count)}</IndexTable.Cell>
          <IndexTable.Cell>{formatMoney(r.gross_revenue)}</IndexTable.Cell>
          <IndexTable.Cell>{formatMoney(r.discounts)}</IndexTable.Cell>
          <IndexTable.Cell>{formatMoney(r.shipping)}</IndexTable.Cell>
          <IndexTable.Cell>{formatMoney(r.tax)}</IndexTable.Cell>
          <IndexTable.Cell>{formatMoney(r.net_revenue)}</IndexTable.Cell>
          <IndexTable.Cell>{r.gateway ?? "—"}</IndexTable.Cell>
        </IndexTable.Row>
      )),
    [rows, shopDomain],
  );

  return (
    <Page
      title="Order Report"
      subtitle="Raw order rows with filters, deep-link to Shopify admin"
      backAction={{ content: "Reports", url: "/reports" }}
      primaryAction={
        <ExportButton panel="orders" preset={preset} label="Export CSV" />
      }
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" title="Could not load orders">
            <p>{error}</p>
          </Banner>
        ) : null}

        <Card>
          <InlineStack gap="200" wrap>
            <RangePicker value={preset} onChange={setPreset} />
            <Select
              label="Payment status"
              labelHidden
              options={STATUS_OPTIONS}
              value={status}
              onChange={(v) => setStatus(v as OrderStatusFilter)}
            />
            <Select
              label="Fulfillment status"
              labelHidden
              options={FULFILLMENT_OPTIONS}
              value={fulfillment}
              onChange={(v) => setFulfillment(v as FulfillmentFilter)}
            />
          </InlineStack>
        </Card>

        <Card padding="0">
          <IndexTable
            resourceName={{ singular: "order", plural: "orders" }}
            itemCount={rows.length}
            selectable={false}
            loading={loading && rows.length === 0}
            headings={[
              { title: "Order" },
              { title: "Date" },
              { title: "Channel" },
              { title: "Payment" },
              { title: "Fulfillment" },
              { title: "Items" },
              { title: "Gross Revenue" },
              { title: "Discounts" },
              { title: "Shipping" },
              { title: "Tax" },
              { title: "Net Revenue" },
              { title: "Gateway" },
            ]}
            emptyState={
              <Box padding="400">
                <Text as="p" tone="subdued">
                  No orders match the current filters. Try expanding the date range or clearing the status filter.
                </Text>
              </Box>
            }
          >
            {tableMarkup}
          </IndexTable>

          {cursor ? (
            <Box padding="300">
              <InlineStack align="center">
                <Button onClick={loadMore} loading={loadingMore}>
                  Load more
                </Button>
              </InlineStack>
            </Box>
          ) : null}
        </Card>
      </BlockStack>
    </Page>
  );
}
