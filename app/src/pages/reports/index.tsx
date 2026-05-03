import { useState } from "react";
import { Page, Tabs, Card, BlockStack, Text, InlineStack, Badge, Button } from "@shopify/polaris";
import type { DateRangePreset } from "@fbc/shared";
import { navigate } from "../../App.js";
import { ComingSoon } from "../../components/ComingSoon.js";
import { RangePicker } from "../../components/RangePicker.js";
import { ExportButton } from "../../components/ExportButton.js";
import { OrderReportPage } from "./OrderReport.js";
import { RefundReportPage } from "./RefundReport.js";
import { MonthlyReturnsPage } from "./MonthlyReturns.js";

const TABS = [
  { id: "reports", content: "Reports", panelID: "reports-panel" },
  { id: "export", content: "Export", panelID: "export-panel" },
  { id: "digest", content: "Scheduled Digest", panelID: "digest-panel" },
  { id: "saved", content: "Saved Views", panelID: "saved-panel" },
  { id: "filters", content: "Filters", panelID: "filters-panel" },
  { id: "sheets", content: "Google Sheets", panelID: "sheets-panel" },
];

const ROUTES = [
  "/reports",
  "/reports/export",
  "/reports/digest",
  "/reports/saved",
  "/reports/filters",
  "/reports/sheets",
];

function getInitialTab(): number {
  const path = window.location.pathname;
  if (path.startsWith("/reports/export")) return 1;
  if (path.startsWith("/reports/digest")) return 2;
  if (path.startsWith("/reports/saved")) return 3;
  if (path.startsWith("/reports/filters")) return 4;
  if (path.startsWith("/reports/sheets")) return 5;
  return 0;
}

const EXPORT_PANELS = [
  {
    panel: "overview",
    label: "Overview",
    description: "Revenue, orders, AOV, and unique customers for the selected period.",
  },
  {
    panel: "profit",
    label: "Profit & Loss",
    description: "Gross revenue, COGS, gross profit, and margin % by line item.",
  },
  {
    panel: "products",
    label: "Products",
    description: "Net revenue, COGS, gross profit, return rate, and units per product.",
  },
  {
    panel: "discounts",
    label: "Discount Codes",
    description: "Orders, revenue, avg discount %, and repeat customer rate per code.",
  },
  {
    panel: "customers",
    label: "Top Customers",
    description: "Top customers by revenue with order count and AOV.",
  },
  {
    panel: "payments",
    label: "Payment Mix",
    description: "Gateway mix, estimated fees, and net revenue per payment gateway.",
  },
  {
    panel: "orders",
    label: "Orders",
    description: "Raw order rows: name, status, line items, gross/net revenue, gateway, tags.",
  },
  {
    panel: "refunds",
    label: "Refunds",
    description: "Per-refund detail: amount, items refunded, restocked, note.",
  },
  {
    panel: "returns",
    label: "Returns",
    description: "Return rate, refund amounts, and return reasons per product.",
  },
] as const;

const REPORTS_INDEX = [
  {
    title: "Order Report",
    description: "Raw rows for every order. Filter by payment and fulfillment status, deep-link to the Shopify admin.",
    href: "/reports/orders",
  },
  {
    title: "Refund Report",
    description: "Refund-level detail with totals, items refunded, restock status, and notes.",
    href: "/reports/refunds",
  },
  {
    title: "Order vs Return (Monthly)",
    description: "Monthly orders and returned orders with return-rate trend over time.",
    href: "/reports/returns-monthly",
  },
];

function ReportsIndexPage() {
  return (
    <Page title="Reports" subtitle="Pre-built reports for the questions merchants ask most">
      <BlockStack gap="400">
        {REPORTS_INDEX.map((r) => (
          <Card key={r.href}>
            <InlineStack align="space-between" blockAlign="center" wrap>
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm">{r.title}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{r.description}</Text>
              </BlockStack>
              <Button onClick={() => navigate(r.href)}>Open</Button>
            </InlineStack>
          </Card>
        ))}
      </BlockStack>
    </Page>
  );
}

function ExportInfoPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");

  return (
    <Page title="CSV Export">
      <BlockStack gap="400">
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <Text as="p" tone="subdued">Select a date range, then download any panel as CSV.</Text>
            <RangePicker value={preset} onChange={setPreset} />
          </InlineStack>
        </Card>

        {EXPORT_PANELS.map(({ panel, label, description }) => (
          <Card key={panel}>
            <InlineStack align="space-between" blockAlign="center" wrap>
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm">{label}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{description}</Text>
              </BlockStack>
              <ExportButton panel={panel} preset={preset} label={`Download ${label} CSV`} />
            </InlineStack>
          </Card>
        ))}

        <Text as="p" variant="bodySm" tone="subdued">
          <Badge>Free</Badge>{" "}Exports are capped at 90 days of history. Upgrade to Pro for unlimited history.
        </Text>
      </BlockStack>
    </Page>
  );
}

export function ReportsSection() {
  const path = typeof window !== "undefined" ? window.location.pathname : "";

  // Sub-routes for individual report pages bypass the tab UI.
  if (path.startsWith("/reports/orders")) return <OrderReportPage />;
  if (path.startsWith("/reports/refunds")) return <RefundReportPage />;
  if (path.startsWith("/reports/returns-monthly")) return <MonthlyReturnsPage />;

  return <ReportsTabsPage />;
}

function ReportsTabsPage() {
  const [selected, setSelected] = useState(getInitialTab);

  function handleTabChange(idx: number) {
    setSelected(idx);
    navigate(ROUTES[idx] ?? "/reports");
  }

  return (
    <Page title="Reports" fullWidth>
      <Tabs tabs={TABS} selected={selected} onSelect={handleTabChange}>
        {selected === 0 && <ReportsIndexPage />}
        {selected === 1 && <ExportInfoPage />}
        {selected === 2 && <ComingSoon feature="Scheduled Email Digest" />}
        {selected === 3 && <ComingSoon feature="Saved Report Views" />}
        {selected === 4 && <ComingSoon feature="Tag & Metafield Filtering" phase="Phase 3" />}
        {selected === 5 && <ComingSoon feature="Google Sheets Live Sync" phase="Phase 3" />}
      </Tabs>
    </Page>
  );
}
