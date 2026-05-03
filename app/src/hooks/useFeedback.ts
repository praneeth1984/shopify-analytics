/**
 * Feedback hook (F42).
 *
 * Loads the public feedback list, exposes a submit helper that re-fetches on
 * success, and a toggleUpvote helper with optimistic UI + server reconcile.
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/api.js";
import type { FeedbackItem, SubmitFeedbackRequest } from "@fbc/shared";

export function useFeedback() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ items: FeedbackItem[] }>("/api/feedback");
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(
    async (body: SubmitFeedbackRequest) => {
      await apiFetch<{ id: string }>("/api/feedback", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await load();
    },
    [load],
  );

  const toggleUpvote = useCallback(
    async (id: string) => {
      // Optimistic update
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                upvotes: item.hasUpvoted ? item.upvotes - 1 : item.upvotes + 1,
                hasUpvoted: !item.hasUpvoted,
              }
            : item,
        ),
      );
      try {
        const res = await apiFetch<{ upvotes: number; hasUpvoted: boolean }>(
          `/api/feedback/${id}/upvote`,
          { method: "POST" },
        );
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...res } : item)),
        );
      } catch {
        // Roll back to authoritative state on error.
        await load();
      }
    },
    [load],
  );

  return { items, loading, error, submit, reload: load, toggleUpvote };
}
