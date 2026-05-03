import { useEffect, useMemo, useState } from "react";
import {
  Badge, Banner, BlockStack, Box, Card, IndexTable,
  InlineStack, Page, SkeletonBodyText, Text, useIndexResourceState,
} from "@shopify/polaris";
import type { OutstandingPaymentsResponse } from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney } from "../../lib/format.js";
import { TablePagination, useClientPagination } from "../../components/TablePagination.js";

function statusTone(status: string | null): "warning" | "attention" | "info" {
  if (!status) return "info";
  if (status.toLowerCase().includes("pending")) return "warning";
  if (status.toLowerCase().includes("authorized")) return "attention";
  return "info";
}

export function OutstandingPaymentsPage() {
  const [data, setData] = useState<OutstandingPaymentsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<OutstandingPaymentsResponse>("/api/metrics/orders/outstanding")
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const pg = useClientPagination(data?.orders ?? []);
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(pg.page.map((r) => ({ id: r.order_id })));

  const tableMarkup = useMemo(
    () => pg.page.map((r, i) => (
      <IndexTable.Row id={r.order_id} key={r.order_id} selected={selectedResources.includes(r.order_id)} position={i}>
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd" fontWeight="semibold">{r.name}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm">{r.created_at.slice(0, 10)}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={statusTone(r.financial_status)}>{r.financial_status ?? "unknown"}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm" alignment="end">{formatMoney(r.total_outstanding)}</Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    )),
    [pg.page, selectedResources],
  );

  return (
    <Page
      title="Outstanding Payments"
      subtitle="Orders with pending, authorized, or partially paid status"
      backAction={{ content: "Reports", url: "/reports" }}
    >
      <BlockStack gap="400">
        {error && <Banner tone="critical"><Text as="p">{error}</Text></Banner>}
        {loading && <Card><SkeletonBodyText lines={6} /></Card>}

        {!loading && data && (
          <>
            <Card>
              <InlineStack gap="600" wrap>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Total outstanding</Text>
                  <Text as="p" variant="heading2xl">{formatMoney(data.summary.total_outstanding)}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Orders affected</Text>
                  <Text as="p" variant="heading2xl">{String(data.summary.order_count)}</Text>
                </BlockStack>
              </InlineStack>
            </Card>

            {data.truncated && (
              <Banner tone="warning">
                <Text as="p" variant="bodySm">Showing partial results — too many outstanding orders to load at once.</Text>
              </Banner>
            )}

            <Card padding="0">
              <IndexTable
                resourceName={{ singular: "order", plural: "orders" }}
                itemCount={pg.page.length}
                selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: "Order" }, { title: "Created" },
                  { title: "Status" }, { title: "Outstanding", alignment: "end" },
                ]}
                emptyState={
                  <Box padding="400">
                    <Text as="p" tone="subdued">No outstanding payments found — all orders are settled.</Text>
                  </Box>
                }
              >
                {tableMarkup}
              </IndexTable>
              <TablePagination {...pg.props} />
            </Card>
          </>
        )}
      </BlockStack>
    </Page>
  );
}
