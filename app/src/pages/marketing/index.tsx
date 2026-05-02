import { useState } from "react";
import { Page, Tabs } from "@shopify/polaris";
import { navigate } from "../../App.js";
import { DiscountsPage } from "./Discounts.js";
import { PaymentsPage } from "./Payments.js";

const TABS = [
  { id: "discounts", content: "Discounts", panelID: "discounts-panel" },
  { id: "payments", content: "Payments", panelID: "payments-panel" },
];

const ROUTES = ["/marketing/discounts", "/marketing/payments"];

function getInitialTab(): number {
  const path = window.location.pathname;
  if (path.startsWith("/marketing/payments")) return 1;
  return 0;
}

export function MarketingSection() {
  const [selected, setSelected] = useState(getInitialTab);

  function handleTabChange(idx: number) {
    setSelected(idx);
    navigate(ROUTES[idx] ?? "/marketing");
  }

  return (
    <Page title="Marketing" fullWidth>
      <Tabs tabs={TABS} selected={selected} onSelect={handleTabChange}>
        {selected === 0 && <DiscountsPage />}
        {selected === 1 && <PaymentsPage />}
      </Tabs>
    </Page>
  );
}
