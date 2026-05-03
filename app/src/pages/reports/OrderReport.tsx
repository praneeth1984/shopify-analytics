/**
 * F43 — Order Report.
 *
 * Polaris IndexTable with search, sort, payment + fulfillment filters,
 * date range picker, and cursor-stack pagination. Each order # deep-links
 * into Shopify admin.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Card,
  IndexTable,
  InlineStack,
  Page,
  Select,
  SkeletonBodyText,
  Text,
  TextField,
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
import { TablePagination, DEFAULT_PAGE_SIZE } from "../../components/TablePagination.js";

type SortParam = "date_desc" | "date_asc" | "revenue_desc" | "revenue_asc" | "customer_asc";

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

const SORT_OPTIONS: { label: string; value: SortParam }[] = [
  { label: "Date (newest first)", value: "date_desc" },
  { label: "Date (oldest first)", value: "date_asc" },
  { label: "Revenue (high to low)", value: "revenue_desc" },
  { label: "Revenue (low to high)", value: "revenue_asc" },
  { label: "Customer name (A–Z)", value: "customer_asc" },
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
  const [sort, setSort] = useState<SortParam>("date_desc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // debounced value sent to API
  const [rows, setRows] = useState<OrderRow[]>([]);
  // cursorStack[n] = cursor needed to fetch page n (null = first page)
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [pageIdx, setPageIdx] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shopDomain = getShopDomain();

  // Debounce search input — wait 400 ms after the user stops typing.
  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setSearch(value.trim()), 400);
  }

  const buildUrl = useCallback(
    (cursor: string | null): string => {
      const params = new URLSearchParams({ preset, status, fulfillment, sort, limit: String(pageSize) });
      if (search) params.set("search", search);
      if (cursor) params.set("cursor", cursor);
      return `/api/metrics/orders?${params.toString()}`;
    },
    [preset, status, fulfillment, sort, search, pageSize],
  );

  const loadPage = useCallback(
    async (cursor: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFetch<OrderReportResponse>(buildUrl(cursor));
        setRows(result.orders);
        setNextCursor(result.cursor);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load orders.");
      } finally {
        setLoading(false);
      }
    },
    [buildUrl],
  );

  // Reset to page 1 whenever any filter/sort/search changes.
  useEffect(() => {
    setCursorStack([null]);
    setPageIdx(0);
    setNextCursor(null);
    void loadPage(null);
  }, [loadPage]);

  function handleNextPage() {
    if (!nextCursor) return;
    const newIdx = pageIdx + 1;
    setCursorStack((prev) => {
      const updated = [...prev];
      updated[newIdx] = nextCursor;
      return updated;
    });
    setPageIdx(newIdx);
    void loadPage(nextCursor);
  }

  function handlePrevPage() {
    if (pageIdx === 0) return;
    const newIdx = pageIdx - 1;
    setPageIdx(newIdx);
    void loadPage(cursorStack[newIdx] ?? null);
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    // Reset to first page when page size changes (buildUrl dependency triggers reload).
  }

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
          <BlockStack gap="300">
            <TextField
              label="Search orders"
              labelHidden
              placeholder="Search by order #, customer name, email…"
              value={searchInput}
              onChange={handleSearchChange}
              clearButton
              onClearButtonClick={() => { setSearchInput(""); setSearch(""); }}
              autoComplete="off"
            />
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
              <Select
                label="Sort"
                labelHidden
                options={SORT_OPTIONS}
                value={sort}
                onChange={(v) => setSort(v as SortParam)}
              />
            </InlineStack>
          </BlockStack>
        </Card>

        {loading && rows.length === 0 ? (
          <Card><SkeletonBodyText lines={8} /></Card>
        ) : (
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "order", plural: "orders" }}
              itemCount={rows.length}
              selectable={false}
              loading={loading}
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
                    No orders match the current filters. Try expanding the date range or clearing filters.
                  </Text>
                </Box>
              }
            >
              {tableMarkup}
            </IndexTable>

            <TablePagination
              pageIdx={pageIdx}
              pageSize={pageSize}
              hasNext={!!nextCursor}
              onPrev={handlePrevPage}
              onNext={handleNextPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
