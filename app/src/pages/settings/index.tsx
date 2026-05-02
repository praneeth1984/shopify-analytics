import { useState } from "react";
import { Page, Tabs } from "@shopify/polaris";
import { navigate } from "../../App.js";
import { CogsSettingsTab } from "./Cogs.js";
import { ExpensesSettingsTab } from "./Expenses.js";
import { GatewayRatesTab } from "./GatewayRates.js";

const TABS = [
  { id: "cogs", content: "COGS & Profit", panelID: "cogs-panel" },
  { id: "expenses", content: "Expenses", panelID: "expenses-panel" },
  { id: "gateways", content: "Gateway Rates", panelID: "gateways-panel" },
];

const ROUTES = ["/settings/cogs", "/settings/expenses", "/settings/gateways"];

function getInitialTab(): number {
  const path = window.location.pathname;
  if (path.startsWith("/settings/expenses")) return 1;
  if (path.startsWith("/settings/gateways")) return 2;
  return 0;
}

export function SettingsSection() {
  const [selected, setSelected] = useState(getInitialTab);

  function handleTabChange(idx: number) {
    setSelected(idx);
    navigate(ROUTES[idx] ?? "/settings");
  }

  return (
    <Page
      title="Settings"
      subtitle="Tell us what your products cost so we can show profit, not just revenue."
    >
      <Tabs tabs={TABS} selected={selected} onSelect={handleTabChange}>
        {selected === 0 && <CogsSettingsTab />}
        {selected === 1 && <ExpensesSettingsTab />}
        {selected === 2 && <GatewayRatesTab />}
      </Tabs>
    </Page>
  );
}
