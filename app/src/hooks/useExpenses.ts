import { useCallback, useEffect, useState } from "react";
import type { ExpensesResponse, MonthlyExpenses } from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function useExpenses(month: string = currentMonth()) {
  const [data, setData] = useState<ExpensesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<ExpensesResponse>(`/api/expenses/${month}`);
      setData(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load expenses.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (expenses: MonthlyExpenses): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        await apiFetch(`/api/expenses/${month}`, { method: "PUT", body: JSON.stringify(expenses) });
        setData({ month, expenses });
        return true;
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not save expenses.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [month],
  );

  return { data, loading, saving, error, save };
}
