/**
 * F01 — Geography page: heat map + sortable regions table.
 *
 * The Leaflet map bundle is lazy-loaded so it's not bundled with the initial
 * app chunk. The page renders immediately with skeleton state while data loads.
 */

import { lazy, Suspense, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  InlineStack,
  Page,
  Select,
  SkeletonBodyText,
  SkeletonDisplayText,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import type { DateRangePreset, RegionRow } from "@fbc/shared";
import { PRO_MONTHLY_PRICE } from "@fbc/shared";
import { useGeography } from "../hooks/useGeography.js";
import { formatMoney, formatNumber } from "../lib/format.js";
import { navigate } from "../App.js";

const GeographyMap = lazy(() => import("../components/geography/GeographyMap.js"));

const PRESETS: { label: string; value: DateRangePreset }[] = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "last_7_days" },
  { label: "Last 30 days", value: "last_30_days" },
  { label: "Last 90 days", value: "last_90_days" },
  { label: "Month to date", value: "month_to_date" },
  { label: "Year to date", value: "year_to_date" },
];

type SortKey = "orders" | "revenue" | "aov" | "revenue_pct" | "unique_customers";
type SortDir = "asc" | "desc";

function sortRows(rows: RegionRow[], key: SortKey, dir: SortDir): RegionRow[] {
  return [...rows].sort((a, b) => {
    let av: number;
    let bv: number;
    switch (key) {
      case "orders":
        av = a.orders;
        bv = b.orders;
        break;
      case "revenue":
        av = parseFloat(a.revenue.amount);
        bv = parseFloat(b.revenue.amount);
        break;
      case "aov":
        av = parseFloat(a.aov.amount);
        bv = parseFloat(b.aov.amount);
        break;
      case "revenue_pct":
        av = a.revenue_pct;
        bv = b.revenue_pct;
        break;
      case "unique_customers":
        av = a.unique_customers;
        bv = b.unique_customers;
        break;
    }
    return dir === "desc" ? bv - av : av - bv;
  });
}

function regionLabel(row: RegionRow): string {
  if (row.city) return `    ${row.city}`;
  if (row.province) return `  ${row.province}`;
  return row.country_name;
}

