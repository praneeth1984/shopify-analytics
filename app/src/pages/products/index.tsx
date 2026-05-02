import { useState } from "react";
import { Page, Tabs } from "@shopify/polaris";
import { navigate } from "../../App.js";
import { ProductsPerformancePage } from "./Performance.js";
import { ProductAffinityPage } from "./Affinity.js";
import { PriceAnalysisPage } from "./PriceAnalysis.js";
import { InventoryPage } from "./Inventory.js";
import { BundlesPage } from "./Bundles.js";

const TABS = [
  { id: "performance", content: "Performance", panelID: "performance-panel" },
  { id: "inventory", content: "Inventory", panelID: "inventory-panel" },
  { id: "affinity", content: "Affinity", panelID: "affinity-panel" },
  { id: "bundles", content: "Bundles", panelID: "bundles-panel" },
  { id: "price-analysis", content: "Price Analysis", panelID: "price-panel" },
];

const ROUTES = [
  "/products/performance",
  "/products/inventory",
  "/products/affinity",
  "/products/bundles",
  "/products/price-analysis",
];

function getInitialTab(): number {
  const path = window.location.pathname;
  const idx = ROUTES.findIndex((r) => path.startsWith(r));
  return idx >= 0 ? idx : 0;
}

export function ProductsSection() {
  const [selected, setSelected] = useState(getInitialTab);

  function handleTabChange(idx: number) {
    setSelected(idx);
    navigate(ROUTES[idx] ?? "/products");
  }

  return (
    <Page title="Products" fullWidth>
      <Tabs tabs={TABS} selected={selected} onSelect={handleTabChange}>
        {selected === 0 && <ProductsPerformancePage />}
        {selected === 1 && <InventoryPage />}
        {selected === 2 && <ProductAffinityPage />}
        {selected === 3 && <BundlesPage />}
        {selected === 4 && <PriceAnalysisPage />}
      </Tabs>
    </Page>
  );
}
