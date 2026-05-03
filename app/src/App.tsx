/**
 * Top-level layout. Routes between Overview, Settings, Geography, and Billing.
 *
 * Path-based router using history.pushState so the embedded app can deep-link
 * to /settings, /geography, /billing without an extra dependency. App Bridge's
 * NavMenu (in index.html) provides the surface nav inside Shopify admin.
 */

import { useEffect, useState } from "react";
import { OverviewPage } from "./pages/Overview.js";
import { SettingsSection } from "./pages/settings/index.js";
import { Billing } from "./pages/Billing.js";
import { ProfitSection } from "./pages/profit/index.js";
import { ProductsSection } from "./pages/products/index.js";
import { CustomersSection } from "./pages/customers/index.js";
import { MarketingSection } from "./pages/marketing/index.js";
import { ReportsSection } from "./pages/reports/index.js";
import { Feedback } from "./pages/Feedback.js";
import { About } from "./pages/About.js";

type Route =
  | "overview"
  | "settings"
  | "billing"
  | "profit"
  | "products"
  | "customers"
  | "marketing"
  | "reports"
  | "feedback"
  | "about";

function readRoute(): Route {
  if (typeof window === "undefined") return "overview";
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "" || path.startsWith("/overview")) return "overview";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/billing")) return "billing";
  if (path.startsWith("/profit")) return "profit";
  if (path.startsWith("/products")) return "products";
  // /geography is now a tab inside Customers
  if (path.startsWith("/customers") || path.startsWith("/geography")) return "customers";
  if (path.startsWith("/marketing")) return "marketing";
  if (path.startsWith("/reports")) return "reports";
  if (path.startsWith("/feedback")) return "feedback";
  if (path.startsWith("/about")) return "about";
  return "overview";
}

export function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    // Canonicalise root "/" → "/overview" so the ui-nav-menu highlights Overview
    // correctly. replaceState doesn't fire popstate, so no re-render needed.
    const p = window.location.pathname;
    if (p === "/" || p === "") {
      window.history.replaceState({}, "", "/overview");
    }

    const onNav = () => setRoute(readRoute());
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);

  if (route === "settings") return <SettingsSection />;
  if (route === "billing") return <Billing />;
  if (route === "profit") return <ProfitSection />;
  if (route === "products") return <ProductsSection />;
  if (route === "customers") return <CustomersSection />;
  if (route === "marketing") return <MarketingSection />;
  if (route === "reports") return <ReportsSection />;
  if (route === "feedback") return <Feedback />;
  if (route === "about") return <About />;
  return <OverviewPage />;
}