export function Geography() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedProvinces, setExpandedProvinces] = useState<Set<string>>(new Set());

  const { data, loading, error } = useGeography(preset);

  // For now assume free plan — the data's cluster_precision tells us what we got
  const isPro = data?.cluster_precision === "grid_0.1deg";

  function toggleCountry(code: string) {
    setExpandedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
        // Also collapse all provinces for this country
        setExpandedProvinces((pp) => {
          const np = new Set(pp);
          for (const k of np) if (k.startsWith(`${code}:`)) np.delete(k);
          return np;
        });
      } else {
        next.add(code);
      }
      return next;
    });
  }

  function toggleProvince(key: string) {
    setExpandedProvinces((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // Build visible rows based on expansion and filter state
  const visibleRows: RegionRow[] = [];
  if (data) {
    const filterLower = filter.toLowerCase();

    // Country rows
    const countryRows = data.regions.filter((r) => r.province === null);
    const sorted = sortRows(countryRows, sortKey, sortDir);

    for (const country of sorted) {
      const cc = country.country_code;
      const matchesFilter =
        !filterLower ||
        country.country_name.toLowerCase().includes(filterLower) ||
        cc.toLowerCase().includes(filterLower);

      if (!matchesFilter) continue;
      visibleRows.push(country);

      if (!expandedCountries.has(cc)) continue;

      // Province rows for this country
      const provinceRows = data.regions.filter(
        (r) => r.country_code === cc && r.province !== null && r.city === null,
      );
      const sortedProvinces = sortRows(provinceRows, sortKey, sortDir);

      for (const province of sortedProvinces) {
        visibleRows.push(province);

        const provinceKey = `${cc}:${province.province}`;
        if (!isPro || !expandedProvinces.has(provinceKey)) continue;

        // City rows (Pro only)
        const cityRows = data.regions.filter(
          (r) =>
            r.country_code === cc &&
            r.province === province.province &&
            r.city !== null,
        );
        const sortedCities = sortRows(cityRows, sortKey, sortDir);
        for (const city of sortedCities) {
          visibleRows.push(city);
        }
      }
    }
  }

  const sortLabel = (key: SortKey, label: string) => {
    if (sortKey !== key) return label;
    return `${label} ${sortDir === "desc" ? "↓" : "↑"}`;
  };

  function rowContent(row: RegionRow): string[] {
    const label = regionLabel(row);
    const indent = row.city ? "      " : row.province ? "   " : "";
    const expandable = !row.province && !row.city;
    const isExpanded = expandable && expandedCountries.has(row.country_code);
    const hasProvinces = data
      ? data.regions.some(
          (r) => r.country_code === row.country_code && r.province !== null && r.city === null,
        )
      : false;

    const prefix =
      expandable && hasProvinces ? (isExpanded ? "▾ " : "▸ ") : indent;

    return [
      `${prefix}${label}`,
      formatNumber(row.orders),
      formatMoney(row.revenue),
      formatMoney(row.aov),
      `${(row.revenue_pct * 100).toFixed(1)}%`,
      formatNumber(row.unique_customers),
    ];
  }

  return (
    <Page
      title="Geography"
      subtitle="Where your orders and revenue come from."
      fullWidth
    >
      <BlockStack gap="400">
        {/* Controls */}
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <Box minWidth="200px">
              <Select
                label="Date range"
                labelHidden
                options={PRESETS}
                value={preset}
                onChange={(v) => setPreset(v as DateRangePreset)}
              />
            </Box>
            {data?.truncated && (
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" variant="bodySm" tone="critical">
                  Partial results — capped at 2,500 orders.
                </Text>
                <Button variant="plain" onClick={() => navigate("/billing")}>
                  Upgrade to Pro
                </Button>
              </InlineStack>
            )}
            {data?.history_clamped_to && (
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" variant="bodySm" tone="critical">
                  Showing 90-day window (Free plan).
                </Text>
                <Button variant="plain" onClick={() => navigate("/billing")}>
                  Upgrade to Pro
                </Button>
              </InlineStack>
            )}
          </InlineStack>
        </Card>

        {/* Errors */}
        {error && (
          <Banner tone="critical" title="Could not load geography data">
            <Text as="p">{error}</Text>
          </Banner>
        )}

        {/* Map panel */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Order heat map
            </Text>

            {loading && (
              <Box minHeight="420px">
                <BlockStack align="center" inlineAlign="center">
                  <Spinner size="large" accessibilityLabel="Loading geography data" />
                </BlockStack>
              </Box>
            )}

            {!loading && data && data.clusters.length === 0 && (
              <Box minHeight="200px">
                <BlockStack align="center" inlineAlign="center" gap="200">
                  <Text as="p" tone="subdued">
                    No orders with shipping addresses in this period.
                  </Text>
                </BlockStack>
              </Box>
            )}

            {!loading && data && data.clusters.length > 0 && (
              <Suspense
                fallback={
                  <Box minHeight="420px">
                    <BlockStack align="center" inlineAlign="center">
                      <Spinner size="large" accessibilityLabel="Loading geography data" />
                    </BlockStack>
                  </Box>
                }
              >
                <GeographyMap clusters={data.clusters} isPro={isPro} />
              </Suspense>
            )}

            {!loading && !data && !error && (
              <SkeletonBodyText lines={3} />
            )}

            {/* No-location summary */}
            {data && data.no_location_count > 0 && (
              <Text as="p" variant="bodySm" tone="subdued">
                {formatNumber(data.no_location_count)} order
                {data.no_location_count !== 1 ? "s" : ""} had no shipping address
                {data.no_location_revenue
                  ? ` (${formatMoney(data.no_location_revenue)} revenue)`
                  : ""}
                {" "}and are excluded from the map. These are shown in the "No location" row below.
              </Text>
            )}
          </BlockStack>
        </Card>

        {/* Regions table */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Regions
              </Text>
              <Box minWidth="240px">
                <TextField
                  label="Search"
                  labelHidden
                  placeholder="Filter by country or city…"
                  value={filter}
                  onChange={setFilter}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setFilter("")}
                />
              </Box>
            </InlineStack>

            {!isPro && (
              <Banner tone="info" title="Free plan: country and state breakdown only">
                <BlockStack gap="200">
                  <Text as="p">
                    Upgrade to Pro for city-level rows, full heat map precision, and unlimited history.
                  </Text>
                  <InlineStack>
                    <Button variant="primary" onClick={() => navigate("/billing")}>
                      {`Upgrade to Pro — ${PRO_MONTHLY_PRICE}/mo`}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Banner>
            )}

            {loading && <SkeletonBodyText lines={8} />}

            {!loading && data && (
              <>
                {/* Sort controls */}
                <InlineStack gap="200" wrap>
                  {(
                    [
                      ["orders", "Orders"],
                      ["revenue", "Revenue"],
                      ["aov", "AOV"],
                      ["revenue_pct", "% Revenue"],
                      ["unique_customers", "Customers"],
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

                {visibleRows.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No results{filter ? ` matching "${filter}"` : ""}.
                  </Text>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <DataTable
                      columnContentTypes={[
                        "text",
                        "numeric",
                        "numeric",
                        "numeric",
                        "numeric",
                        "numeric",
                      ]}
                      headings={[
                        "Location",
                        "Orders",
                        "Revenue",
                        "AOV",
                        "% Revenue",
                        "Unique customers",
                      ]}
                      rows={visibleRows.map((row) => {
                        const cells = rowContent(row);
                        // Make country rows clickable for expansion
                        if (row.province === null && row.city === null) {
                          return cells;
                        }
                        if (row.city === null && isPro) {
                          return cells;
                        }
                        return cells;
                      })}
                      onSort={(index, direction) => {
                        const keyMap: SortKey[] = [
                          "orders",
                          "revenue",
                          "aov",
                          "revenue_pct",
                          "unique_customers",
                        ];
                        const key = keyMap[index - 1];
                        if (key) {
                          handleSort(key);
                          setSortDir(direction === "descending" ? "desc" : "asc");
                        }
                      }}
                      sortable={[false, true, true, true, true, true]}
                      defaultSortDirection="descending"
                    />
                  </div>
                )}

                {/* Expand/collapse controls */}
                {data.regions.some((r) => r.province === null) && (
                  <InlineStack gap="200">
                    <Button
                      size="slim"
                      variant="plain"
                      onClick={() => {
                        const allCodes = data.regions
                          .filter((r) => r.province === null)
                          .map((r) => r.country_code);
                        setExpandedCountries(new Set(allCodes));
                      }}
                    >
                      Expand all
                    </Button>
                    <Button
                      size="slim"
                      variant="plain"
                      onClick={() => {
                        setExpandedCountries(new Set());
                        setExpandedProvinces(new Set());
                      }}
                    >
                      Collapse all
                    </Button>
                  </InlineStack>
                )}

                {/* No-location row */}
                {data.no_location_count > 0 && (
                  <Box paddingBlockStart="200" borderBlockStartWidth="025" borderColor="border">
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">
                        No location (digital products / in-store POS)
                      </Text>
                      <InlineStack gap="600">
                        <Text as="span">{formatNumber(data.no_location_count)} orders</Text>
                        {data.no_location_revenue && (
                          <Text as="span">{formatMoney(data.no_location_revenue)}</Text>
                        )}
                      </InlineStack>
                    </InlineStack>
                  </Box>
                )}
              </>
            )}

            {!loading && !data && !error && <SkeletonDisplayText size="small" />}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
