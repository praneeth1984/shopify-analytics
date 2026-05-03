import { useEffect, useState } from "react";
import {
  Banner, BlockStack, Box, Button, ButtonGroup, Card,
  DataTable, InlineStack, Page, SkeletonBodyText, Text,
} from "@shopify/polaris";
import type { DateRangePreset } from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney } from "../../lib/format.js";

const formatPct = (n: number) => `${(n * 100).toFixed(1)}%`;
import { RangePicker } from "../../components/RangePicker.js";

type UTMRow = {
  channel: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  orders: number;
  revenueMinor: number;
  currency: string;
  aovMinor: number;
  sharePct: number;
};

type UTMReport = {
  limitationNote: string;
  topSourceByRevenue: string;
  topCampaignByOrders: string;
  directPct: number;
  rows: UTMRow[];
  plan: string;
  historyClampedTo: string | null;
  hasData: boolean;
};

const CHANNELS = ["all", "direct", "organic", "paid", "email", "social", "referral"] as const;

export function TrafficSourcesPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [channel, setChannel] = useState<string>("all");
  const [data, setData] = useState<UTMReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<UTMReport>(`/api/metrics/utm?preset=${preset}&channel=${channel}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [preset, channel]);

  return (
    <Page title="Traffic Sources">
      <BlockStack gap="400">
        <Banner tone="info">
          <Text as="p" variant="bodySm">{data?.limitationNote ?? "First-touch attribution from order landing page."}</Text>
        </Banner>

        {data?.historyClampedTo && (
          <Banner tone="warning">
            <Text as="p" variant="bodySm">Free plan: data limited to last 90 days. Upgrade to Pro for full history.</Text>
          </Banner>
        )}

        <InlineFilters preset={preset} onPreset={setPreset} channel={channel} onChannel={setChannel} />

        {error && <Banner tone="critical"><Text as="p">{error}</Text></Banner>}

        {loading && (
          <Card><SkeletonBodyText lines={6} /></Card>
        )}

        {!loading && data && (
          <>
            {!data.hasData && (
              <Card>
                <Box padding="400">
                  <Text as="p" tone="subdued">No traffic data in this period. UTM data is recorded as orders arrive via webhooks — data will appear after your first orders sync.</Text>
                </Box>
              </Card>
            )}
            {data.hasData && (
              <Card>
                <DataTable
                  columnContentTypes={["text","text","text","numeric","text","text","text"]}
                  headings={["Channel","Source","Medium","Orders","Revenue","AOV","Share"]}
                  rows={data.rows.map((r) => [
                    r.channel,
                    r.source ?? "—",
                    r.medium ?? "—",
                    r.orders,
                    formatMoney({ amount: (r.revenueMinor / 100).toFixed(2), currency_code: r.currency }),
                    formatMoney({ amount: (r.aovMinor / 100).toFixed(2), currency_code: r.currency }),
                    formatPct(r.sharePct),
                  ])}
                />
              </Card>
            )}
          </>
        )}
      </BlockStack>
    </Page>
  );
}

function InlineFilters({ preset, onPreset, channel, onChannel }: {
  preset: DateRangePreset;
  onPreset: (p: DateRangePreset) => void;
  channel: string;
  onChannel: (c: string) => void;
}) {
  return (
    <Box>
      <BlockStack gap="200">
        <RangePicker value={preset} onChange={onPreset} />
        <ButtonGroup variant="segmented">
          {CHANNELS.map((c) => (
            <Button key={c} pressed={channel === c} onClick={() => onChannel(c)}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </Button>
          ))}
        </ButtonGroup>
      </BlockStack>
    </Box>
  );
}
