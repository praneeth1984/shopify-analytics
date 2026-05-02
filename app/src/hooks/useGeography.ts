import { useCallback, useEffect, useState } from "react";
import type { DateRangePreset, GeographyResponse } from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";

export function useGeography(preset: DateRangePreset) {
  const [data, setData] = useState<GeographyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<GeographyResponse>(
        `/api/metrics/geography?preset=${encodeURIComponent(preset)}`,
      );
      setData(result);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load geography data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
