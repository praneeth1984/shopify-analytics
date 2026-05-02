import { useCallback, useEffect, useState } from "react";
import type { ComparisonMode, DateRangePreset, ProfitMetrics } from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";

export function useProfit(
  preset: DateRangePreset,
  comparison: ComparisonMode = "previous_period",
  customStart = "",
  customEnd = "",
) {
  const [data, setData] = useState<ProfitMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (preset === "custom" && (!customStart || !customEnd)) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ preset, comparison });
      if (preset === "custom" && customStart && customEnd) {
        params.set("start", customStart);
        params.set("end", customEnd);
      }
      const result = await apiFetch<ProfitMetrics>(`/api/metrics/profit?${params.toString()}`);
      setData(result);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load profit.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [preset, comparison, customStart, customEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
