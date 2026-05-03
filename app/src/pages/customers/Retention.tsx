import { useState } from "react";
import {
  BlockStack, Card, Text, InlineStack, Banner, Badge,
  SkeletonBodyText, EmptyState, DataTable, Button,
} from "@shopify/polaris";
import { useCohort } from "../../hooks/useCohort.js";
import { RangePicker } from "../../components/RangePicker.js";
import { navigate } from "../../App.js";
import type { DateRangePreset, CohortRow } from "@fbc/shared";

function fmtRet(n: number | null): string {
  if (n === null) return "–";
  return `${n.toFixed(1)}%`;
}

function retTone(n: number | null): string {
  if (n === null) return "";
  if (n >= 30) return "✓";
  if (n >= 15) return "△";
  return "✗";
}

function CohortTable({ rows }: { rows: CohortRow[] }) {
  const headings = ["Cohort", "New Customers", "M+1", "M+2", "M+3", "M+6", "M+12"];

  const tableRows = rows.map((r) => [
    r.cohort_month,
    String(r.new_customers),
    fmtRet(r.retention.m1),
    fmtRet(r.retention.m2),
    fmtRet(r.retention.m3),
    fmtRet(r.retention.m6),
    fmtRet(r.retention.m12),
  ]);

  return (
    <DataTable
      columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric"]}
      headings={headings}
      rows={tableRows}
    />
  );
}

export function RetentionPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_90_days");
  const { data, loading, error } = useCohort(preset);

  return (
    <BlockStack gap="400">
      <Card>
        <InlineStack align="space-between" blockAlign="center" gap="400">
          <RangePicker value={preset} onChange={setPreset} />
          {data?.plan_capped_to !== null && data?.rows.length !== undefined && (
            <Badge tone="info">{`Free: last ${data.plan_capped_to ?? 3} months`}</Badge>
          )}
        </InlineStack>
      </Card>

      {error && (
        <Banner tone="critical" title="Failed to load cohort data">
          <Text as="p">{error}</Text>
        </Banner>
      )}

      {data?.history_clamped_to && (
        <Banner tone="info" title="Showing last 90 days (Free plan)">
          <InlineStack gap="200">
            <Text as="p">Upgrade to Pro for unlimited cohort history.</Text>
            <Button variant="plain" onClick={() => navigate("/billing")}>Upgrade</Button>
          </InlineStack>
        </Banner>
      )}

      {data?.overall_m1_retention !== null && data?.overall_m1_retention !== undefined && (
        <Card>
          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">Overall M+1 Retention</Text>
            <Text as="p" variant="headingLg">{fmtRet(data.overall_m1_retention * 100)}</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Weighted avg across all cohorts. {retTone(data.overall_m1_retention * 100)}{" "}
              {data.overall_m1_retention >= 0.3 ? "Good retention (≥30%)" :
               data.overall_m1_retention >= 0.15 ? "Average (15–30%)" : "Below average (<15%)"}
            </Text>
          </BlockStack>
        </Card>
      )}

      <Card>
        {loading ? (
          <SkeletonBodyText lines={6} />
        ) : data && data.rows.length === 0 ? (
          <EmptyState heading="Not enough data for cohort analysis" image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E">
            <Text as="p" tone="subdued">
              Cohort analysis requires customers with `numberOfOrders === 1` within the selected range.
              Try a wider date range or check that customer data is available.
            </Text>
          </EmptyState>
        ) : data ? (
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Cohort Retention Table</Text>
            <Text as="p" tone="subdued">
              Each row shows the % of new customers who placed another order in M+N months.
              Dashes indicate months not yet observable.
            </Text>
            <CohortTable rows={data.rows} />
          </BlockStack>
        ) : null}
      </Card>
    </BlockStack>
  );
}
