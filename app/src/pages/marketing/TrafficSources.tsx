import { useEffect, useState } from "react";
import {
  Banner, BlockStack, Box, Button, ButtonGroup, Card,
  DataTable, Icon, InlineStack, Page, SkeletonBodyText, Text, Tooltip,
} from "@shopify/polaris";
import { InfoIcon } from "@shopify/polaris-icons";
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
    <Page
      title="Traffic Sources"
      titleMetadata={
        <Tooltip content="Traffic sources come from the page that referred each order. Orders without tracking show as 'Direct'.">
          <Box>
            <Icon source={InfoIcon} tone="subdued" />
          </Box>
        </Tooltip>
      }
    >
      <BlockStack gap="400">
        {data?.historyClampedTo && (
          <Banner tone="warning" title="Free plan: data limited to last 90 days">
            <Text as="p" variant="bodySm">Upgrade to Pro for full history.</Text>
          </Banner>
        )}

        <InlineFilters preset={preset} onPreset={setPreset} channel={channel} onChannel={setChannel} />

        {error && (
          <Banner tone="critical" title="Could not load traffic sources">
            <Text as="p">{error}</Text>
          </Banner>
        )}

        {loading && (
          <Card><SkeletonBodyText lines={6} /></Card>
        )}

        {!loading && data && (
          <>
            {!data.hasData && (
              <Card>
                <Box padding="400">
                  <Text as="p" tone="subdued">
                    No traffic data in this period. We update traffic data as new orders come in — data will appear after your first orders sync.
                  </Text>
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
        <InlineStack gap="200" blockAlign="center">
          <RangePicker value={preset} onChange={onPreset} />
        </InlineStack>
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
