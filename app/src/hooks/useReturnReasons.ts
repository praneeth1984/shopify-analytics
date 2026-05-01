/**
 * useReturnReasons — shared fetch for the returns-reasons endpoint so that
 * both the breakdown bars and the donut chart can consume the same response
 * without double-fetching.
 */

import { useCallback, useEffect, useState } from "react";
import type { DateRangePreset, ReturnReasonsResponse } from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";

export function useReturnReasons(preset: DateRangePreset) {
  const [data, setData] = useState<ReturnReasonsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<ReturnReasonsResponse>(
        `/api/metrics/returns/reasons?preset=${encodeURIComponent(preset)}`,
      );
      setData(result);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load return reasons.";
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
