import { useEffect, useState } from "react";
import {
  Banner, BlockStack, Card, DataTable,
  Link, Page, SkeletonBodyText, Text,
} from "@shopify/polaris";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney } from "../../lib/format.js";

type PayoutRow = {
  id: string;
  date: string;
  status: string;
  grossAmount: string;
  grossCurrency: string;
  feeAmount: string;
  feeCurrency: string;
  netAmount: string;
  netCurrency: string;
  transactionCount: number;
};

type PayoutsResponse =
  | { available: false; reason: string }
  | { available: true; payouts: PayoutRow[]; plan: string };

export function PayoutsPage() {
  const [data, setData] = useState<PayoutsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<PayoutsResponse>("/api/metrics/payouts")
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Page title="Payout Report">
      <BlockStack gap="400">
        {data?.available === false && (
          <Banner tone="info" title="Shopify Payments required">
            <Text as="p" variant="bodySm">
              Payout reports are only available for merchants using Shopify Payments.
            </Text>
          </Banner>
        )}

        {error && <Banner tone="critical"><Text as="p">{error}</Text></Banner>}
        {loading && <Card><SkeletonBodyText lines={5} /></Card>}

        {!loading && data?.available && (
          <>
            {data.plan === "free" && (
              <Banner tone="info">
                <Text as="p" variant="bodySm">Free plan: showing last 3 payouts. Upgrade to Pro for full payout history.</Text>
              </Banner>
            )}
            <Card>
              <DataTable
                columnContentTypes={["text","text","text","text","text","text","numeric"]}
                headings={["Date","Payout ID","Status","Gross","Fees","Net","Transactions"]}
                rows={data.payouts.map((p) => [
                  p.date,
                  p.id,
                  p.status,
                  formatMoney({ amount: p.grossAmount, currency_code: p.grossCurrency }),
                  formatMoney({ amount: p.feeAmount, currency_code: p.feeCurrency }),
                  formatMoney({ amount: p.netAmount, currency_code: p.netCurrency }),
                  p.transactionCount,
                ])}
              />
            </Card>
            <Text as="p" variant="bodySm" tone="subdued">
              Click a payout ID to view in{" "}
              <Link url="https://www.shopify.com/admin/finances/payouts" external>Shopify admin</Link>.
            </Text>
          </>
        )}
      </BlockStack>
    </Page>
  );
}
