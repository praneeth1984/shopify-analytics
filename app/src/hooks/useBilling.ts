/**
 * useBilling — Managed Pricing integration for the embedded app.
 *
 * Flow:
 *   1. On mount, GET /api/billing/status to read the resolved plan.
 *   2. manage() POSTs to /api/billing/manage to get the Shopify Managed
 *      Pricing page URL, then navigates window.top there. Shopify handles
 *      plan selection, upgrade, downgrade, and cancellation entirely within
 *      their own billing UI.
 *   3. After the merchant returns, the app re-reads plan status (the
 *      app_subscriptions/update webhook has already updated the KV cache).
 */

import { useCallback, useEffect, useState } from "react";
import type { Plan } from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";

export type UseBillingState = {
  plan: Plan | null;
  loading: boolean;
  error: string | null;
  manage: () => Promise<void>;
  reload: () => Promise<void>;
};

export function useBilling(): UseBillingState {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch<{ plan: Plan }>("/api/billing/status");
      setPlan(r.plan);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load plan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const manage = useCallback(async () => {
    setError(null);
    try {
      const r = await apiFetch<{ pricingUrl: string }>("/api/billing/manage", {
        method: "POST",
      });
      // Navigate the top-level frame to the pricing page. window.open with _top
      // works even when the iframe sandbox restricts window.top.location access.
      window.open(r.pricingUrl, "_top");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open pricing page.");
    }
  }, []);

  return { plan, loading, error, manage, reload };
}
