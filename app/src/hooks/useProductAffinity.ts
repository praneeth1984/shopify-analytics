import { useCallback, useEffect, useState } from "react";
import type { AffinityResponse, DateRangePreset } from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";

export function useProductAffinity(preset: DateRangePreset) {
  const [data, setData] = useState<AffinityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<AffinityResponse>(
        `/api/metrics/products/affinity?preset=${encodeURIComponent(preset)}`,
      );
      setData(result);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load affinity data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error };
}
