/**
 * Webhook HMAC verification. ALWAYS call before any side effect.
 *
 * Shopify signs webhook bodies with HMAC-SHA256 using the app secret and sends
 * the signature in the X-Shopify-Hmac-Sha256 header (base64).
 *
 * Reference: https://shopify.dev/docs/apps/build/webhooks/subscribe/verify
 */

import { verifyHmacSha256Base64 } from "../lib/crypto.js";
import { Unauthorized } from "../lib/errors.js";

export async function verifyWebhook(args: {
  rawBody: ArrayBuffer | Uint8Array;
  signatureHeader: string | null | undefined;
  apiSecret: string;
}): Promise<void> {
  if (!args.signatureHeader) throw Unauthorized("missing webhook signature");
  const body =
    args.rawBody instanceof Uint8Array ? args.rawBody : new Uint8Array(args.rawBody);
  const ok = await verifyHmacSha256Base64(args.apiSecret, body, args.signatureHeader);
  if (!ok) throw Unauthorized("invalid webhook signature");
}
