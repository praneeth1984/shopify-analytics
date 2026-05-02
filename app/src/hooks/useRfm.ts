import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api.js";
import type { RfmResponse, DateRangePreset } from "@fbc/shared";

type State = { data: RfmResponse | null; loading: boolean; error: string | null };

export function useRfm(preset: DateRangePreset): State {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    apiFetch<RfmResponse>(`/api/metrics/customers/rfm?preset=${preset}`)
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((err: Error) => { if (!cancelled) setState({ data: null, loading: false, error: err.message }); });
    return () => { cancelled = true; };
  }, [preset]);

  return state;
}
