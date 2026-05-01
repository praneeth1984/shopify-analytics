/**
 * usePreferences — read + merge-write tiny UI flags persisted to the
 * `firstbridge_analytics.config` shop metafield via /api/preferences.
 *
 * Designed for boolean dismissal flags only. Each set call rewrites the whole
 * preferences object (server merges with current); we don't bother with CAS
 * because no two flags should ever race on the same input event.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api.js";

export type Preferences = {
  cogsBackupTipDismissed?: boolean;
  // future: more boolean / scalar UI flags
};

type Response = { preferences: Preferences };

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<Response>("/api/preferences");
      setPreferences(res.preferences ?? {});
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load preferences.");
      setPreferences({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setPreference = useCallback(
    async <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      // Optimistic.
      setPreferences((prev) => ({ ...(prev ?? {}), [key]: value }));
      try {
        const res = await apiFetch<Response>("/api/preferences", {
          method: "PATCH",
          body: JSON.stringify({ [key]: value }),
        });
        setPreferences(res.preferences ?? {});
      } catch (e) {
        // Roll back to whatever's on the server.
        await load();
        setError(e instanceof ApiError ? e.message : "Could not save preference.");
      }
    },
    [load],
  );

  return { preferences, loading, error, setPreference, reload: load };
}
