/**
 * COGS lookup — answers "what is the cost basis (in minor units) for a given
 * variant at a given selling price?" using the explicit-cost > default-margin
 * > none priority defined in the architect's design.
 *
 * Returns a `source` discriminator so the dashboard can be honest about which
 * line items contributed using an estimated default margin.
 */

import type { CogsEntry, CogsMeta, Money } from "@fbc/shared";

export type CogsCostSource = "explicit" | "default_margin" | "none";

export type CogsResolution = {
  costMinor: bigint;
  source: CogsCostSource;
};

export type CogsLookup = {
  meta: CogsMeta;
  resolve: (variantId: string | null | undefined, unitPriceMinor: bigint) => CogsResolution;
  hasAny: boolean;
};

/**
 * Convert a Shopify decimal string (e.g. "12.34") into minor currency units (1234n).
 * Negatives and arbitrary precision both supported.
 */
export function moneyToMinor(amount: string): bigint {
  const trimmed = amount.trim();
  const neg = trimmed.startsWith("-");
  const body = neg ? trimmed.slice(1) : trimmed;
  const [whole = "0", frac = ""] = body.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const minor = BigInt(whole || "0") * 100n + BigInt(fracPadded || "0");
  return neg ? -minor : minor;
}

export function minorToMoney(minor: bigint, currency: string): Money {
  const sign = minor < 0n ? "-" : "";
  const abs = minor < 0n ? -minor : minor;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return {
    amount: `${sign}${whole.toString()}.${frac.toString().padStart(2, "0")}`,
    currency_code: currency,
  };
}

/**
 * Build a lookup over an in-memory entries map. Default-margin fallback is
 * applied when `defaultMarginPct > 0` and no explicit entry exists.
 *
 * cost_default = unitPrice * (1 - defaultMarginPct)  (rounded toward zero)
 */
export function buildLookup(meta: CogsMeta, entries: CogsEntry[]): CogsLookup {
  const byVariant = new Map<string, CogsEntry>();
  for (const e of entries) byVariant.set(e.variantId, e);
  const defaultMarginPct = meta.defaultMarginPct;
  // Use parts-per-10000 to keep the math in BigInt without loss for the
  // typical 0..1 fractional margin (e.g. 0.4567 -> 4567 / 10000).
  const marginBp = BigInt(Math.round(defaultMarginPct * 10_000));
  const useDefault = marginBp > 0n && marginBp < 10_000n;
  const hasAny = entries.length > 0 || useDefault;

  return {
    meta,
    hasAny,
    resolve(variantId, unitPriceMinor): CogsResolution {
      if (variantId) {
        const hit = byVariant.get(variantId);
        if (hit) return { costMinor: moneyToMinor(hit.cost.amount), source: "explicit" };
      }
      if (useDefault) {
        // costMinor = unitPriceMinor * (10000 - marginBp) / 10000 (truncating).
        const factor = 10_000n - marginBp;
        const costMinor = (unitPriceMinor * factor) / 10_000n;
        return { costMinor, source: "default_margin" };
      }
      return { costMinor: 0n, source: "none" };
    },
  };
}
