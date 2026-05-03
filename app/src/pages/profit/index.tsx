import { useState } from "react";
import { Page, Tabs } from "@shopify/polaris";
import { navigate } from "../../App.js";
import { BreakEvenCalculator } from "./BreakEven.js";
import { PLReportPage } from "./PLReport.js";
import { ProfitDashboard } from "./ProfitDashboard.js";
import { useProfit } from "../../hooks/useProfit.js";
import type { DateRangePreset } from "@fbc/shared";

const TABS = [
  { id: "dashboard", content: "Dashboard", panelID: "profit-dashboard-panel" },
  { id: "pl", content: "P&L Report", panelID: "pl-panel" },
  { id: "break-even", content: "Break-Even", panelID: "break-even-panel" },
];

const ROUTES = ["/profit/dashboard", "/profit/pl", "/profit/break-even"];

function getInitialTab(): number {
  const path = window.location.pathname;
  if (path.startsWith("/profit/pl")) return 1;
  if (path.startsWith("/profit/break-even")) return 2;
  return 0;
}

export function ProfitSection() {
  const [selected, setSelected] = useState(getInitialTab);
  const preset: DateRangePreset = "last_30_days";
  const profit = useProfit(preset);

  function handleTabChange(idx: number) {
    setSelected(idx);
    navigate(ROUTES[idx] ?? "/profit");
  }

  function goSettings() {
    navigate("/settings");
  }

  return (
    <Page title="Profit" fullWidth>
      <Tabs tabs={TABS} selected={selected} onSelect={handleTabChange}>
        {selected === 0 && <ProfitDashboard onSetupCogs={goSettings} />}
        {selected === 1 && <PLReportPage />}
        {selected === 2 && (
          <BreakEvenCalculator profit={profit.data} loading={profit.loading} />
        )}
      </Tabs>
    </Page>
  );
}
