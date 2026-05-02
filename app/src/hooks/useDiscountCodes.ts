import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api.js";
import type { DiscountCodesResponse, DateRangePreset } from "@fbc/shared";

export function useDiscountCodes(preset: DateRangePreset, start?: string, end?: string) {
  const [data, setData] = useState<DiscountCodesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ preset });
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    apiFetch<DiscountCodesResponse>(`/api/metrics/discounts?${params.toString()}`)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e: Error) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [preset, start, end]);

  return { data, loading, error };
}
