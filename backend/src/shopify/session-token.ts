/**
 * Session token (JWT) verification.
 *
 * Embedded apps receive a session token from App Bridge with each request. The
 * token is signed with the app's API secret using HS256. Verifying it proves the
 * request comes from a real merchant via Shopify's admin, without any database.
 *
 * Reference: https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens
 */

import { base64urlDecode, hmacSha256Base64, timingSafeEqual, base64Decode } from "../lib/crypto.js";
import { isValidShopDomain } from "./shop-domain.js";
import { Unauthorized } from "../lib/errors.js";

export type SessionTokenClaims = {
  iss: string; // shop's admin URL
  dest: string; // shop URL (used to derive shop domain)
  aud: string; // app's API key
  sub: string; // user ID (numeric string)
  exp: number; // unix seconds
  nbf: number;
  iat: number;
  jti: string;
  sid: string;
  /** Derived: the *.myshopify.com domain for this session. */
  shopDomain: string;
};

const encoder = new TextEncoder();

function safeDecodeJson(b64: string): unknown {
  const bytes = base64urlDecode(b64);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function deriveShopDomain(dest: string): string | null {
  try {
    const url = new URL(dest);
    const host = url.hostname.toLowerCase();
    return host;
  } catch {
    return null;
  }
}

/**
 * Verify the JWT signature and standard claims, then return the claims.
 * Throws Unauthorized() on any failure. Never logs the token.
 */
export async function verifySessionToken(
  token: string,
  apiKey: string,
  apiSecret: string,
): Promise<SessionTokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw Unauthorized("malformed session token");
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  // Header check.
  let header: { alg?: string; typ?: string };
  try {
    header = safeDecodeJson(headerB64) as { alg?: string; typ?: string };
  } catch {
    throw Unauthorized("invalid token header");
  }
  if (header.alg !== "HS256") throw Unauthorized("unsupported alg");

  // Signature check.
  const signingInput = `${headerB64}.${payloadB64}`;
  const expected = await hmacSha256Base64(apiSecret, signingInput);
  // JWT signatures use base64url; convert before compare.
  const sigBytes = base64urlDecode(signatureB64);
  const expectedBytes = base64Decode(expected);
  if (!timingSafeEqual(sigBytes, expectedBytes)) throw Unauthorized("bad signature");

  // Claims check.
  let claims: Record<string, unknown>;
  try {
    claims = safeDecodeJson(payloadB64) as Record<string, unknown>;
  } catch {
    throw Unauthorized("invalid claims");
  }

  const now = Math.floor(Date.now() / 1000);
  const skew = 5;
  const exp = Number(claims.exp);
  const nbf = Number(claims.nbf);
  if (!Number.isFinite(exp) || exp < now - skew) throw Unauthorized("token expired");
  if (Number.isFinite(nbf) && nbf > now + skew) throw Unauthorized("token not yet valid");
  if (claims.aud !== apiKey) throw Unauthorized("audience mismatch");

  const dest = String(claims.dest ?? "");
  const shopDomain = deriveShopDomain(dest);
  if (!shopDomain || !isValidShopDomain(shopDomain)) throw Unauthorized("invalid dest claim");

  return {
    iss: String(claims.iss ?? ""),
    dest,
    aud: String(claims.aud ?? ""),
    sub: String(claims.sub ?? ""),
    exp,
    nbf: Number.isFinite(nbf) ? nbf : 0,
    iat: Number(claims.iat ?? 0),
    jti: String(claims.jti ?? ""),
    sid: String(claims.sid ?? ""),
    shopDomain,
  };
}

/** Extract a Bearer token from the Authorization header. */
export function bearerToken(authorizationHeader: string | null | undefined): string {
  if (!authorizationHeader) throw Unauthorized("missing Authorization header");
  const m = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
  if (!m || !m[1]) throw Unauthorized("malformed Authorization header");
  return m[1];
}

// Helper to silence unused-import warning when this file is the entry of a unit test.
export const __encoderForTests = encoder;
