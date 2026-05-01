/**
 * useProfit — keyed on date range preset, mirrors the existing overview hook
 * pattern. Returns the response from /api/metrics/profit plus loading/error
 * state.
 */

import { useCallback, useEffect, useState } from "react";
import type { ComparisonMode, DateRangePreset, ProfitMetrics } from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";

export function useProfit(preset: DateRangePreset, comparison: ComparisonMode = "previous_period") {
  const [data, setData] = useState<ProfitMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<ProfitMetrics>(
        `/api/metrics/profit?preset=${encodeURIComponent(preset)}&comparison=${encodeURIComponent(comparison)}`,
      );
      setData(result);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load profit.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [preset, comparison]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
