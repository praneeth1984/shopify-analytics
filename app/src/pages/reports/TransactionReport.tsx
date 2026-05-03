import { useCallback, useEffect, useState } from "react";
import {
  Badge, Banner, BlockStack, Card, DataTable,
  InlineStack, Page, SkeletonBodyText, Tabs, Text,
} from "@shopify/polaris";
import type { DateRangePreset, TransactionResponse, TransactionView } from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney, formatNumber } from "../../lib/format.js";
import { RangePicker } from "../../components/RangePicker.js";
import { TablePagination, useClientPagination } from "../../components/TablePagination.js";

const TABS: { id: TransactionView; content: string; panelID: string }[] = [
  { id: "by_gateway", content: "By Gateway", panelID: "gateway-panel" },
  { id: "all", content: "All Transactions", panelID: "all-panel" },
  { id: "failed", content: "Failed", panelID: "failed-panel" },
];

export function TransactionReportPage() {
  const [tabIdx, setTabIdx] = useState(0);
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [data, setData] = useState<TransactionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = TABS[tabIdx]?.id ?? "by_gateway";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<TransactionResponse>(
        `/api/metrics/transactions?view=${view}&preset=${preset}`,
      );
      setData(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  }, [view, preset]);

  useEffect(() => { void load(); }, [load]);

  const gatewayRows = data?.view === "by_gateway" ? data.rows : [];
  const txRows = data?.view === "all" || data?.view === "failed" ? data.rows : [];
  const pgGateway = useClientPagination(gatewayRows);
  const pgTx = useClientPagination(txRows);

  return (
    <Page
      title="Transactions"
      subtitle="Payment transaction status and gateway performance"
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

        {!loading && data?.view === "by_gateway" && (
          <Card padding="0">
            <DataTable
              columnContentTypes={["text", "numeric", "numeric", "text", "text", "text"]}
              headings={["Gateway", "Transactions", "Failed", "Total value", "Avg value", "Success rate"]}
              rows={pgGateway.page.map((r) => [
                r.gateway,
                formatNumber(r.transaction_count),
                r.failed_count > 0 ? <Badge tone="critical">{String(r.failed_count)}</Badge> : "0",
                formatMoney(r.total_value),
                formatMoney(r.avg_value),
                `${(r.success_rate_pct * 100).toFixed(1)}%`,
              ])}
            />
            <TablePagination {...pgGateway.props} />
          </Card>
        )}

        {!loading && data && (data.view === "all" || data.view === "failed") && (
          data.pro_only
            ? (
              <Banner tone="info">
                <Text as="p" variant="bodySm">
                  Per-transaction detail is available on the Pro plan.
                </Text>
              </Banner>
            )
            : (
              <Card padding="0">
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                  headings={["Transaction ID", "Order", "Gateway", "Amount", "Status", "Processed"]}
                  rows={pgTx.page.map((r) => [
                    r.transaction_id,
                    r.order_name,
                    r.gateway ?? "—",
                    formatMoney(r.amount),
                    r.status,
                    r.processed_at.slice(0, 10),
                  ])}
                />
                <TablePagination {...pgTx.props} />
              </Card>
            )
        )}

        {!loading && data?.rows.length === 0 && !("pro_only" in data && data.pro_only) && (
          <Card><Text as="p" tone="subdued">No transactions found for this date range.</Text></Card>
        )}
      </BlockStack>
    </Page>
  );
}
