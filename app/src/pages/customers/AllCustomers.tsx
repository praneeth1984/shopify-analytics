import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banner, BlockStack, Card, Icon, IndexTable,
  Page, SkeletonBodyText, Text, TextField,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { apiFetch, ApiError } from "../../lib/api.js";
import { formatMoney } from "../../lib/format.js";
import { TablePagination, useClientPagination } from "../../components/TablePagination.js";

type CustomerRow = {
  id: string;
  maskedName: string;
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

type SortDirection = "ascending" | "descending";

const SORT_KEYS: Array<keyof CustomerRow | null> = [
  "maskedName", null, "totalOrders", "totalSpentAmount",
  "avgOrderValueAmount", "firstOrderDate", "lastOrderDate", "avgDaysBetweenOrders",
];

function sortRows(rows: CustomerRow[], colIdx: number, dir: SortDirection): CustomerRow[] {
  const key = SORT_KEYS[colIdx];
  if (key === null) return rows;
  const mul = dir === "ascending" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av === null && bv === null) return 0;
    if (av === null) return mul;
    if (bv === null) return -mul;
    if (typeof av === "number" && typeof bv === "number") return mul * (av - bv);
    const af = parseFloat(av as string), bf = parseFloat(bv as string);
    if (!isNaN(af) && !isNaN(bf)) return mul * (af - bf);
    return mul * String(av).localeCompare(String(bv));
  });
}

export function AllCustomersPage() {
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [sortIndex, setSortIndex] = useState(3);
  const [sortDirection, setSortDirection] = useState<SortDirection>("descending");

  // Debounce search input → query
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : "";
    apiFetch<CustomerListResponse>(`/api/metrics/customers/list${qs}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [searchQuery]);

  const handleSort = useCallback((index: number, direction: SortDirection) => {
    setSortIndex(index);
    setSortDirection(direction);
  }, []);

  const sorted = useMemo(
    () => sortRows(data?.customers ?? [], sortIndex, sortDirection),
    [data?.customers, sortIndex, sortDirection],
  );

  const pg = useClientPagination(sorted);

  const tableMarkup = useMemo(
    () => pg.page.map((c, i) => (
      <IndexTable.Row id={c.id} key={c.id} position={i}>
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd" fontWeight="semibold">{c.maskedName}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm">
            {[c.city, c.country].filter(Boolean).join(", ") || "—"}
          </Text>
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
    )),
    [pg.page],
  );

  return (
    <Page title="All Customers">
      <BlockStack gap="400">
        {data?.planCappedTo && (
          <Banner tone="info">
            <Text as="p" variant="bodySm">
              Free plan: showing top {data.planCappedTo} customers. Upgrade to Pro for the full list.
            </Text>
          </Banner>
        )}
        {error && <Banner tone="critical"><Text as="p">{error}</Text></Banner>}

        <TextField
          label="Search customers"
          labelHidden
          placeholder="Search by name…"
          value={searchInput}
          onChange={setSearchInput}
          prefix={<Icon source={SearchIcon} tone="base" />}
          autoComplete="off"
          clearButton
          onClearButtonClick={() => setSearchInput("")}
        />

        {loading && <Card><SkeletonBodyText lines={8} /></Card>}

        {!loading && data && (
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "customer", plural: "customers" }}
              itemCount={pg.page.length}
              selectable={false}
              sortable={[true, false, true, true, true, true, true, true]}
              sortDirection={sortDirection}
              sortColumnIndex={sortIndex}
              onSort={handleSort}
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
              {tableMarkup}
            </IndexTable>
            <TablePagination {...pg.props} />
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
