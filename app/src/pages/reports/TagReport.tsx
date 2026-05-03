import { useCallback, useEffect, useState } from "react";
import {
  Banner, BlockStack, Card, DataTable, InlineStack,
  Page, SkeletonBodyText, Tabs, Text,
} from "@shopify/polaris";
import type { DateRangePreset, OrderTagRow, ProductTagRow, TagReportResponse, TagReportType } from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney, formatNumber } from "../../lib/format.js";
import { RangePicker } from "../../components/RangePicker.js";
import { TablePagination, useClientPagination } from "../../components/TablePagination.js";

const TABS: { id: TagReportType; content: string; panelID: string }[] = [
  { id: "order", content: "Order Tags", panelID: "order-panel" },
  { id: "product", content: "Product Tags", panelID: "product-panel" },
  { id: "customer", content: "Customer Tags", panelID: "customer-panel" },
];

function OrderTagTable({ rows }: { rows: OrderTagRow[] }) {
  const pg = useClientPagination(rows);
  return (
    <>
      <DataTable
        columnContentTypes={["text", "numeric", "text", "text"]}
        headings={["Tag", "Orders", "Revenue", "AOV"]}
        rows={pg.page.map((r) => [r.tag || "(no tag)", formatNumber(r.order_count), formatMoney(r.revenue), formatMoney(r.aov)])}
      />
      <TablePagination {...pg.props} />
    </>
  );
}

function ProductTagTable({ rows }: { rows: ProductTagRow[] }) {
  const pg = useClientPagination(rows);
  return (
    <>
      <DataTable
        columnContentTypes={["text", "numeric", "numeric", "text"]}
        headings={["Tag", "Products", "Units sold", "Revenue"]}
        rows={pg.page.map((r) => [r.tag || "(no tag)", formatNumber(r.products_with_tag), formatNumber(r.units_sold), formatMoney(r.revenue)])}
      />
      <TablePagination {...pg.props} />
    </>
  );
}

export function TagReportPage() {
  const [tabIdx, setTabIdx] = useState(0);
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [data, setData] = useState<TagReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const type = TABS[tabIdx]?.id ?? "order";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<TagReportResponse>(`/api/metrics/tags?type=${type}&preset=${preset}`);
      setData(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load tag report.");
    } finally {
      setLoading(false);
    }
  }, [type, preset]);

  useEffect(() => { void load(); }, [load]);

  const proOnly = data !== null && "pro_only" in data;

  return (
    <Page
      title="Tag Reports"
      subtitle="Revenue and order metrics grouped by order, product, or customer tags"
      backAction={{ content: "Reports", url: "/reports" }}
    >
      <BlockStack gap="400">
        {error && <Banner tone="critical"><Text as="p">{error}</Text></Banner>}

        <Card padding="0">
          <Tabs tabs={TABS} selected={tabIdx} onSelect={setTabIdx} />
        </Card>

        <Card>
          <InlineStack blockAlign="center">
            <RangePicker value={preset} onChange={setPreset} />
          </InlineStack>
        </Card>

        {loading && <Card><SkeletonBodyText lines={6} /></Card>}

        {!loading && proOnly && (
          <Banner tone="info">
            <Text as="p" variant="bodySm">Customer tag reports are available on the Pro plan.</Text>
          </Banner>
        )}

        {!loading && data && !proOnly && data.plan_capped_to !== null && (
          <Banner tone="info">
            <Text as="p" variant="bodySm">
              Free plan: showing top {data.plan_capped_to} tags. Upgrade to Pro for all tags.
            </Text>
          </Banner>
        )}

        {!loading && data && !proOnly && (
          <Card padding="0">
            {data.type === "order" && data.rows.length > 0 && <OrderTagTable rows={data.rows} />}
            {data.type === "product" && data.rows.length > 0 && <ProductTagTable rows={data.rows as ProductTagRow[]} />}
            {data.rows.length === 0 && (
              <Text as="p" tone="subdued">No tags found in this date range.</Text>
            )}
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
