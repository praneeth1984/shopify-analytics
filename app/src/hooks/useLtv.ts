import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api.js";
import type { LtvByCohortResponse, DateRangePreset } from "@fbc/shared";

type State = { data: LtvByCohortResponse | null; loading: boolean; error: string | null };

export function useLtv(preset: DateRangePreset): State {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    apiFetch<LtvByCohortResponse>(`/api/metrics/customers/ltv?preset=${preset}`)
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((err: Error) => { if (!cancelled) setState({ data: null, loading: false, error: err.message }); });
    return () => { cancelled = true; };
  }, [preset]);

  return state;
}
