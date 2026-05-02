import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api.js";
import type { CohortRetentionResponse, DateRangePreset } from "@fbc/shared";

type State = { data: CohortRetentionResponse | null; loading: boolean; error: string | null };

export function useCohort(preset: DateRangePreset): State {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    apiFetch<CohortRetentionResponse>(`/api/metrics/customers/cohort?preset=${preset}`)
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((err: Error) => { if (!cancelled) setState({ data: null, loading: false, error: err.message }); });
    return () => { cancelled = true; };
  }, [preset]);

  return state;
}
