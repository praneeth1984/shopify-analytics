import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api.js";
import type { RepeatRateMetrics, DateRangePreset, ComparisonMode } from "@fbc/shared";

export function useRepeatRate(
  preset: DateRangePreset,
  comparison: ComparisonMode = "previous_period",
  start?: string,
  end?: string,
) {
  const [data, setData] = useState<RepeatRateMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ preset, comparison });
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    apiFetch<RepeatRateMetrics>(`/api/metrics/customers/repeat-rate?${params.toString()}`)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e: Error) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [preset, comparison, start, end]);

  return { data, loading, error };
}
