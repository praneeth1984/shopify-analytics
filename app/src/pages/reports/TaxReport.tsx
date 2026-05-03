import { useEffect, useState } from "react";
import {
  Banner, BlockStack, Card, DataTable,
  Page, SkeletonBodyText, Tabs, Text,
} from "@shopify/polaris";
import type { DateRangePreset } from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney } from "../../lib/format.js";
import { RangePicker } from "../../components/RangePicker.js";
import { TablePagination, useClientPagination } from "../../components/TablePagination.js";

const TAX_DISCLAIMER = "Tax collected as recorded by Shopify. Consult your accountant for official filing.";

type TaxMonthRow = { month: string; totalTaxMinor: number; currency: string; orderCount: number; jurisdictions: number };
type TaxGeoRow = { countryCode: string; provinceCode: string | null; totalTaxMinor: number; currency: string; orderCount: number };
type TaxReport = { tab: string; disclaimer: string; monthly?: TaxMonthRow[]; geo?: TaxGeoRow[]; plan: string; historyClampedTo: string | null; hasData: boolean };

const TABS = [
  { id: "monthly", content: "Monthly Summary", panelID: "monthly-panel" },
  { id: "geo", content: "By Geography", panelID: "geo-panel" },
];

export function TaxReportPage() {
  const [preset, setPreset] = useState<DateRangePreset>("month_to_date");
  const [tab, setTab] = useState(0);
  const [data, setData] = useState<TaxReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tabKey = TABS[tab]?.id ?? "monthly";

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<TaxReport>(`/api/metrics/tax?preset=${preset}&tab=${tabKey}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [preset, tabKey]);

  const pgMonthly = useClientPagination(data?.monthly ?? []);
  const pgGeo = useClientPagination(data?.geo ?? []);

  return (
    <Page title="Tax Reports" backAction={{ content: "Reports", url: "/reports" }}>
      <BlockStack gap="400">
        <Banner tone="info"><Text as="p" variant="bodySm">{TAX_DISCLAIMER}</Text></Banner>

        {data?.historyClampedTo && (
          <Banner tone="warning">
            <Text as="p" variant="bodySm">Free plan: showing last 2 months. Upgrade to Pro for full history.</Text>
          </Banner>
        )}

        <RangePicker value={preset} onChange={setPreset} />
        {error && <Banner tone="critical"><Text as="p">{error}</Text></Banner>}

        <Tabs tabs={TABS} selected={tab} onSelect={setTab}>
          {loading && <Card><SkeletonBodyText lines={6} /></Card>}

          {!loading && data && !data.hasData && (
            <Card>
              <Text as="p" tone="subdued">No tax data in this period. Tax data populates as new orders arrive via webhooks.</Text>
            </Card>
          )}

          {!loading && data?.hasData && data.tab === "monthly" && data.monthly && (
            <Card padding="0">
              <DataTable
                columnContentTypes={["text","text","numeric","numeric"]}
                headings={["Month","Tax collected","Orders","Jurisdictions"]}
                rows={pgMonthly.page.map((r) => [
                  r.month,
                  formatMoney({ amount: (r.totalTaxMinor / 100).toFixed(2), currency_code: r.currency }),
                  r.orderCount,
                  r.jurisdictions,
                ])}
              />
              <TablePagination {...pgMonthly.props} />
            </Card>
          )}

          {!loading && data?.hasData && data.tab === "geo" && data.geo && (
            <Card padding="0">
              <DataTable
                columnContentTypes={["text","text","text","numeric"]}
                headings={["Country","Province","Tax collected","Orders"]}
                rows={pgGeo.page.map((r) => [
                  r.countryCode,
                  r.provinceCode ?? "—",
                  formatMoney({ amount: (r.totalTaxMinor / 100).toFixed(2), currency_code: r.currency }),
                  r.orderCount,
                ])}
              />
              <TablePagination {...pgGeo.props} />
            </Card>
          )}
        </Tabs>
      </BlockStack>
    </Page>
  );
}
