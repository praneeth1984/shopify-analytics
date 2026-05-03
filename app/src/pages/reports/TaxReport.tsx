import { useEffect, useState } from "react";
import {
  Banner, BlockStack, Card, DataTable,
  Page, SkeletonBodyText, Tabs, Text,
} from "@shopify/polaris";
import type { DateRangePreset } from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney } from "../../lib/format.js";
import { RangePicker } from "../../components/RangePicker.js";

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

  return (
    <Page title="Tax Reports">
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
              <Text as="p" tone="subdued">No tax data in this period. Tax data is built from order webhooks — it will populate as new orders arrive.</Text>
            </Card>
          )}

          {!loading && data?.hasData && data.tab === "monthly" && data.monthly && (
            <Card>
              <DataTable
                columnContentTypes={["text","text","numeric","numeric"]}
                headings={["Month","Tax collected","Orders","Jurisdictions"]}
                rows={data.monthly.map((r) => [
                  r.month,
                  formatMoney({ amount: (r.totalTaxMinor / 100).toFixed(2), currency_code: r.currency }),
                  r.orderCount,
                  r.jurisdictions,
                ])}
              />
            </Card>
          )}

          {!loading && data?.hasData && data.tab === "geo" && data.geo && (
            <Card>
              <DataTable
                columnContentTypes={["text","text","text","numeric"]}
                headings={["Country","Province","Tax collected","Orders"]}
                rows={data.geo.map((r) => [
                  r.countryCode,
                  r.provinceCode ?? "—",
                  formatMoney({ amount: (r.totalTaxMinor / 100).toFixed(2), currency_code: r.currency }),
                  r.orderCount,
                ])}
              />
            </Card>
          )}
        </Tabs>
      </BlockStack>
    </Page>
  );
}
