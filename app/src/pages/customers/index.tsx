import { useState } from "react";
import { Page, Tabs } from "@shopify/polaris";
import { navigate } from "../../App.js";
import { CustomersOverviewPage } from "./Overview.js";
import { RetentionPage } from "./Retention.js";
import { LtvPage } from "./Ltv.js";
import { RfmPage } from "./Rfm.js";
import { Geography } from "../Geography.js";

const TABS = [
  { id: "overview", content: "Overview", panelID: "overview-panel" },
  { id: "retention", content: "Cohort Retention", panelID: "retention-panel" },
  { id: "ltv", content: "LTV", panelID: "ltv-panel" },
  { id: "rfm", content: "RFM Segments", panelID: "rfm-panel" },
  { id: "geography", content: "Geography", panelID: "geography-panel" },
];

const ROUTES = [
  "/customers/overview",
  "/customers/retention",
  "/customers/ltv",
  "/customers/rfm",
  "/customers/geography",
];

function getInitialTab(): number {
  const path = window.location.pathname;
  if (path.startsWith("/geography")) return 4; // legacy redirect
  const idx = ROUTES.findIndex((r) => path.startsWith(r));
  return idx >= 0 ? idx : 0;
}

export function CustomersSection() {
  const [selected, setSelected] = useState(getInitialTab);

  function handleTabChange(idx: number) {
    setSelected(idx);
    navigate(ROUTES[idx] ?? "/customers");
  }

  return (
    <Page title="Customers" fullWidth>
      <Tabs tabs={TABS} selected={selected} onSelect={handleTabChange}>
        {selected === 0 && <CustomersOverviewPage />}
        {selected === 1 && <RetentionPage />}
        {selected === 2 && <LtvPage />}
        {selected === 3 && <RfmPage />}
        {selected === 4 && <Geography />}
      </Tabs>
    </Page>
  );
}
