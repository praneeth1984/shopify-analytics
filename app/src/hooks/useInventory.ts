import { useCallback, useEffect, useState } from "react";
import type { InventoryResponse } from "@fbc/shared";
import { apiFetch, ApiError } from "../lib/api.js";

export function useInventory() {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<InventoryResponse>("/api/metrics/products/inventory");
      setData(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load inventory data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
