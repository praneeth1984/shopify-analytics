/**
 * Crypto helpers — Web Crypto only (no Node deps). Used for HMAC and JWT verify.
 */

const encoder = new TextEncoder();

export function base64urlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function base64Decode(input: string): Uint8Array {
  const bin = atob(input);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/** Constant-time byte comparison. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Compute HMAC-SHA256(secret, message), return base64. */
export async function hmacSha256Base64(secret: string, message: string | Uint8Array): Promise<string> {
  const key = await importHmacKey(secret);
  const data = typeof message === "string" ? encoder.encode(message) : message;
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return bytesToBase64(new Uint8Array(sig));
}

/** Verify base64-encoded HMAC-SHA256 signature in constant time. */
export async function verifyHmacSha256Base64(
  secret: string,
  message: string | Uint8Array,
  expectedBase64: string,
): Promise<boolean> {
  const key = await importHmacKey(secret);
  const data = typeof message === "string" ? encoder.encode(message) : message;
  let expected: Uint8Array;
  try {
    expected = base64Decode(expectedBase64);
  } catch {
    return false;
  }
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return timingSafeEqual(sig, expected);
}
