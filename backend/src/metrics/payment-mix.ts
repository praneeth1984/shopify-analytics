import type {
  PaymentMixResponse,
  PaymentMixRow,
  GatewayRate,
  Money,
  Plan,
  DateRange,
} from "@fbc/shared";
import type { OrderNode } from "./queries.js";
import { moneyToMinor, minorToMoney } from "../cogs/lookup.js";
import { getDefaultRate, getDisplayName } from "../payments/default-rates.js";

type GatewayAccumulator = {
  gateway: string;
  orders: number;
  revenue_minor: bigint;
};

export function computePaymentMix(
  orders: OrderNode[],
  currency: string,
  configuredRates: GatewayRate[],
  plan: Plan,
  range: DateRange,
  truncated: boolean,
): PaymentMixResponse {
  const byGateway = new Map<string, GatewayAccumulator>();
  let totalRevenueMinor = 0n;

  for (const order of orders) {
    const gateways = order.paymentGatewayNames ?? [];
    const raw = gateways[0] ?? "unknown";
    const gateway = raw.toLowerCase().replace(/\s+/g, "_");

    const grossMinor = moneyToMinor(order.totalPriceSet.shopMoney.amount);
    const refundedMinor = moneyToMinor(order.totalRefundedSet.shopMoney.amount);
    const netMinor = grossMinor - refundedMinor;
    totalRevenueMinor += netMinor;

    const acc = byGateway.get(gateway) ?? { gateway, orders: 0, revenue_minor: 0n };
    acc.orders += 1;
    acc.revenue_minor += netMinor;
    byGateway.set(gateway, acc);
  }

  const ratesMap = new Map<string, GatewayRate>(
    configuredRates.map((r) => [r.gateway.toLowerCase().replace(/\s+/g, "_"), r]),
  );
  const ratesConfigured = configuredRates.length > 0;

  const rows: PaymentMixRow[] = Array.from(byGateway.values())
    .map((acc): PaymentMixRow => {
      const rate = ratesMap.get(acc.gateway) ?? getDefaultRate(acc.gateway);
      const feeMinor =
        BigInt(Math.round(Number(acc.revenue_minor) * rate.pct)) +
        BigInt(rate.fixed_minor * acc.orders);
      const netMinor = acc.revenue_minor - feeMinor;
      const pctOfRevenue =
        totalRevenueMinor > 0n ? Number(acc.revenue_minor) / Number(totalRevenueMinor) : 0;

      return {
        gateway: acc.gateway,
        display_name: getDisplayName(acc.gateway),
        orders: acc.orders,
        revenue: minorToMoney(acc.revenue_minor, currency) as Money,
        est_fees: minorToMoney(feeMinor, currency) as Money,
        est_net: minorToMoney(netMinor, currency) as Money,
        pct_of_revenue: pctOfRevenue,
      };
    })
    .sort((a, b) => b.orders - a.orders);

  return {
    range,
    rows,
    rates_configured: ratesConfigured,
    truncated,
    history_clamped_to: null,
  };
}
