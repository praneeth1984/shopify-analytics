/**
 * Top-level layout. Routes between Dashboard, Settings, Geography, and Billing.
 *
 * Path-based router using history.pushState so the embedded app can deep-link
 * to /settings, /geography, /billing without an extra dependency. App Bridge's
 * NavMenu (in index.html) provides the surface nav inside Shopify admin.
 */

import { useCallback, useEffect, useState } from "react";
import { Page, Toast, Frame } from "@shopify/polaris";
import { Dashboard } from "./pages/Dashboard.js";
import { apiFetch } from "./lib/api.js";

const IS_DEV = import.meta.env.DEV;
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
  | "dashboard"
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
  if (typeof window === "undefined") return "dashboard";
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "" || path.startsWith("/overview")) return "dashboard";
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
  return "dashboard";
}

export function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

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

  const goSettings = useCallback(() => {
    navigate("/settings");
  }, []);

  const seedOrders = useCallback(async () => {
    setSeeding(true);
    try {
      const res = await apiFetch<{ created: number; total: number }>("/api/dev/seed-orders", { method: "POST" });
      setSeedMsg(`✓ Created ${res.created}/${res.total} test orders — reload the dashboard`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSeedMsg(`✗ Seed failed: ${msg.slice(0, 120)}`);
    } finally {
      setSeeding(false);
    }
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

  return (
    <Frame>
      {seedMsg && (
        <Toast content={seedMsg} onDismiss={() => setSeedMsg(null)} duration={6000} />
      )}
      <Page
        title="FirstBridge Analytics"
        fullWidth
        secondaryActions={IS_DEV ? [
          {
            content: seeding ? "Creating orders…" : "Seed test orders",
            onAction: () => void seedOrders(),
            disabled: seeding,
          },
        ] : undefined}
      >
        <Dashboard onNavigateToSettings={goSettings} />
      </Page>
    </Frame>
  );
}
