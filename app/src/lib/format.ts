import type { Money } from "@fbc/shared";

export function formatMoney(money: Money): string {
  const value = Number(money.amount);
  if (Number.isNaN(value)) return `${money.amount} ${money.currency_code}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: money.currency_code,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${money.amount} ${money.currency_code}`;
  }
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export function formatDeltaPct(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta)) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

export function deltaTone(delta: number | null): "success" | "critical" | "subdued" {
  if (delta === null || !Number.isFinite(delta)) return "subdued";
  if (delta > 0) return "success";
  if (delta < 0) return "critical";
  return "subdued";
}

/**
 * Format a 0..1 decimal as a percentage with one decimal place, e.g. 0.4567 -> "45.7%".
 * Negative margins are surfaced (e.g. when free items have a known cost).
 */
export function formatMargin(decimal: number): string {
  if (!Number.isFinite(decimal)) return "—";
  const pct = decimal * 100;
  return `${pct.toFixed(1)}%`;
}
