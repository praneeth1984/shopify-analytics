import type { OrderNode } from "./queries.js";
import type { PriceAnalysisResponse, PriceBand, PriceBandRow, DateRange, Money, HistoryClamp } from "@fbc/shared";
import type { CogsLookup } from "../cogs/lookup.js";

const DEFAULT_BANDS: PriceBand[] = [
  { label: "$0–$25", min: 0, max: 25 },
  { label: "$25–$50", min: 25, max: 50 },
  { label: "$50–$100", min: 50, max: 100 },
  { label: "$100–$200", min: 100, max: 200 },
  { label: "$200+", min: 200, max: null },
];

function findBand(price: number, bands: PriceBand[]): number {
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]!;
    if (price >= b.min && (b.max === null || price < b.max)) return i;
  }
  return bands.length - 1;
}

function toMinorUnits(amount: string): bigint {
  const [whole = "0", frac = ""] = amount.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  return BigInt(whole) * 100n + BigInt(fracPadded);
}

function fromMinor(minor: bigint, currency: string): Money {
  const abs = minor < 0n ? -minor : minor;
  const cents = abs % 100n;
  const dollars = abs / 100n;
  const sign = minor < 0n ? "-" : "";
  return { amount: `${sign}${dollars}.${String(cents).padStart(2, "0")}`, currency_code: currency };
}

type BandAccum = {
  revenueMinor: bigint;
  unitsSold: number;
  unitsRefunded: number;
  cogsMinor: bigint;
  hasAnyCogs: boolean;
  products: Set<string>;
};

export function computePriceAnalysis(
  orders: OrderNode[],
  lookup: CogsLookup,
  currency: string,
  range: DateRange,
  truncated: boolean,
  historyClampedTo: HistoryClamp | null,
  bands: PriceBand[] = DEFAULT_BANDS,
): PriceAnalysisResponse {
  const accums: BandAccum[] = bands.map(() => ({
    revenueMinor: 0n,
    unitsSold: 0,
    unitsRefunded: 0,
    cogsMinor: 0n,
    hasAnyCogs: false,
    products: new Set<string>(),
  }));

  // Build refunded units per line item
  const refundedUnits = new Map<string, number>();
  for (const order of orders) {
    for (const refund of order.refunds) {
      for (const rli of refund.refundLineItems.edges) {
        const id = rli.node.lineItem?.id;
        if (!id) continue;
        refundedUnits.set(id, (refundedUnits.get(id) ?? 0) + rli.node.quantity);
      }
    }
  }

  for (const order of orders) {
    for (const edge of order.lineItems.edges) {
      const item = edge.node;
      if (!item.product?.id) continue;
      const unitPrice = parseFloat(
        item.originalTotalSet?.shopMoney.amount ?? "0",
      ) / Math.max(item.quantity, 1);
      const bandIdx = findBand(unitPrice, bands);
      const acc = accums[bandIdx];
      if (!acc) continue;

      acc.products.add(item.product.id);
      acc.unitsSold += item.quantity;
      const rUnits = refundedUnits.get(item.id) ?? 0;
      acc.unitsRefunded += rUnits;
      acc.revenueMinor += toMinorUnits(item.originalTotalSet?.shopMoney.amount ?? "0");

      if (item.variant?.id) {
        const unitPriceMinor = acc.revenueMinor / BigInt(Math.max(item.quantity, 1));
        const { costMinor, source } = lookup.resolve(item.variant.id, unitPriceMinor);
        if (source !== "none") {
          acc.cogsMinor += costMinor * BigInt(item.quantity);
          acc.hasAnyCogs = true;
        }
      }
    }
  }

  const rows: PriceBandRow[] = bands.map((band, i) => {
    const acc = accums[i]!;
    const netRevMinor = acc.revenueMinor;
    let avgMarginPct: number | null = null;
    if (acc.hasAnyCogs && netRevMinor > 0n) {
      const profitMinor = netRevMinor - acc.cogsMinor;
      avgMarginPct = Number(profitMinor * 10000n / netRevMinor) / 10000;
    }
    return {
      band,
      products: acc.products.size,
      units_sold: acc.unitsSold,
      revenue: fromMinor(acc.revenueMinor, currency),
      avg_margin_pct: avgMarginPct,
      return_rate: acc.unitsSold > 0 ? acc.unitsRefunded / acc.unitsSold : 0,
    };
  });

  return {
    range,
    bands: rows,
    truncated,
    history_clamped_to: historyClampedTo,
  };
}
