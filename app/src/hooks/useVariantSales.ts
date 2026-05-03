import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api.js";
import type { DateRangePreset, VariantSalesResponse } from "@fbc/shared";

export function useVariantSales(preset: DateRangePreset, start?: string, end?: string) {
  const [data, setData] = useState<VariantSalesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ preset });
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    apiFetch<VariantSalesResponse>(`/api/metrics/products/variants?${params.toString()}`)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [preset, start, end]);

  return { data, loading, error };
}
