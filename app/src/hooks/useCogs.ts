/**
 * useCogs — fetch + mutate per-variant costs.
 *
 * Optimistic update: a successful upsert/delete swaps the local entry list
 * before the round trip resolves. On failure we roll back and surface the
 * error code (notably COGS_CAP_EXCEEDED -> banner, COGS_VERSION_CONFLICT ->
 * silent reload + retry).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CogsEntry, CogsMeta, Money, Plan } from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";

export type CogsListResponse = {
  mode: "list";
  entries: CogsEntry[];
  plan: Plan;
  limits: { cogs_cap: number; history_days: number };
  meta: CogsMeta;
};

export type CogsSearchVariant = {
  variant_id: string;
  product_id: string;
  sku: string | null;
  title: string;
  variant_title: string | null;
  display_name: string;
  price: Money;
  image_url: string | null;
  existing_cost: Money | null;
};

export type CogsSearchResponse = {
  mode: "search";
  page_info: { hasNextPage: boolean; endCursor: string | null };
  variants: CogsSearchVariant[];
  plan: Plan;
  limits: { cogs_cap: number; history_days: number };
  meta: CogsMeta;
};

export type SyncResult = {
  synced: number;
  skipped: number;
  capped: boolean;
};

export type UseCogsState = {
  loading: boolean;
  syncing: boolean;
  error: string | null;
  entries: CogsEntry[];
  meta: CogsMeta | null;
  plan: Plan;
  cap: number;
  reload: () => Promise<void>;
  upsert: (input: {
    variantId: string;
    productId: string;
    title: string;
    sku: string | null;
    cost: Money;
  }) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  remove: (variantId: string) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  setDefaultMargin: (
    pct: number,
  ) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  search: (query: string, cursor?: string | null) => Promise<CogsSearchResponse>;
  syncFromShopify: (overwrite?: boolean) => Promise<{ ok: true; result: SyncResult } | { ok: false; code: string; message: string }>;
};

export function useCogs(): UseCogsState {
  const [entries, setEntries] = useState<CogsEntry[]>([]);
  const [meta, setMeta] = useState<CogsMeta | null>(null);
  const [plan, setPlan] = useState<Plan>("free");
  const [cap, setCap] = useState<number>(20);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch<CogsListResponse>("/api/cogs");
      setEntries(r.entries);
      setMeta(r.meta);
      setPlan(r.plan);
      setCap(Number.isFinite(r.limits.cogs_cap) ? r.limits.cogs_cap : Number.POSITIVE_INFINITY);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load costs.");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const upsert = useCallback<UseCogsState["upsert"]>(
    async (input) => {
      if (!meta) return { ok: false, code: "not_ready", message: "Costs are still loading." };
      const previousEntries = entries;
      const optimistic: CogsEntry = {
        variantId: input.variantId,
        productId: input.productId,
        title: input.title,
        sku: input.sku,
        cost: input.cost,
        updatedAt: new Date().toISOString(),
      };
      const idx = previousEntries.findIndex((e) => e.variantId === input.variantId);
      const nextEntries =
        idx >= 0
          ? previousEntries.map((e, i) => (i === idx ? optimistic : e))
          : [...previousEntries, optimistic];
      setEntries(nextEntries);

      try {
        const result = await apiFetch<{ meta: CogsMeta; entry: CogsEntry }>(
          "/api/cogs/upsert",
          {
            method: "POST",
            body: JSON.stringify({
              ...input,
              expectedLastWriteAt: meta.lastWriteAt,
            }),
          },
        );
        setMeta(result.meta);
        // Replace optimistic with server result.
        setEntries((curr) =>
          curr.map((e) => (e.variantId === result.entry.variantId ? result.entry : e)),
        );
        return { ok: true };
      } catch (e) {
        setEntries(previousEntries);
        if (e instanceof ApiError) {
          if (e.code === "COGS_VERSION_CONFLICT") {
            await reload();
          }
          return { ok: false, code: e.code, message: e.message };
        }
        return { ok: false, code: "request_failed", message: "Could not save cost." };
      }
    },
    [entries, meta, reload],
  );

  const remove = useCallback<UseCogsState["remove"]>(
    async (variantId) => {
      if (!meta) return { ok: false, code: "not_ready", message: "Costs are still loading." };
      const previousEntries = entries;
      setEntries(previousEntries.filter((e) => e.variantId !== variantId));
      try {
        const result = await apiFetch<{ meta: CogsMeta }>(
          `/api/cogs/${encodeURIComponent(variantId)}`,
          {
            method: "DELETE",
            body: JSON.stringify({ expectedLastWriteAt: meta.lastWriteAt }),
          },
        );
        setMeta(result.meta);
        return { ok: true };
      } catch (e) {
        setEntries(previousEntries);
        if (e instanceof ApiError) {
          if (e.code === "COGS_VERSION_CONFLICT") {
            await reload();
          }
          return { ok: false, code: e.code, message: e.message };
        }
        return { ok: false, code: "request_failed", message: "Could not delete cost." };
      }
    },
    [entries, meta, reload],
  );

  const setDefaultMargin = useCallback<UseCogsState["setDefaultMargin"]>(
    async (pct) => {
      if (!meta) return { ok: false, code: "not_ready", message: "Settings still loading." };
      try {
        const result = await apiFetch<{ meta: CogsMeta }>("/api/cogs/default-margin", {
          method: "PATCH",
          body: JSON.stringify({
            defaultMarginPct: pct,
            expectedLastWriteAt: meta.lastWriteAt,
          }),
        });
        setMeta(result.meta);
        return { ok: true };
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.code === "COGS_VERSION_CONFLICT") {
            await reload();
          }
          return { ok: false, code: e.code, message: e.message };
        }
        return { ok: false, code: "request_failed", message: "Could not save margin." };
      }
    },
    [meta, reload],
  );

  const search = useCallback<UseCogsState["search"]>(async (query, cursor) => {
    const params = new URLSearchParams({ query });
    if (cursor) params.set("cursor", cursor);
    return apiFetch<CogsSearchResponse>(`/api/cogs?${params.toString()}`);
  }, []);

  const syncFromShopify = useCallback<UseCogsState["syncFromShopify"]>(
    async (overwrite = false) => {
      setSyncing(true);
      try {
        const result = await apiFetch<{ synced: number; skipped: number; capped: boolean }>(
          "/api/cogs/sync",
          { method: "POST", body: JSON.stringify({ overwrite }) },
        );
        await reload();
        return { ok: true, result };
      } catch (e) {
        if (e instanceof ApiError) {
          return { ok: false, code: e.code, message: e.message };
        }
        return { ok: false, code: "request_failed", message: "Sync failed." };
      } finally {
        setSyncing(false);
      }
    },
    [reload],
  );

  return {
    loading,
    syncing,
    error,
    entries,
    meta,
    plan,
    cap,
    reload,
    upsert,
    remove,
    setDefaultMargin,
    search,
    syncFromShopify,
  };
}
