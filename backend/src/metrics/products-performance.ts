import type {
  GatewayRate,
  Plan,
  ProductPerformanceResponse,
  ProductPerformanceRow,
  Money,
  DateRange,
} from "@fbc/shared";
import type { OrderNode } from "./queries.js";
import type { CogsLookup } from "../cogs/lookup.js";
import { moneyToMinor, minorToMoney } from "../cogs/lookup.js";

function estimateFees(revenueMinor: bigint, gateway: string, rates: GatewayRate[]): bigint {
  const rate = rates.find((r) => r.gateway.toLowerCase() === gateway.toLowerCase());
  if (!rate) return 0n;
  return (revenueMinor * BigInt(Math.round(rate.pct * 1_000_000))) / 1_000_000n + BigInt(rate.fixed_minor);
}

const FREE_PRODUCT_CAP = 10;

type ProductAccumulator = {
  product_id: string;
  title: string;
  units_sold: number;
  units_refunded: number;
  gross_revenue_minor: bigint;
  refunded_amount_minor: bigint;
  cogs_minor: bigint | null;
};

export function computeProductsPerformance(
  orders: OrderNode[],
  lookup: CogsLookup,
  currency: string,
  plan: Plan,
  range: DateRange,
  truncated: boolean,
  gatewayRates: GatewayRate[] = [],
): ProductPerformanceResponse {
  const byProduct = new Map<string, ProductAccumulator>();
  let totalEstFeesMinor = 0n;

  for (const order of orders) {
    // Estimate payment fees for this order (F06)
    if (gatewayRates.length > 0 && order.paymentGatewayNames.length > 0) {
      const orderRevMinor = moneyToMinor(order.totalPriceSet.shopMoney.amount);
      totalEstFeesMinor += estimateFees(orderRevMinor, order.paymentGatewayNames[0]!, gatewayRates);
    }
    // Build refund attribution: lineItemId -> { units, minor }
    const refundedUnits = new Map<string, number>();
    const refundedMinorByLine = new Map<string, bigint>();

    for (const refund of order.refunds) {
      for (const edge of refund.refundLineItems.edges) {
        const rli = edge.node;
        if (!rli.lineItem) continue;
        const lid = rli.lineItem.id;
        refundedUnits.set(lid, (refundedUnits.get(lid) ?? 0) + rli.quantity);
        if (rli.subtotalSet) {
          const amt = moneyToMinor(rli.subtotalSet.shopMoney.amount);
          refundedMinorByLine.set(lid, (refundedMinorByLine.get(lid) ?? 0n) + amt);
        }
      }
    }

    for (const edge of order.lineItems.edges) {
      const li = edge.node;
      if (!li.product) continue;
      const { id: productId, title } = li.product;

      const lineGrossMinor = moneyToMinor(li.originalTotalSet.shopMoney.amount);
      const lineRefundedMinor = refundedMinorByLine.get(li.id) ?? (() => {
        // Fall back to pro-rating if subtotalSet was missing
        const unitRefunds = refundedUnits.get(li.id) ?? 0;
        if (unitRefunds === 0 || li.quantity === 0) return 0n;
        return (lineGrossMinor * BigInt(unitRefunds)) / BigInt(li.quantity);
      })();
      const unitsRefunded = refundedUnits.get(li.id) ?? 0;

      const variantId = li.variant?.id ?? null;
      const unitPriceMinor = moneyToMinor(li.discountedUnitPriceSet.shopMoney.amount);
      const resolved = lookup.resolve(variantId, unitPriceMinor);

      let cogsForLine: bigint | null = null;
      if (resolved.source === "explicit" || resolved.source === "default_margin") {
        cogsForLine = resolved.costMinor * BigInt(li.quantity);
      }

      const acc = byProduct.get(productId) ?? {
        product_id: productId,
        title,
        units_sold: 0,
        units_refunded: 0,
        gross_revenue_minor: 0n,
        refunded_amount_minor: 0n,
        cogs_minor: null,
      };

      acc.units_sold += li.quantity;
      acc.units_refunded += unitsRefunded;
      acc.gross_revenue_minor += lineGrossMinor;
      acc.refunded_amount_minor += lineRefundedMinor;

      if (cogsForLine !== null) {
        acc.cogs_minor = (acc.cogs_minor ?? 0n) + cogsForLine;
      }

      byProduct.set(productId, acc);
    }
  }

  const accumulators = Array.from(byProduct.values());
  const totalNetRevMinor = accumulators.reduce(
    (sum, a) => sum + a.gross_revenue_minor - a.refunded_amount_minor,
    0n,
  );
  const ratesConfigured = gatewayRates.length > 0;

  const allRows = accumulators
    .map((acc): ProductPerformanceRow => {
      const netRevenueMinor = acc.gross_revenue_minor - acc.refunded_amount_minor;
      const grossProfitMinor = acc.cogs_minor !== null ? netRevenueMinor - acc.cogs_minor : null;
      const grossMargin =
        grossProfitMinor !== null && netRevenueMinor > 0n
          ? Number(grossProfitMinor) / Number(netRevenueMinor)
          : null;
      const returnRate = acc.units_sold > 0 ? acc.units_refunded / acc.units_sold : 0;

      // F12: allocate fees proportionally by net revenue share
      let estFeesAllocatedMinor: bigint | null = null;
      let estNetProfitMinor: bigint | null = null;
      if (ratesConfigured && totalNetRevMinor > 0n && netRevenueMinor > 0n) {
        estFeesAllocatedMinor =
          (totalEstFeesMinor * netRevenueMinor) / totalNetRevMinor;
        if (grossProfitMinor !== null) {
          estNetProfitMinor = grossProfitMinor - estFeesAllocatedMinor;
        }
      }

      return {
        product_id: acc.product_id,
        title: acc.title,
        units_sold: acc.units_sold,
        units_refunded: acc.units_refunded,
        gross_revenue: minorToMoney(acc.gross_revenue_minor, currency) as Money,
        refunded_amount: minorToMoney(acc.refunded_amount_minor, currency) as Money,
        net_revenue: minorToMoney(netRevenueMinor, currency) as Money,
        cogs: acc.cogs_minor !== null ? (minorToMoney(acc.cogs_minor, currency) as Money) : null,
        gross_profit:
          grossProfitMinor !== null ? (minorToMoney(grossProfitMinor, currency) as Money) : null,
        gross_margin: grossMargin,
        return_rate: returnRate,
        est_fees_allocated:
          estFeesAllocatedMinor !== null
            ? (minorToMoney(estFeesAllocatedMinor, currency) as Money)
            : null,
        est_net_profit:
          estNetProfitMinor !== null
            ? (minorToMoney(estNetProfitMinor, currency) as Money)
            : null,
      };
    })
    .sort((a, b) => {
      const aN = moneyToMinor(a.net_revenue.amount);
      const bN = moneyToMinor(b.net_revenue.amount);
      return bN > aN ? 1 : bN < aN ? -1 : 0;
    });

  const totalCount = allRows.length;
  const planCap = plan === "free" ? FREE_PRODUCT_CAP : null;
  const rows = planCap !== null ? allRows.slice(0, planCap) : allRows;
  const hasAnyCogs = allRows.some((r) => r.cogs !== null);

  return {
    range,
    rows,
    truncated,
    history_clamped_to: null,
    has_any_cogs: hasAnyCogs,
    total_count: totalCount,
    plan_capped_to: planCap,
  };
}
