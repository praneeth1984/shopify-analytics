/**
 * Classic OAuth install flow.
 *
 * For embedded apps using Token Exchange this flow is rarely used at runtime —
 * Shopify's "managed install" handles it for us. We keep these helpers for the
 * fallback case where a merchant lands on an installation URL directly.
 *
 * Reference: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
 */

import { isValidShopDomain } from "./shop-domain.js";
import { verifyHmacSha256Base64, hmacSha256Base64, bytesToBase64 } from "../lib/crypto.js";
import { BadRequest, Unauthorized } from "../lib/errors.js";

export function installRedirectUrl(args: {
  shopDomain: string;
  apiKey: string;
  scopes: string;
  redirectUri: string;
  state: string;
}): string {
  if (!isValidShopDomain(args.shopDomain)) throw BadRequest("invalid shop");
  const url = new URL(`https://${args.shopDomain}/admin/oauth/authorize`);
  url.searchParams.set("client_id", args.apiKey);
  url.searchParams.set("scope", args.scopes);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state);
  url.searchParams.set("grant_options[]", "");
  return url.toString();
}

/**
 * Verify the HMAC on an OAuth redirect from Shopify.
 * Per docs: build a query string of all params except `hmac` and `signature`,
 * sorted alphabetically, then HMAC-SHA256 with the app secret. Compare hex.
 */
export async function verifyOAuthCallback(args: {
  query: URLSearchParams;
  apiSecret: string;
}): Promise<void> {
  const hmac = args.query.get("hmac");
  if (!hmac) throw Unauthorized("missing hmac");

  const params: [string, string][] = [];
  for (const [k, v] of args.query.entries()) {
    if (k === "hmac" || k === "signature") continue;
    params.push([k, v]);
  }
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const message = params.map(([k, v]) => `${k}=${v}`).join("&");

  // Shopify uses hex for OAuth callback HMAC, base64 for webhooks. Compute hex.
  const expectedHex = await hmacSha256Hex(args.apiSecret, message);
  // Constant-time-ish hex compare.
  if (expectedHex.length !== hmac.length) throw Unauthorized("bad hmac");
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ hmac.charCodeAt(i);
  }
  if (diff !== 0) throw Unauthorized("bad hmac");
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  return hex;
}

/** Exchange the `code` from the OAuth callback for an offline access token. */
export async function exchangeCodeForToken(args: {
  shopDomain: string;
  code: string;
  apiKey: string;
  apiSecret: string;
}): Promise<{ access_token: string; scope: string }> {
  const res = await fetch(`https://${args.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: args.apiKey,
      client_secret: args.apiSecret,
      code: args.code,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`code exchange failed ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as { access_token: string; scope: string };
}

// Helper used elsewhere; re-export so import surface stays small.
export { verifyHmacSha256Base64, hmacSha256Base64, bytesToBase64 };
