import { useCallback, useEffect, useState } from "react";
import {
  Banner, BlockStack, Card, DataTable, InlineStack,
  Page, SkeletonBodyText, Tabs, Text,
} from "@shopify/polaris";
import type { BillingLocationResponse, CurrencyResponse, DateRangePreset } from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney, formatNumber } from "../../lib/format.js";
import { RangePicker } from "../../components/RangePicker.js";
import { TablePagination, useClientPagination } from "../../components/TablePagination.js";

const TABS = [
  { id: "billing", content: "By Country", panelID: "billing-panel" },
  { id: "currency", content: "By Currency", panelID: "currency-panel" },
];

export function BillingLocationPage() {
  const [tabIdx, setTabIdx] = useState(0);
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [billingData, setBillingData] = useState<BillingLocationResponse | null>(null);
  const [currencyData, setCurrencyData] = useState<CurrencyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ preset });
      if (tabIdx === 0) {
        setBillingData(await apiFetch<BillingLocationResponse>(`/api/metrics/geography/billing?${params}`));
      } else {
        setCurrencyData(await apiFetch<CurrencyResponse>(`/api/metrics/geography/currency?${params}`));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [tabIdx, preset]);

  useEffect(() => { void load(); }, [load]);

  const pgBilling = useClientPagination(billingData?.rows ?? []);
  const pgCurrency = useClientPagination(currencyData?.rows ?? []);

  return (
    <Page
      title="Billing Location & Currency"
      subtitle="Sales breakdown by customer billing country and checkout currency"
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

        {!loading && tabIdx === 0 && billingData && (
          <>
            {billingData.no_billing_address_count > 0 && (
              <Banner tone="info">
                <Text as="p" variant="bodySm">
                  {billingData.no_billing_address_count} orders have no billing address and are excluded.
                </Text>
              </Banner>
            )}
            <Card padding="0">
              <DataTable
                columnContentTypes={["text", "text", "numeric", "text", "text"]}
                headings={["Country", "Province", "Orders", "Revenue", "AOV"]}
                rows={pgBilling.page.map((r) => [
                  r.country_name || r.country_code,
                  r.province ?? "—",
                  formatNumber(r.orders),
                  formatMoney(r.revenue),
                  formatMoney(r.aov),
                ])}
              />
              <TablePagination {...pgBilling.props} />
            </Card>
          </>
        )}

        {!loading && tabIdx === 1 && currencyData && (
          <Card padding="0">
            <DataTable
              columnContentTypes={["text", "numeric", "text", "text", "numeric"]}
              headings={["Currency", "Orders", "Presentment revenue", "Shop revenue", "Avg rate"]}
              rows={pgCurrency.page.map((r) => [
                r.currency,
                formatNumber(r.orders),
                formatMoney(r.revenue_presentment),
                formatMoney(r.revenue_shop),
                r.avg_rate.toFixed(4),
              ])}
            />
            <TablePagination {...pgCurrency.props} />
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
