/**
 * F33 — Sales Attribution.
 *
 * Tabs: By Vendor / By Type / By Channel / (Pro) By POS Location.
 * Sortable IndexTable per tab; CSV export via lib helper (client-side).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  IndexTable,
  InlineStack,
  Page,
  SkeletonBodyText,
  Tabs,
  Text,
} from "@shopify/polaris";
import type {
  DateRangePreset,
  SalesAttributionGroupBy,
  SalesAttributionResponse,
  SalesAttributionRow,
} from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMargin, formatMoney, formatNumber } from "../../lib/format.js";
import { RangePicker } from "../../components/RangePicker.js";

const TABS: { id: SalesAttributionGroupBy; content: string; panelID: string }[] = [
  { id: "vendor", content: "By Vendor", panelID: "vendor-panel" },
  { id: "type", content: "By Product Type", panelID: "type-panel" },
  { id: "channel", content: "By Channel", panelID: "channel-panel" },
  { id: "pos_location", content: "By POS Location", panelID: "pos-panel" },
];

type SortKey = "key" | "orders" | "units" | "revenue" | "aov" | "return_rate_pct";
type SortDir = "asc" | "desc";

function sortRows(
  rows: SalesAttributionRow[],
  key: SortKey,
  dir: SortDir,
): SalesAttributionRow[] {
  return [...rows].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    switch (key) {
      case "key":
        av = a.key;
        bv = b.key;
        break;
      case "orders":
        av = a.orders;
        bv = b.orders;
        break;
      case "units":
        av = a.units;
        bv = b.units;
        break;
      case "revenue":
        av = parseFloat(a.revenue.amount);
        bv = parseFloat(b.revenue.amount);
        break;
      case "aov":
        av = parseFloat(a.aov.amount);
        bv = parseFloat(b.aov.amount);
        break;
      case "return_rate_pct":
        av = a.return_rate_pct;
        bv = b.return_rate_pct;
        break;
    }
    if (typeof av === "string" && typeof bv === "string") {
      return dir === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
    }
    return dir === "desc" ? Number(bv) - Number(av) : Number(av) - Number(bv);
  });
}

function toCsv(by: SalesAttributionGroupBy, rows: SalesAttributionRow[]): string {
  const header = [by, "orders", "units", "revenue", "aov", "return_rate_pct"].join(",");
  const body = rows
    .map((r) =>
      [
        `"${r.key.replace(/"/g, '""')}"`,
        r.orders,
        r.units,
        r.revenue.amount,
        r.aov.amount,
        r.return_rate_pct.toFixed(4),
      ].join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AttributionPage() {
  const [tabIdx, setTabIdx] = useState(0);
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [data, setData] = useState<SalesAttributionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const by = TABS[tabIdx]?.id ?? "vendor";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ by, preset });
      const result = await apiFetch<SalesAttributionResponse>(
        `/api/metrics/sales/attribution?${params.toString()}`,
      );
      setData(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load attribution data.");
    } finally {
      setLoading(false);
    }
  }, [by, preset]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(
    () => (data ? sortRows(data.rows, sortKey, sortDir) : []),
    [data, sortKey, sortDir],
  );

  const handleExport = () => {
    if (!data) return;
    downloadCsv(`sales-by-${by}-${preset}.csv`, toCsv(by, sortedRows));
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortLabel = (key: SortKey, label: string) =>
    sortKey === key ? `${label} ${sortDir === "desc" ? "↓" : "↑"}` : label;

  return (
    <Page
      title="Sales Attribution"
      subtitle="Slice revenue, units, and return rate by vendor, type, channel, or location"
      primaryAction={{
        content: "Export CSV",
        onAction: handleExport,
        disabled: !data || data.rows.length === 0,
      }}
    >
      <BlockStack gap="400">
        {error && (
          <Banner tone="critical" title="Could not load attribution data">
            <p>{error}</p>
          </Banner>
        )}

        <Card padding="0">
          <Tabs
            tabs={TABS}
            selected={tabIdx}
            onSelect={(i) => {
              setTabIdx(i);
            }}
          />
        </Card>

        <Card>
          <InlineStack gap="200">
            <RangePicker value={preset} onChange={setPreset} />
          </InlineStack>
        </Card>

        {data?.pro_only && (
          <Banner tone="info" title="POS Location reports require Pro">
            <p>
              POS-level attribution is available on the Pro plan. Upgrade to slice
              sales by physical store location.
            </p>
          </Banner>
        )}

        {data?.plan_capped_to !== null &&
          data?.total_count !== undefined &&
          data.total_count > (data.plan_capped_to ?? 0) && (
            <Banner
              tone="info"
              title={`Showing top ${data.plan_capped_to} ${TABS[tabIdx]?.content ?? "rows"}`}
            >
              <p>Upgrade to Pro to see all {data.total_count} rows with unlimited history.</p>
            </Banner>
          )}

        <Card padding="0">
          {loading && !data ? (
            <Box padding="400">
              <SkeletonBodyText lines={6} />
            </Box>
          ) : data && data.rows.length === 0 ? (
            <Box padding="400">
              <Text as="p" tone="subdued">
                No data for this period. Try a wider date range.
              </Text>
            </Box>
          ) : (
            <>
              <Box padding="300">
                <InlineStack gap="200" wrap>
                  {(
                    [
                      ["key", TABS[tabIdx]?.content ?? "Group"],
                      ["orders", "Orders"],
                      ["units", "Units"],
                      ["revenue", "Revenue"],
                      ["aov", "AOV"],
                      ["return_rate_pct", "Return rate"],
                    ] as [SortKey, string][]
                  ).map(([key, label]) => (
                    <Button
                      key={key}
                      size="slim"
                      variant={sortKey === key ? "primary" : "plain"}
                      onClick={() => handleSort(key)}
                    >
                      {sortLabel(key, label)}
                    </Button>
                  ))}
                </InlineStack>
              </Box>
              <IndexTable
                resourceName={{ singular: "row", plural: "rows" }}
                itemCount={sortedRows.length}
                selectable={false}
                headings={[
                  { title: TABS[tabIdx]?.content ?? "Group" },
                  { title: "Orders" },
                  { title: "Units" },
                  { title: "Revenue" },
                  { title: "AOV" },
                  { title: "Return rate" },
                ]}
              >
                {sortedRows.map((row, idx) => (
                  <IndexTable.Row id={row.key} key={row.key} position={idx}>
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="semibold">
                        {row.key}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{formatNumber(row.orders)}</IndexTable.Cell>
                    <IndexTable.Cell>{formatNumber(row.units)}</IndexTable.Cell>
                    <IndexTable.Cell>{formatMoney(row.revenue)}</IndexTable.Cell>
                    <IndexTable.Cell>{formatMoney(row.aov)}</IndexTable.Cell>
                    <IndexTable.Cell>
                      {row.return_rate_pct > 0 ? formatMargin(row.return_rate_pct) : "—"}
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
