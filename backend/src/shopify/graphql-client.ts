/**
 * Thin GraphQL Admin API client. Adds shop domain + access token to fetch.
 *
 * Always returns typed data or throws. Honors Shopify's GraphQL cost extensions
 * by surfacing throttle errors so the caller can back off intelligently.
 */

import { Upstream, BadRequest } from "../lib/errors.js";

export type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
};

export type GraphQLCost = NonNullable<NonNullable<GraphQLResponse<unknown>["extensions"]>["cost"]>;

export type GraphQLClient = <T>(
  query: string,
  variables?: Record<string, unknown>,
) => Promise<{ data: T; cost?: GraphQLCost }>;

export function makeGraphQLClient(args: {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
  verbose?: boolean;
}): GraphQLClient {
  const endpoint = `https://${args.shopDomain}/admin/api/${args.apiVersion}/graphql.json`;
  return async function graphql<T>(query: string, variables?: Record<string, unknown>) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-access-token": args.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const detail = `${res.status}: ${text.slice(0, 200)}`;
      // In development, surface the raw Shopify response so errors are diagnosable.
      throw Upstream(args.verbose ? detail : "graphql request failed", detail);
    }

    const body = (await res.json()) as GraphQLResponse<T>;
    if (body.errors && body.errors.length > 0) {
      const code = body.errors[0]?.extensions?.code;
      if (code === "THROTTLED") {
        throw Upstream("Shopify rate limit reached, retry shortly", "THROTTLED");
      }
      const detail = body.errors.map((e) => e.message).join("; ");
      throw BadRequest(args.verbose ? detail : "GraphQL error", detail);
    }
    if (!body.data) throw Upstream("graphql response missing data");
    return { data: body.data, cost: body.extensions?.cost };
  };
}
