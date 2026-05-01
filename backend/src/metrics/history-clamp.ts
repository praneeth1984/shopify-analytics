/**
 * Free-plan history clamp.
 *
 * The Free plan caps history at 90 days; Pro is unlimited. When a requested
 * range exceeds the plan's `historyDays`, we clamp `start` so the window ends
 * at the requested `end` and reports back through `historyClampedTo` so the
 * UI can explain the clamp inline (per CLAUDE.md "show the cap inline").
 */

import type { HistoryClamp, Plan } from "@fbc/shared";
import { PLAN_LIMITS } from "@fbc/shared";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function clampRangeForPlan<T extends { start: string; end: string }>(
  range: T,
  plan: Plan,
): { range: T; historyClampedTo: HistoryClamp | null } {
  const historyDays = PLAN_LIMITS[plan].historyDays;
  if (!Number.isFinite(historyDays)) return { range, historyClampedTo: null };

  const start = new Date(range.start);
  const end = new Date(range.end);
  const lengthDays = Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY);
  if (lengthDays <= historyDays) return { range, historyClampedTo: null };

  const clampedStart = new Date(end.getTime() - historyDays * MS_PER_DAY);
  return {
    range: { ...range, start: clampedStart.toISOString() },
    historyClampedTo: {
      fromIso: clampedStart.toISOString(),
      toIso: range.end,
      reason: "free_plan_history_cap",
    },
  };
}
