/**
 * Authentication middleware for /api/* routes.
 *
 * Each request from the embedded app carries a Shopify session token (JWT) in
 * the Authorization header. We:
 *   1. Verify the JWT (HS256, signed with our app secret).
 *   2. Token-exchange it for a short-lived Admin API access token.
 *   3. Attach a ready-to-use GraphQL client to the Hono context.
 *
 * No tokens are persisted. Each request mints a fresh access token.
 */

import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../env.js";
import { bearerToken, verifySessionToken } from "../shopify/session-token.js";
import { exchangeToken } from "../shopify/token-exchange.js";
import { makeGraphQLClient, type GraphQLClient } from "../shopify/graphql-client.js";

export type AuthVars = {
  shopDomain: string;
  userId: string;
  accessToken: string;
  graphql: GraphQLClient;
};

declare module "hono" {
  interface ContextVariableMap extends AuthVars {}
}

export const requireSessionToken = (): MiddlewareHandler<{ Bindings: Env }> => {
  return async (c: Context<{ Bindings: Env }>, next) => {
    const env = c.env;
    const token = bearerToken(c.req.header("authorization"));
    const claims = await verifySessionToken(token, env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);
    const access = await exchangeToken({
      shopDomain: claims.shopDomain,
      sessionToken: token,
      apiKey: env.SHOPIFY_API_KEY,
      apiSecret: env.SHOPIFY_API_SECRET,
      tokenType: "online",
    });
    c.set("shopDomain", claims.shopDomain);
    c.set("userId", claims.sub);
    c.set("accessToken", access.access_token);
    c.set(
      "graphql",
      makeGraphQLClient({
        shopDomain: claims.shopDomain,
        accessToken: access.access_token,
        apiVersion: env.SHOPIFY_API_VERSION,
        verbose: env.ENVIRONMENT === "development",
      }),
    );
    await next();
  };
};
