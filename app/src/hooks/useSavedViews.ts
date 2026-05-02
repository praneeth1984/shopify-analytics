import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "../lib/api.js";

export type SavedView = { name: string; url: string };

export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ preferences: { savedViews?: SavedView[] } }>(
        "/api/preferences",
      );
      setViews(result.preferences.savedViews ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load saved views.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (name: string, url: string): Promise<string | null> => {
    try {
      const result = await apiFetch<{ saved_views: SavedView[] }>("/api/preferences/saved-views", {
        method: "POST",
        body: JSON.stringify({ name, url }),
      });
      setViews(result.saved_views);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : "Could not save view.";
    }
  }, []);

  const remove = useCallback(async (name: string): Promise<void> => {
    try {
      const result = await apiFetch<{ saved_views: SavedView[] }>(
        `/api/preferences/saved-views/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      setViews(result.saved_views);
    } catch {
      // best effort
    }
  }, []);

  return { views, loading, error, save, remove };
}
