/**
 * F51 — Product Catalog Reports.
 *
 * Tabs: Never Sold / All Products / By Tag.
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
  CatalogResponse,
  CatalogView,
  DateRangePreset,
} from "@fbc/shared";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney, formatNumber } from "../../lib/format.js";
import { RangePicker } from "../../components/RangePicker.js";

const TABS: { id: CatalogView; content: string; panelID: string }[] = [
  { id: "never_sold", content: "Never Sold", panelID: "ns-panel" },
  { id: "all", content: "All Products", panelID: "all-panel" },
  { id: "by_tag", content: "By Tag", panelID: "tag-panel" },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso.slice(0, 10);
  }
}

function priceRange(min: { amount: string; currency_code: string } | null, max: { amount: string; currency_code: string } | null): string {
  if (!min || !max) return "—";
  if (min.amount === max.amount) return formatMoney(min);
  return `${formatMoney(min)} – ${formatMoney(max)}`;
}

export function CatalogPage() {
  const [tabIdx, setTabIdx] = useState(0);
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const view = TABS[tabIdx]?.id ?? "never_sold";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view, preset });
      const result = await apiFetch<CatalogResponse>(
        `/api/metrics/products/catalog?${params.toString()}`,
      );
      setData(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load catalog.");
    } finally {
      setLoading(false);
    }
  }, [view, preset]);

  useEffect(() => {
    void load();
  }, [load]);

  const productHeadings = useMemo(
    () =>
      [
        { title: "Product" },
        { title: "Vendor" },
        { title: "Type" },
        { title: "Price range" },
        { title: "Inventory" },
        { title: "Units sold" },
        { title: "Revenue" },
        { title: "Created" },
      ] as [{ title: string }, ...{ title: string }[]],
    [],
  );

  return (
    <Page
      title="Catalog"
      subtitle="Inventory of all your products with sales overlay"
    >
      <BlockStack gap="400">
        {error && (
          <Banner tone="critical" title="Could not load catalog">
            <p>{error}</p>
          </Banner>
        )}

        <Card padding="0">
          <Tabs tabs={TABS} selected={tabIdx} onSelect={setTabIdx} />
        </Card>

        <Card>
          <InlineStack gap="200">
            <RangePicker value={preset} onChange={setPreset} />
          </InlineStack>
        </Card>

        {data?.plan_capped_to !== null &&
          data?.total_count !== undefined &&
          data.total_count > (data.plan_capped_to ?? 0) && (
            <Banner tone="info" title={`Showing top ${data.plan_capped_to} rows`}>
              <p>Upgrade to Pro for the full catalog and unlimited history.</p>
            </Banner>
          )}

        {loading && !data ? (
          <Card>
            <SkeletonBodyText lines={6} />
          </Card>
        ) : null}

        {data && (data.view === "never_sold" || data.view === "all") && (
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "product", plural: "products" }}
              itemCount={data.rows.length}
              selectable={false}
              loading={loading}
              headings={productHeadings}
              emptyState={
                <Box padding="400">
                  <Text as="p" tone="subdued">
                    {view === "never_sold"
                      ? "Every product sold at least one unit in this period — nice."
                      : "No products in your catalog. Add products in Shopify to see them here."}
                  </Text>
                </Box>
              }
            >
              {data.rows.map((r, idx) => (
                <IndexTable.Row id={r.product_id} key={r.product_id} position={idx}>
                  <IndexTable.Cell>
                    <BlockStack gap="050">
                      <Text as="span" fontWeight="semibold">
                        {r.title}
                      </Text>
                      {r.tags.length > 0 ? (
                        <Text as="span" variant="bodySm" tone="subdued">
                          {r.tags.slice(0, 3).join(", ")}
                          {r.tags.length > 3 ? `, +${r.tags.length - 3}` : ""}
                        </Text>
                      ) : null}
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{r.vendor ?? "—"}</IndexTable.Cell>
                  <IndexTable.Cell>{r.product_type ?? "—"}</IndexTable.Cell>
                  <IndexTable.Cell>{priceRange(r.price_min, r.price_max)}</IndexTable.Cell>
                  <IndexTable.Cell>
                    {r.inventory_total !== null ? formatNumber(r.inventory_total) : "—"}
                  </IndexTable.Cell>
                  <IndexTable.Cell>{formatNumber(r.units_sold)}</IndexTable.Cell>
                  <IndexTable.Cell>{formatMoney(r.revenue)}</IndexTable.Cell>
                  <IndexTable.Cell>{formatDate(r.created_at)}</IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        )}

        {data && data.view === "by_tag" && (
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "tag", plural: "tags" }}
              itemCount={data.rows.length}
              selectable={false}
              loading={loading}
              headings={[
                { title: "Tag" },
                { title: "Products" },
                { title: "Units sold" },
                { title: "Revenue" },
              ]}
              emptyState={
                <Box padding="400">
                  <Text as="p" tone="subdued">
                    No tagged products in this period.
                  </Text>
                </Box>
              }
            >
              {data.rows.map((r, idx) => (
                <IndexTable.Row id={r.tag} key={r.tag} position={idx}>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">
                      {r.tag}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{formatNumber(r.product_count)}</IndexTable.Cell>
                  <IndexTable.Cell>{formatNumber(r.units_sold)}</IndexTable.Cell>
                  <IndexTable.Cell>{formatMoney(r.revenue)}</IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
