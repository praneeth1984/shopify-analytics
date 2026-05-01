/**
 * PII- and secret-redacting logger.
 *
 * Never log: access tokens, customer emails/names/addresses, full order payloads.
 * The logger redacts known sensitive keys at any depth before serializing.
 */

const SENSITIVE_KEYS = new Set([
  "access_token",
  "accessToken",
  "client_secret",
  "clientSecret",
  "shopify_api_secret",
  "authorization",
  "subject_token",
  "session_token",
  "sessionToken",
  "email",
  "phone",
  "first_name",
  "last_name",
  "address1",
  "address2",
  "billing_address",
  "shipping_address",
  "x-shopify-access-token",
  "x-shopify-hmac-sha256",
  // Cost-of-goods values are merchant-confidential pricing data. Redact
  // anywhere in the structured-log payload.
  "cost",
  "cogs",
  "default_margin_pct",
  "defaultmarginpct",
  "cogsentry",
  "cogs_entry",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 256 ? value.slice(0, 256) + "…" : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = "[redacted]";
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, message: string, fields?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  };
  // Cloudflare Workers stream stdout/stderr to Logpush / Workers Analytics.
  if (level === "error") {
    console.error(JSON.stringify(payload));
  } else if (level === "warn") {
    console.warn(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
