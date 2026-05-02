/**
 * Top-level layout. Routes between Dashboard, Settings, Geography, and Billing.
 *
 * Path-based router using history.pushState so the embedded app can deep-link
 * to /settings, /geography, /billing without an extra dependency. App Bridge's
 * NavMenu (in index.html) provides the surface nav inside Shopify admin.
 */

import { useCallback, useEffect, useState } from "react";
import { Page } from "@shopify/polaris";
import { Dashboard } from "./pages/Dashboard.js";
import { Settings } from "./pages/Settings.js";
import { Geography } from "./pages/Geography.js";
import { Billing } from "./pages/Billing.js";

type Route = "dashboard" | "settings" | "geography" | "billing";

function readRoute(): Route {
  if (typeof window === "undefined") return "dashboard";
  const path = window.location.pathname.replace(/\/+$/, ""); // strip trailing slash
  if (path.endsWith("/settings")) return "settings";
  if (path.endsWith("/geography")) return "geography";
  if (path.endsWith("/billing")) return "billing";
  return "dashboard";
}

export function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onNav = () => setRoute(readRoute());
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);

  const goSettings = useCallback(() => {
    navigate("/settings");
  }, []);

  if (route === "settings") {
    return <Settings />;
  }

  if (route === "geography") {
    return <Geography />;
  }

  if (route === "billing") {
    return <Billing />;
  }

  return (
    <Page
      title="FirstBridge Analytics"
      subtitle="A clear view of your store, free."
      fullWidth
    >
      <Dashboard onNavigateToSettings={goSettings} />
    </Page>
  );
}
