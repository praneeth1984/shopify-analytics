/**
 * Top profitable products — Polaris ResourceList ranked by gross profit
 * (PRODUCT-level, not variant-level — per the architect's design).
 */

import {
  Card,
  ResourceList,
  ResourceItem,
  Text,
  InlineStack,
  BlockStack,
  Badge,
} from "@shopify/polaris";
import type { TopProfitableProduct } from "@fbc/shared";
import { formatMargin, formatMoney } from "../lib/format.js";

type Props = {
  products: TopProfitableProduct[];
  loading: boolean;
};

export function TopProfitableProducts({ products, loading }: Props) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingMd">
          Top profitable products
        </Text>
        {loading ? (
          <Text as="p" tone="subdued">
            Loading…
          </Text>
        ) : products.length === 0 ? (
          <Text as="p" tone="subdued">
            We'll rank your most profitable products here once orders and costs are in.
          </Text>
        ) : (
          <ResourceList
            resourceName={{ singular: "product", plural: "products" }}
            items={products}
            renderItem={renderItem}
          />
        )}
      </BlockStack>
    </Card>
  );
}

function renderItem(product: TopProfitableProduct) {
  const { product_id, title, gross_profit, gross_margin, units_sold } = product;
  return (
    <ResourceItem
      id={product_id}
      onClick={() => undefined}
      accessibilityLabel={`Profit details for ${title}`}
    >
      <InlineStack align="space-between" blockAlign="center" wrap={false}>
        <BlockStack gap="100">
          <Text as="span" fontWeight="medium">
            {title}
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            {units_sold.toLocaleString()} units
          </Text>
        </BlockStack>
        <InlineStack gap="200" blockAlign="center">
          <Text as="span" fontWeight="medium">
            {formatMoney(gross_profit)}
          </Text>
          <Badge tone={gross_margin >= 0 ? "success" : "critical"}>
            {formatMargin(gross_margin)}
          </Badge>
        </InlineStack>
      </InlineStack>
    </ResourceItem>
  );
}
