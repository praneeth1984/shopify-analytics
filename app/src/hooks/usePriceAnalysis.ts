import { useCallback, useEffect, useState } from "react";
import type { PriceAnalysisResponse, DateRangePreset } from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";

export function usePriceAnalysis(preset: DateRangePreset) {
  const [data, setData] = useState<PriceAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<PriceAnalysisResponse>(
        `/api/metrics/products/price-analysis?preset=${encodeURIComponent(preset)}`,
      );
      setData(result);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load price analysis.";
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
