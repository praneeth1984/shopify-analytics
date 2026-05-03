import { useEffect, useMemo, useState } from "react";
import { Page, Tabs, Card, BlockStack, Banner, Text, InlineStack, Button, TextField } from "@shopify/polaris";
import type { DateRangePreset } from "@fbc/shared";
import { navigate } from "../../App.js";
import { RangePicker } from "../../components/RangePicker.js";
import { PaymentsPage } from "../marketing/Payments.js";
import { ExportButton } from "../../components/ExportButton.js";
import { OrderReportPage } from "./OrderReport.js";
import { RefundReportPage } from "./RefundReport.js";
import { MonthlyReturnsPage } from "./MonthlyReturns.js";
import { TaxReportPage } from "./TaxReport.js";
import { PayoutsPage } from "./Payouts.js";
import { GiftCardsPage } from "./GiftCards.js";
import { FulfillmentReportPage } from "./FulfillmentReport.js";
import { TransactionReportPage } from "./TransactionReport.js";
import { OutstandingPaymentsPage } from "./OutstandingPayments.js";
import { TagReportPage } from "./TagReport.js";
import { BillingLocationPage } from "./BillingLocation.js";

const TABS = [
  { id: "reports", content: "Reports", panelID: "reports-panel" },
  { id: "export", content: "Export", panelID: "export-panel" },
];

const ROUTES = ["/reports", "/reports/export"];

function getInitialTab(): number {
  const path = window.location.pathname;
  if (path.startsWith("/reports/export")) return 1;
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

type ReportEntry = { title: string; description: string; href: string };
type ReportSection = { section: string; reports: ReportEntry[] };

const REPORTS_INDEX: ReportSection[] = [
  {
    section: "Operations",
    reports: [
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
        title: "Fulfillment Report",
        description: "Unfulfilled, stuck, and partial orders with fulfillment timing and shipping performance.",
        href: "/reports/fulfillment",
      },
      {
        title: "Outstanding Payments",
        description: "Orders with pending, authorized, or partially paid status and total amount owed.",
        href: "/reports/outstanding",
      },
    ],
  },
  {
    section: "Financial",
    reports: [
      {
        title: "Tax Report",
        description: "Monthly tax summary and breakdown by country/state for filing reference.",
        href: "/reports/tax",
      },
      {
        title: "Payout Report",
        description: "Shopify Payments payout history with gross, fees, and net per payout.",
        href: "/reports/payouts",
      },
      {
        title: "Payment Method Mix",
        description: "Revenue breakdown and estimated processing fees per payment gateway.",
        href: "/reports/payments",
      },
      {
        title: "Transaction Report",
        description: "Payment transactions by gateway with success rates, failure counts, and total value.",
        href: "/reports/transactions",
      },
      {
        title: "Gift Cards",
        description: "Outstanding gift card liability, expired/unused cards, and issuance history.",
        href: "/reports/gift-cards",
      },
      {
        title: "Billing Location & Currency",
        description: "Sales breakdown by customer billing country and checkout presentment currency.",
        href: "/reports/billing-location",
      },
    ],
  },
  {
    section: "Returns & Tags",
    reports: [
      {
        title: "Order vs Return (Monthly)",
        description: "Monthly orders and returned orders with return-rate trend over time.",
        href: "/reports/returns-monthly",
      },
      {
        title: "Tag Reports",
        description: "Revenue and order metrics grouped by order tags, product tags, or customer tags.",
        href: "/reports/tags",
      },
    ],
  },
];

function ReportsIndexContent() {
  const [query, setQuery] = useState("");

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REPORTS_INDEX;
    return REPORTS_INDEX.map((s) => ({
      ...s,
      reports: s.reports.filter(
        (r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
      ),
    })).filter((s) => s.reports.length > 0);
  }, [query]);

  const totalMatches = filteredSections.reduce((acc, s) => acc + s.reports.length, 0);

  return (
    <BlockStack gap="500">
      <TextField
        label="Search reports"
        labelHidden
        placeholder="Search reports…"
        value={query}
        onChange={setQuery}
        clearButton
        onClearButtonClick={() => setQuery("")}
        autoComplete="off"
      />

      {totalMatches === 0 && (
        <Card>
          <Text as="p" tone="subdued">No reports match "{query}".</Text>
        </Card>
      )}

      {filteredSections.map((section) => (
        <BlockStack key={section.section} gap="300">
          <Text as="h2" variant="headingMd">{section.section}</Text>
          {section.reports.map((r) => (
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
      ))}
    </BlockStack>
  );
}

function ExportInfoContent() {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");

  return (
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

      <Banner tone="info" title="Free plan: 90 days of history">
        <Text as="p">Exports are capped at 90 days of history. Upgrade to Pro for unlimited history.</Text>
      </Banner>
    </BlockStack>
  );
}

export function ReportsSection() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onNav = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);

  // Sub-routes for individual report pages bypass the tab UI.
  if (path.startsWith("/reports/orders")) return <OrderReportPage />;
  if (path.startsWith("/reports/refunds")) return <RefundReportPage />;
  if (path.startsWith("/reports/returns-monthly")) return <MonthlyReturnsPage />;
  if (path.startsWith("/reports/tax")) return <TaxReportPage />;
  if (path.startsWith("/reports/payouts")) return <PayoutsPage />;
  if (path.startsWith("/reports/payments")) return <PaymentsPage />;
  if (path.startsWith("/reports/gift-cards")) return <GiftCardsPage />;
  if (path.startsWith("/reports/fulfillment")) return <FulfillmentReportPage />;
  if (path.startsWith("/reports/transactions")) return <TransactionReportPage />;
  if (path.startsWith("/reports/outstanding")) return <OutstandingPaymentsPage />;
  if (path.startsWith("/reports/tags")) return <TagReportPage />;
  if (path.startsWith("/reports/billing-location")) return <BillingLocationPage />;

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
        {selected === 0 && <ReportsIndexContent />}
        {selected === 1 && <ExportInfoContent />}
      </Tabs>
    </Page>
  );
}
