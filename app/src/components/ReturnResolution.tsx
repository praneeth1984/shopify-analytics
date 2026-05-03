/**
 * R-RET-4 frontend: how returns resolved.
 *
 * Renders cash refunds, store credit, and "other" buckets. Phase 1 ships with
 * `exchange_detection: "degraded"` so we fold the (currently zero) exchange
 * bucket into "Other" with a Tooltip explaining that exchange detection is
 * coming soon.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Card,
  EmptyState,
  InlineStack,
  SkeletonBodyText,
  Text,
  Tooltip,
} from "@shopify/polaris";
import type {
  DateRangePreset,
  Money,
  ResolutionBucket,
  ResolutionRow,
  ReturnResolutionResponse,
} from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";
import { formatMoney, formatNumber } from "../lib/format.js";

type Props = {
  preset: DateRangePreset;
};

const ZERO_MONEY: Money = { amount: "0.00", currency_code: "USD" };

export function ReturnResolution({ preset }: Props) {
  const [data, setData] = useState<ReturnResolutionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<ReturnResolutionResponse>(
        `/api/metrics/returns/resolution?preset=${encodeURIComponent(preset)}`,
      );
      setData(result);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load return resolutions.";
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalCount = data
    ? data.resolutions.reduce((acc, r) => acc + r.count, 0)
    : 0;

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          How returns resolved
        </Text>

        {error ? (
          <Banner tone="critical" title="Could not load return resolutions">
            <p>{error}</p>
          </Banner>
        ) : null}

        {data?.history_clamped_to ? (
          <Banner tone="info" title="Showing the last 90 days on Free">
            <p>
              Returns history is capped at 90 days on the Free plan. Upgrade to Pro for unlimited
              history.
            </p>
          </Banner>
        ) : null}

        {loading || !data ? (
          <Box minHeight="100px">
            <SkeletonBodyText lines={3} />
          </Box>
        ) : totalCount === 0 ? (
          <EmptyState heading="No refunds in this period." image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E" fullWidth>
            <p>
              Once you process refunds for returned items, we'll break them down by cash, store
              credit, and exchange here.
            </p>
          </EmptyState>
        ) : (
          <BlockStack gap="200">
            <ResolutionLine label="Cash refunds" row={byBucket(data.resolutions, "cash_refund")} />
            <ResolutionLine label="Store credit" row={byBucket(data.resolutions, "store_credit")} />
            <ResolutionLineOther
              data={data}
              cash={byBucket(data.resolutions, "cash_refund")}
              credit={byBucket(data.resolutions, "store_credit")}
            />
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

function byBucket(rows: ResolutionRow[], bucket: ResolutionBucket): ResolutionRow {
  return (
    rows.find((r) => r.bucket === bucket) ?? {
      bucket,
      count: 0,
      value: ZERO_MONEY,
      pct: 0,
    }
  );
}

function ResolutionLine({ label, row }: { label: string; row: ResolutionRow }) {
  return (
    <InlineStack align="space-between" blockAlign="center">
      <Text as="span" fontWeight="medium">
        {label}
      </Text>
      <InlineStack gap="300" blockAlign="center">
        <Text as="span" tone="subdued" variant="bodySm">
          {`${formatNumber(row.count)} · ${(row.pct * 100).toFixed(1)}%`}
        </Text>
        <Text as="span">{formatMoney(row.value)}</Text>
      </InlineStack>
    </InlineStack>
  );
}

function ResolutionLineOther({
  data,
  cash,
  credit,
}: {
  data: ReturnResolutionResponse;
  cash: ResolutionRow;
  credit: ResolutionRow;
}) {
  // "Other" subsumes the (currently empty) exchange bucket plus any
  // refunds with no transactions, so the row totals reconcile to 100%.
  const totalCount = data.resolutions.reduce((acc, r) => acc + r.count, 0);
  const otherCount = totalCount - cash.count - credit.count;
  const otherPct = totalCount === 0 ? 0 : otherCount / totalCount;
  const otherValueMinor =
    moneyToMinorSafe(data.resolutions.find((r) => r.bucket === "exchange")?.value) +
    moneyToMinorSafe(data.resolutions.find((r) => r.bucket === "other")?.value);
  const currency =
    data.resolutions.find((r) => r.bucket === "cash_refund")?.value.currency_code ?? "USD";
  const otherValue: Money = minorToMoneyDisplay(otherValueMinor, currency);

  const inner = (
    <InlineStack align="space-between" blockAlign="center">
      <Text as="span" fontWeight="medium">
        Other
      </Text>
      <InlineStack gap="300" blockAlign="center">
        <Text as="span" tone="subdued" variant="bodySm">
          {`${formatNumber(otherCount)} · ${(otherPct * 100).toFixed(1)}%`}
        </Text>
        <Text as="span">{formatMoney(otherValue)}</Text>
      </InlineStack>
    </InlineStack>
  );

  if (data.exchange_detection === "degraded") {
    return (
      <Tooltip
        content="Includes exchanges and other non-cash resolutions. Exchange detection coming soon."
        preferredPosition="above"
      >
        <Box>{inner}</Box>
      </Tooltip>
    );
  }
  return inner;
}

function moneyToMinorSafe(money: Money | undefined): bigint {
  if (!money) return 0n;
  const trimmed = money.amount.trim();
  const neg = trimmed.startsWith("-");
  const body = neg ? trimmed.slice(1) : trimmed;
  const [whole = "0", frac = ""] = body.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const minor = BigInt(whole || "0") * 100n + BigInt(fracPadded || "0");
  return neg ? -minor : minor;
}

function minorToMoneyDisplay(minor: bigint, currency: string): Money {
  const sign = minor < 0n ? "-" : "";
  const abs = minor < 0n ? -minor : minor;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return {
    amount: `${sign}${whole.toString()}.${frac.toString().padStart(2, "0")}`,
    currency_code: currency,
  };
}
