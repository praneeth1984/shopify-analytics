import { useEffect, useState } from "react";
import {
  Banner, BlockStack, Box, Card, DataTable,
  Page, SkeletonBodyText, Tabs, Text,
} from "@shopify/polaris";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney } from "../../lib/format.js";

type GiftCardOverview = {
  totalIssued: number;
  totalValueIssuedAmount: string;
  totalValueIssuedCurrency: string;
  totalRedeemedAmount: string;
  totalRedeemedCurrency: string;
  outstandingLiabilityAmount: string;
  outstandingLiabilityCurrency: string;
  expiringIn30Days: number;
};

type GiftCardRow = {
  id: string;
  lastCharacters: string;
  initialValueAmount: string;
  initialValueCurrency: string;
  balanceAmount: string;
  balanceCurrency: string;
  usageCount: number;
  expiresOn: string | null;
  createdAt: string;
  hasCustomer: boolean;
};

type GiftCardsResponse =
  | { scope_missing: true }
  | { scope_missing: false; overview: GiftCardOverview; expiredOrUnused: GiftCardRow[]; issuance: GiftCardRow[]; plan: string };

const TABS = [
  { id: "overview", content: "Overview", panelID: "overview-panel" },
  { id: "expired", content: "Expired / Unused", panelID: "expired-panel" },
  { id: "issuance", content: "Issuance", panelID: "issuance-panel" },
];

export function GiftCardsPage() {
  const [data, setData] = useState<GiftCardsResponse | null>(null);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<GiftCardsResponse>("/api/metrics/gift-cards")
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Page title="Gift Cards">
      <BlockStack gap="400">
        {data?.scope_missing && (
          <Banner tone="warning" title="Gift card permission not enabled">
            <Text as="p" variant="bodySm">Gift card reports require the <strong>read_gift_cards</strong> scope. Reinstall the app to enable.</Text>
          </Banner>
        )}

        {error && <Banner tone="critical"><Text as="p">{error}</Text></Banner>}
        {loading && <Card><SkeletonBodyText lines={5} /></Card>}

        {!loading && data && !data.scope_missing && (
          <Tabs tabs={TABS} selected={tab} onSelect={setTab}>
            {tab === 0 && (
              <Card>
                <BlockStack gap="300">
                  <KpiRow label="Total issued" value={String(data.overview.totalIssued)} />
                  <KpiRow label="Total value issued" value={formatMoney({ amount: data.overview.totalValueIssuedAmount, currency_code: data.overview.totalValueIssuedCurrency })} />
                  <KpiRow label="Total redeemed" value={formatMoney({ amount: data.overview.totalRedeemedAmount, currency_code: data.overview.totalRedeemedCurrency })} />
                  <KpiRow label="Outstanding liability" value={formatMoney({ amount: data.overview.outstandingLiabilityAmount, currency_code: data.overview.outstandingLiabilityCurrency })} />
                  <KpiRow label="Expiring in 30 days" value={String(data.overview.expiringIn30Days)} />
                </BlockStack>
              </Card>
            )}
            {tab === 1 && (
              <Card>
                <GiftCardTable rows={data.expiredOrUnused} />
              </Card>
            )}
            {tab === 2 && (
              data.plan === "free"
                ? <Banner tone="info"><Text as="p" variant="bodySm">Issuance details available on Pro plan.</Text></Banner>
                : <Card><GiftCardTable rows={data.issuance} /></Card>
            )}
          </Tabs>
        )}
      </BlockStack>
    </Page>
  );
}

function KpiRow({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="p" variant="bodyMd" fontWeight="semibold">{value}</Text>
    </Box>
  );
}

function GiftCardTable({ rows }: { rows: GiftCardRow[] }) {
  if (rows.length === 0) return <Text as="p" tone="subdued">No gift cards to display.</Text>;
  return (
    <DataTable
      columnContentTypes={["text","text","text","text","numeric","text"]}
      headings={["Last 4","Initial value","Balance","Expires","Uses","Created"]}
      rows={rows.map((r) => [
        `****${r.lastCharacters}`,
        formatMoney({ amount: r.initialValueAmount, currency_code: r.initialValueCurrency }),
        formatMoney({ amount: r.balanceAmount, currency_code: r.balanceCurrency }),
        r.expiresOn ?? "No expiry",
        r.usageCount,
        r.createdAt.slice(0, 10),
      ])}
    />
  );
}
