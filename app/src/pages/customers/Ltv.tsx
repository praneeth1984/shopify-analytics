import { useState } from "react";
import {
  BlockStack, Card, Text, InlineStack, Banner,
  SkeletonBodyText, EmptyState, DataTable,
} from "@shopify/polaris";
import { useLtv } from "../../hooks/useLtv.js";
import { RangePicker } from "../../components/RangePicker.js";
import { formatMoney } from "../../lib/format.js";
import type { DateRangePreset, Money } from "@fbc/shared";

function fmtMoney(m: Money | null): string {
  return m ? formatMoney(m) : "–";
}

export function LtvPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_90_days");
  const { data, loading, error } = useLtv(preset);

  const headings = ["Cohort Month", "Customers", "Avg LTV M0", "M+1", "M+2", "M+3", "M+6", "M+12"];

  const tableRows = (data?.rows ?? []).map((r) => [
    r.cohort_month,
    String(r.customers),
    fmtMoney(r.avg_ltv.m0),
    fmtMoney(r.avg_ltv.m1),
    fmtMoney(r.avg_ltv.m2),
    fmtMoney(r.avg_ltv.m3),
    fmtMoney(r.avg_ltv.m6),
    fmtMoney(r.avg_ltv.m12),
  ]);

  return (
    <BlockStack gap="400">
      <Card>
        <InlineStack align="space-between" blockAlign="center" gap="400">
          <RangePicker value={preset} onChange={setPreset} />
        </InlineStack>
      </Card>

      {error && (
        <Banner tone="critical" title="Failed to load LTV data">
          <Text as="p">{error}</Text>
        </Banner>
      )}

      <Card>
        {loading ? (
          <SkeletonBodyText lines={6} />
        ) : data && data.rows.length === 0 ? (
          <EmptyState heading="No cohort LTV data" image="">
            <Text as="p" tone="subdued">
              LTV analysis requires new customers (first-ever order) in the selected range.
              Try a wider date range.
            </Text>
          </EmptyState>
        ) : (
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">LTV by Acquisition Month</Text>
            <Text as="p" tone="subdued">
              Average cumulative revenue per customer from first purchase through each subsequent month.
            </Text>
            <DataTable
              columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric"]}
              headings={headings}
              rows={tableRows}
            />
          </BlockStack>
        )}
      </Card>
    </BlockStack>
  );
}
