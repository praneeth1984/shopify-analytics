import { useState } from "react";
import { Page, Tabs } from "@shopify/polaris";
import { navigate } from "../../App.js";
import { DiscountsPage } from "./Discounts.js";
import { TrafficSourcesPage } from "./TrafficSources.js";
import { AbandonedCartPage } from "./AbandonedCart.js";

const TABS = [
  { id: "discounts", content: "Discounts", panelID: "discounts-panel" },
  { id: "traffic", content: "Traffic Sources", panelID: "traffic-panel" },
  { id: "abandoned", content: "Abandoned Cart", panelID: "abandoned-panel" },
];

const ROUTES = [
  "/marketing/discounts",
  "/marketing/traffic",
  "/marketing/abandoned",
];

function getInitialTab(): number {
  const path = window.location.pathname;
  if (path.startsWith("/marketing/traffic")) return 1;
  if (path.startsWith("/marketing/abandoned")) return 2;
  return 0;
}

export function MarketingSection() {
  const [selected, setSelected] = useState(getInitialTab);

  function handleTabChange(idx: number) {
    setSelected(idx);
    navigate(ROUTES[idx] ?? "/marketing");
  }

  return (
    <Page title="Acquisition" fullWidth>
      <Tabs tabs={TABS} selected={selected} onSelect={handleTabChange}>
        {selected === 0 && <DiscountsPage />}
        {selected === 1 && <TrafficSourcesPage />}
        {selected === 2 && <AbandonedCartPage />}
      </Tabs>
    </Page>
  );
}
