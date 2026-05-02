import type { GatewayRate } from "@fbc/shared";

const DEFAULT_RATES: GatewayRate[] = [
  { gateway: "shopify_payments", pct: 0.029, fixed_minor: 30 },
  { gateway: "paypal", pct: 0.0349, fixed_minor: 49 },
  { gateway: "stripe", pct: 0.029, fixed_minor: 30 },
  { gateway: "manual", pct: 0, fixed_minor: 0 },
];

const DISPLAY_NAMES: Record<string, string> = {
  shopify_payments: "Shopify Payments",
  paypal: "PayPal",
  stripe: "Stripe",
  manual: "Manual",
  bogus: "Bogus Gateway (Test)",
};

function normalizeGateway(gateway: string): string {
  return gateway.toLowerCase().replace(/\s+/g, "_");
}

export function getDefaultRate(gateway: string): GatewayRate {
  const key = normalizeGateway(gateway);
  return DEFAULT_RATES.find((r) => r.gateway === key) ?? { gateway: key, pct: 0, fixed_minor: 0 };
}

export function getDisplayName(gateway: string): string {
  const key = normalizeGateway(gateway);
  return DISPLAY_NAMES[key] ?? gateway.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
