/**
 * Top-level layout. Routes between Dashboard and Settings.
 *
 * For now we use a tiny hash-based router so the embedded app can deep-link
 * to /settings without an extra dependency. App Bridge's NavMenu component
 * (mounted in main.tsx via the appBridge global) takes care of the surface
 * nav inside Shopify admin.
 */

import { useCallback, useEffect, useState } from "react";
import { Page } from "@shopify/polaris";
import { Dashboard } from "./pages/Dashboard.js";
import { Settings } from "./pages/Settings.js";
import { Geography } from "./pages/Geography.js";

type Route = "dashboard" | "settings" | "geography";

function readRoute(): Route {
  if (typeof window === "undefined") return "dashboard";
  const path = window.location.pathname.replace(/\/+$/, ""); // strip trailing slash
  if (path.endsWith("/settings")) return "settings";
  if (path.endsWith("/geography")) return "geography";
  return "dashboard";
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  // Dispatch a popstate so readRoute() re-runs
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
