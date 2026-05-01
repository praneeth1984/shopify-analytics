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

type Route = "dashboard" | "settings";

function readRoute(): Route {
  if (typeof window === "undefined") return "dashboard";
  const hash = window.location.hash.replace(/^#\/?/, "");
  return hash.startsWith("settings") ? "settings" : "dashboard";
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const goSettings = useCallback(() => {
    window.location.hash = "#/settings";
  }, []);

  if (route === "settings") {
    return <Settings />;
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
