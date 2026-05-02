/**
 * Top-level layout. Routes between Dashboard, Settings, Geography, and Billing.
 *
 * Path-based router using history.pushState so the embedded app can deep-link
 * to /settings, /geography, /billing without an extra dependency. App Bridge's
 * NavMenu (in index.html) provides the surface nav inside Shopify admin.
 *
 * Also handles Shopify's billing return URL: when the merchant approves or
 * declines a charge, Shopify redirects them back to the URL we passed as
 * `returnUrl`, with `?billing=success` or `?billing=declined`. We surface a
 * toast and strip the query so refreshing doesn't repeat it.
 */

import { useCallback, useEffect, useState } from "react";
import { Page } from "@shopify/polaris";
import { Dashboard } from "./pages/Dashboard.js";
import { Settings } from "./pages/Settings.js";
import { Geography } from "./pages/Geography.js";
import { Billing } from "./pages/Billing.js";
import { showToast } from "./lib/toast.js";

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

/**
 * Read and consume `?billing=success|declined` from the current URL. Returns
 * the parsed status (or null if absent) and rewrites history to drop the
 * query so a refresh doesn't replay the toast.
 */
function consumeBillingReturnParam(): "success" | "declined" | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get("billing");
  if (value !== "success" && value !== "declined") return null;
  params.delete("billing");
  const qs = params.toString();
  const newUrl =
    window.location.pathname + (qs.length > 0 ? `?${qs}` : "") + window.location.hash;
  window.history.replaceState({}, "", newUrl);
  return value;
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onNav = () => setRoute(readRoute());
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);

  // Surface the billing-return result exactly once per top-level mount.
  useEffect(() => {
    const result = consumeBillingReturnParam();
    if (result === "success") {
      showToast("Pro plan activated!");
    } else if (result === "declined") {
      showToast("Subscription declined — you're still on Free", { isError: true });
    }
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
