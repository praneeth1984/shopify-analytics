/**
 * Per-plan COGS and history caps.
 *
 * Re-exports the shared `PLAN_LIMITS` so the backend has a single source of
 * truth without duplicating constants. Server-side enforcement lives in
 * `routes/cogs.ts` (cap) and `routes/metrics-profit.ts` (history clamp).
 */

import type { Plan } from "@fbc/shared";
import { PLAN_LIMITS } from "@fbc/shared";

export type CapInfo = {
  cogsCap: number;
  historyDays: number;
};

export function limitsFor(plan: Plan): CapInfo {
  return PLAN_LIMITS[plan];
}

/**
 * True iff `nextCount` is within the cap for the given plan.
 * `Infinity` always passes.
 */
export function withinCogsCap(plan: Plan, nextCount: number): boolean {
  return nextCount <= PLAN_LIMITS[plan].cogsCap;
}

export { PLAN_LIMITS };
