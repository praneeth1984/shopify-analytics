import { useEffect, useState } from "react";
import {
  Banner, BlockStack, Card, IndexTable,
  Page, SkeletonBodyText, Text, useIndexResourceState,
} from "@shopify/polaris";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney } from "../../lib/format.js";

type CustomerRow = {
  id: string;
  maskedName: string;
  maskedEmail: string;
  city: string;
  country: string;
  totalOrders: number;
  totalSpentAmount: string;
  totalSpentCurrency: string;
  avgOrderValueAmount: string;
  avgOrderValueCurrency: string;
  firstOrderDate: string;
  lastOrderDate: string;
  avgDaysBetweenOrders: number | null;
  tags: string[];
};

type CustomerListResponse = {
  customers: CustomerRow[];
  total: number;
  plan: string;
  planCappedTo: number | null;
};

export function AllCustomersPage() {
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<CustomerListResponse>("/api/metrics/customers/list")
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const resourceName = { singular: "customer", plural: "customers" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(data?.customers ?? []);

  return (
    <Page title="All Customers">
      <BlockStack gap="400">
        {data?.planCappedTo && (
          <Banner tone="info">
            <Text as="p" variant="bodySm">
              Free plan: showing top {data.planCappedTo} customers by total spend. Upgrade to Pro for the full customer list.
            </Text>
          </Banner>
        )}

        {error && <Banner tone="critical"><Text as="p">{error}</Text></Banner>}
        {loading && <Card><SkeletonBodyText lines={8} /></Card>}

        {!loading && data && (
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={data.customers.length}
              selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "Customer" },
                { title: "Location" },
                { title: "Orders", alignment: "end" },
                { title: "Total spent", alignment: "end" },
                { title: "AOV", alignment: "end" },
                { title: "First order" },
                { title: "Last order" },
                { title: "Avg days between orders", alignment: "end" },
              ]}
            >
              {data.customers.map((c, i) => (
                <IndexTable.Row id={c.id} key={c.id} selected={selectedResources.includes(c.id)} position={i}>
                  <IndexTable.Cell>
                    <BlockStack gap="050">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{c.maskedName}</Text>
                      <Text as="span" variant="bodySm" tone="subdued">{c.maskedEmail}</Text>
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm">{[c.city, c.country].filter(Boolean).join(", ") || "—"}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm" alignment="end">{c.totalOrders}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm" alignment="end">
                      {formatMoney({ amount: c.totalSpentAmount, currency_code: c.totalSpentCurrency })}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm" alignment="end">
                      {formatMoney({ amount: c.avgOrderValueAmount, currency_code: c.avgOrderValueCurrency })}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm">{c.firstOrderDate.slice(0, 10)}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm">{c.lastOrderDate.slice(0, 10)}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm" alignment="end">
                      {c.avgDaysBetweenOrders !== null ? `${c.avgDaysBetweenOrders}d` : "—"}
                    </Text>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
