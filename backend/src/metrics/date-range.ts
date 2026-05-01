/**
 * Resolve a DateRangePreset into concrete UTC ISO start/end dates.
 *
 * Conventions:
 * - end is exclusive (matches Shopify search syntax: processed_at:<X)
 * - "today" / "yesterday" align to UTC days; we don't yet handle shop timezone.
 *   Phase 2 will add per-shop timezone handling using shop.ianaTimezone.
 */

import type { DateRange, DateRangePreset } from "@fbc/shared";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

export function resolveRange(preset: DateRangePreset, customStart?: string, customEnd?: string): DateRange {
  const now = new Date();
  const today = startOfUtcDay(now);
  const tomorrow = addDays(today, 1);

  switch (preset) {
    case "today":
      return { preset, start: today.toISOString(), end: tomorrow.toISOString() };
    case "yesterday":
      return { preset, start: addDays(today, -1).toISOString(), end: today.toISOString() };
    case "last_7_days":
      return { preset, start: addDays(today, -7).toISOString(), end: tomorrow.toISOString() };
    case "last_30_days":
      return { preset, start: addDays(today, -30).toISOString(), end: tomorrow.toISOString() };
    case "last_90_days":
      return { preset, start: addDays(today, -90).toISOString(), end: tomorrow.toISOString() };
    case "month_to_date": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { preset, start: start.toISOString(), end: tomorrow.toISOString() };
    }
    case "year_to_date": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      return { preset, start: start.toISOString(), end: tomorrow.toISOString() };
    }
    case "custom": {
      if (!customStart || !customEnd) throw new Error("custom range requires start and end");
      return { preset, start: customStart, end: customEnd };
    }
  }
}
