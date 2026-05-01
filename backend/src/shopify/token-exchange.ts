/**
 * OAuth 2.0 Token Exchange — convert a verified embedded session token into a
 * short-lived Admin API access token. This is the keystone of our stateless
 * design: we never store access tokens; we mint a fresh one per request.
 *
 * Reference: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange
 */

import { Upstream, Unauthorized } from "../lib/errors.js";

export type TokenType = "online" | "offline";

const REQUESTED_TOKEN_TYPE: Record<TokenType, string> = {
  online: "urn:shopify:params:oauth:token-type:online-access-token",
  offline: "urn:shopify:params:oauth:token-type:offline-access-token",
};

export type AccessToken = {
  access_token: string;
  scope: string;
  expires_in?: number;
  associated_user_scope?: string;
  associated_user?: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    account_owner: boolean;
    locale: string;
    collaborator: boolean;
  };
};

export async function exchangeToken(args: {
  shopDomain: string;
  sessionToken: string;
  apiKey: string;
  apiSecret: string;
  tokenType?: TokenType;
}): Promise<AccessToken> {
  const tokenType = args.tokenType ?? "online";
  const url = `https://${args.shopDomain}/admin/oauth/access_token`;
  const body = new URLSearchParams({
    client_id: args.apiKey,
    client_secret: args.apiSecret,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: args.sessionToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    requested_token_type: REQUESTED_TOKEN_TYPE[tokenType],
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (res.status === 401 || res.status === 403) {
    throw Unauthorized("token exchange rejected");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Upstream("token exchange failed", `${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as AccessToken;
  if (!json.access_token) throw Upstream("token exchange missing access_token");
  return json;
}
