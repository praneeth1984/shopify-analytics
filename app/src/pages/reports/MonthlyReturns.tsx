/**
 * F47 — Order vs Return (Monthly).
 */

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  Banner, BlockStack, Card, DataTable, Page, SkeletonBodyText, Text,
} from "@shopify/polaris";
import type { MonthlyReturnsResponse } from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney, formatNumber } from "../../lib/format.js";
import { ChartSkeleton } from "../../components/charts/ChartSkeleton.js";
import { TablePagination, useClientPagination } from "../../components/TablePagination.js";

const MonthlyReturnsChart = lazy(() => import("../../components/charts/MonthlyReturnsChart.js"));

export function MonthlyReturnsPage() {
  const [data, setData] = useState<MonthlyReturnsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<MonthlyReturnsResponse>("/api/metrics/returns/monthly"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load monthly returns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pg = useClientPagination(data?.rows ?? []);

  return (
    <Page
      title="Order vs Return (Monthly)"
      subtitle="Monthly orders, returned orders, and return rate"
      backAction={{ content: "Reports", url: "/reports" }}
    >
      <BlockStack gap="400">
        {error && <Banner tone="critical" title="Could not load monthly returns"><p>{error}</p></Banner>}
        {loading && !data && <Card><SkeletonBodyText lines={4} /></Card>}

        {data && (
          <>
            <Suspense fallback={<ChartSkeleton />}>
              <MonthlyReturnsChart rows={data.rows} />
            </Suspense>

            <Card padding="0">
              <DataTable
                columnContentTypes={["text","numeric","numeric","numeric","numeric","numeric","numeric"]}
                headings={["Month","Orders","Returned","Return Rate","Gross Revenue","Refunded","Net Revenue"]}
                rows={pg.page.map((r) => [
                  r.month,
                  formatNumber(r.orders),
                  formatNumber(r.returned_orders),
                  `${r.return_rate_pct.toFixed(1)}%`,
                  formatMoney(r.gross_revenue),
                  formatMoney(r.refunded),
                  formatMoney(r.net_revenue),
                ])}
              />
              <TablePagination {...pg.props} />
            </Card>

            {data.months_back === 6 && (
              <Text as="p" tone="subdued" variant="bodySm">
                Showing the last 6 months on Free. Pro unlocks 12 months.
              </Text>
            )}
          </>
        )}
      </BlockStack>
    </Page>
  );
}
