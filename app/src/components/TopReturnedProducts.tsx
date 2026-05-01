/**
 * R-RET-1 frontend: top returned products card.
 *
 * Fetches GET /api/metrics/returns/by-product on `preset` change and renders a
 * Polaris IndexTable of the products with the highest return rate. Surfaces
 * the same `historyClampedTo` and `truncated` notices the profit page uses so
 * Free-plan limits are explained inline.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Card,
  EmptyState,
  IndexTable,
  SkeletonBodyText,
  Text,
} from "@shopify/polaris";
import type { DateRangePreset, ReturnsByProductResponse } from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";
import { formatMoney, formatNumber } from "../lib/format.js";

type Props = {
  preset: DateRangePreset;
};

export function TopReturnedProducts({ preset }: Props) {
  const [data, setData] = useState<ReturnsByProductResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<ReturnsByProductResponse>(
        `/api/metrics/returns/by-product?preset=${encodeURIComponent(preset)}`,
      );
      setData(result);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load returned products.";
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Top returned products
        </Text>

        {error ? (
          <Banner tone="critical" title="Could not load returned products">
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

        {data?.truncated ? (
          <Banner tone="info" title="Showing partial results">
            <p>
              This range exceeds our quick-aggregation window. We're showing the most recent
              portion.
            </p>
          </Banner>
        ) : null}

        {loading || !data ? (
          <Box minHeight="120px">
            <SkeletonBodyText lines={5} />
          </Box>
        ) : data.products.length === 0 ? (
          <EmptyState heading="No returns recorded in this period." image="" fullWidth>
            <p>
              Once customers start returning items, the products with the highest return rate
              will show up here.
            </p>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: "product", plural: "products" }}
            itemCount={data.products.length}
            selectable={false}
            headings={[
              { title: "Product" },
              { title: "Orders", alignment: "end" },
              { title: "Returns", alignment: "end" },
              { title: "Return rate", alignment: "end" },
              { title: "Refunded value", alignment: "end" },
            ]}
          >
            {data.products.map((p, idx) => (
              <IndexTable.Row id={p.product_id} key={p.product_id} position={idx}>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="medium">
                    {p.title}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" alignment="end" numeric>
                    {formatNumber(p.ordered_units)}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" alignment="end" numeric>
                    {formatNumber(p.returned_units)}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" alignment="end" numeric>
                    {formatRate(p.return_rate)}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" alignment="end" numeric>
                    {formatMoney(p.refunded_value)}
                  </Text>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}

        {data && data.excluded_low_volume_count > 0 ? (
          <Text as="p" tone="subdued" variant="bodySm">
            {`${data.excluded_low_volume_count} product${
              data.excluded_low_volume_count === 1 ? "" : "s"
            } hidden because they had fewer than 5 orders in this range.`}
          </Text>
        ) : null}
      </BlockStack>
    </Card>
  );
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}
