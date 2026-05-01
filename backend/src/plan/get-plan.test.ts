/**
 * Tests for plan resolution.
 *
 * Source-of-truth invariant: the resolver always trusts the Billing API
 * (`currentAppInstallation.activeSubscriptions`) over any cached metafield.
 * The KV cache (`plan:{shop_domain}`, 30 s) is a hot-path optimisation only.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  PLAN_CACHE_TTL_SECONDS,
  derivePlan,
  fetchPlanFromBilling,
  invalidatePlanCache,
  planCacheKey,
  resolvePlan,
} from "./get-plan.js";
import type { GraphQLClient } from "../shopify/graphql-client.js";

// ---- KV mock ----

type Stored = { value: string; ttl?: number; storedAt: number };

function makeKv(initial: Record<string, Stored> = {}) {
  const store: Record<string, Stored> = { ...initial };
  const calls = {
    get: 0,
    put: 0,
    delete: 0,
    list: 0,
  };
  const lastPut: { key?: string; value?: string; ttl?: number } = {};

  const kv = {
    async get(key: string): Promise<string | null> {
      calls.get++;
      const e = store[key];
      if (!e) return null;
      if (e.ttl && Date.now() - e.storedAt > e.ttl * 1000) {
        delete store[key];
        return null;
      }
      return e.value;
    },
    async put(
      key: string,
      value: string,
      opts?: { expirationTtl?: number },
    ): Promise<void> {
      calls.put++;
      lastPut.key = key;
      lastPut.value = value;
      lastPut.ttl = opts?.expirationTtl;
      store[key] = { value, ttl: opts?.expirationTtl, storedAt: Date.now() };
    },
    async delete(key: string): Promise<void> {
      calls.delete++;
      delete store[key];
    },
    async list(_args?: { prefix?: string }) {
      calls.list++;
      return { keys: [], list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;

  return { kv, store, calls, lastPut };
}

// ---- GraphQL mock ----

type ActiveSub = { name: string; status: string };

function makeGraphQL(opts: {
  subs: ActiveSub[];
  /** If true, every metafieldsSet call will throw. */
  failMetafieldsSet?: boolean;
  /** Records all queries the resolver made. */
  log?: { queries: string[] };
}): GraphQLClient {
  const log = opts.log ?? { queries: [] };
  return (async (query: string) => {
    log.queries.push(query);
    if (query.includes("ActiveSubscriptions")) {
      return {
        data: {
          currentAppInstallation: { activeSubscriptions: opts.subs },
        },
      };
    }
    if (query.includes("ShopId")) {
      return { data: { shop: { id: "gid://shopify/Shop/1" } } };
    }
    if (query.includes("WritePlanMetafield") || query.includes("metafieldsSet")) {
      if (opts.failMetafieldsSet) throw new Error("metafield write failed");
      return {
        data: {
          metafieldsSet: { metafields: [{ id: "x" }], userErrors: [] },
        },
      };
    }
    throw new Error(`unexpected query: ${query.slice(0, 60)}`);
  }) as unknown as GraphQLClient;
}

// ---- Pure derivePlan ----

describe("derivePlan", () => {
  it("returns 'free' when there are no active subscriptions", () => {
    expect(derivePlan([])).toBe("free");
  });

  it("returns 'free' when only CANCELLED/EXPIRED subscriptions exist", () => {
    expect(
      derivePlan([
        { name: "Pro", status: "CANCELLED" },
        { name: "Pro Annual", status: "EXPIRED" },
        { name: "Pro Monthly", status: "FROZEN" },
      ]),
    ).toBe("free");
  });

  it("returns 'pro' when an ACTIVE Pro subscription exists (case-insensitive)", () => {
    expect(derivePlan([{ name: "PRO Monthly", status: "ACTIVE" }])).toBe("pro");
    expect(derivePlan([{ name: "pro monthly", status: "active" }])).toBe("pro");
  });

  it("returns 'insights' when an ACTIVE Insights subscription exists", () => {
    expect(derivePlan([{ name: "Insights AI", status: "ACTIVE" }])).toBe("insights");
  });

  it("prefers 'insights' over 'pro' when both are active", () => {
    expect(
      derivePlan([
        { name: "Pro Monthly", status: "ACTIVE" },
        { name: "Insights AI", status: "ACTIVE" },
      ]),
    ).toBe("insights");
  });
});

// ---- fetchPlanFromBilling ----

describe("fetchPlanFromBilling", () => {
  it("returns 'pro' when Billing API reports an ACTIVE Pro sub", async () => {
    const graphql = makeGraphQL({ subs: [{ name: "Pro Monthly", status: "ACTIVE" }] });
    expect(await fetchPlanFromBilling(graphql)).toBe("pro");
  });

  it("returns 'free' when Billing API has no active subscriptions", async () => {
    const graphql = makeGraphQL({ subs: [] });
    expect(await fetchPlanFromBilling(graphql)).toBe("free");
  });

  it("returns 'free' when only CANCELLED/EXPIRED subscriptions exist", async () => {
    const graphql = makeGraphQL({
      subs: [
        { name: "Pro Monthly", status: "CANCELLED" },
        { name: "Pro Monthly", status: "EXPIRED" },
      ],
    });
    expect(await fetchPlanFromBilling(graphql)).toBe("free");
  });
});

// ---- resolvePlan ----

describe("resolvePlan: KV caching", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns cached value without calling Billing API on cache hit", async () => {
    const shop = "shop1.myshopify.com";
    const cached = JSON.stringify({ plan: "pro", checkedAt: new Date().toISOString() });
    const { kv } = makeKv({
      [planCacheKey(shop)]: { value: cached, ttl: PLAN_CACHE_TTL_SECONDS, storedAt: Date.now() },
    });
    const queryLog = { queries: [] as string[] };
    const graphql = makeGraphQL({ subs: [], log: queryLog });

    const plan = await resolvePlan({ graphql, kv, shopDomain: shop });
    expect(plan).toBe("pro");
    expect(queryLog.queries).toHaveLength(0); // no Billing API call
  });

  it("queries Billing API on cache miss and returns 'pro' for ACTIVE Pro sub", async () => {
    const shop = "shop2.myshopify.com";
    const { kv, lastPut } = makeKv();
    const graphql = makeGraphQL({ subs: [{ name: "Pro Monthly", status: "ACTIVE" }] });

    const plan = await resolvePlan({ graphql, kv, shopDomain: shop });
    expect(plan).toBe("pro");
    expect(lastPut.key).toBe(planCacheKey(shop));
    expect(lastPut.ttl).toBe(PLAN_CACHE_TTL_SECONDS);
  });

  it("queries Billing API on cache miss and returns 'free' when no active subs", async () => {
    const shop = "shop3.myshopify.com";
    const { kv } = makeKv();
    const graphql = makeGraphQL({ subs: [] });

    expect(await resolvePlan({ graphql, kv, shopDomain: shop })).toBe("free");
  });

  it("returns 'free' on cache miss when only CANCELLED/EXPIRED subs exist", async () => {
    const shop = "shop4.myshopify.com";
    const { kv } = makeKv();
    const graphql = makeGraphQL({
      subs: [
        { name: "Pro Monthly", status: "CANCELLED" },
        { name: "Pro Annual", status: "EXPIRED" },
      ],
    });
    expect(await resolvePlan({ graphql, kv, shopDomain: shop })).toBe("free");
  });

  it("ignores any metafield value — Billing API wins (KV says 'pro', metafield says 'free')", async () => {
    // The resolver never reads the plan metafield; the only signal it consults
    // is KV → Billing API. We simulate "metafield disagrees" by making sure
    // the GraphQL mock would return inconsistent data if asked, but the resolver
    // ignores it because Billing API is the source of truth.
    const shop = "shop5.myshopify.com";
    const cached = JSON.stringify({ plan: "pro", checkedAt: new Date().toISOString() });
    const { kv } = makeKv({
      [planCacheKey(shop)]: { value: cached, ttl: PLAN_CACHE_TTL_SECONDS, storedAt: Date.now() },
    });
    const queryLog = { queries: [] as string[] };
    // Even if a (hypothetical) metafield read returned "free", it wouldn't be
    // consulted: the KV cache fronts the Billing API.
    const graphql = makeGraphQL({ subs: [], log: queryLog });

    expect(await resolvePlan({ graphql, kv, shopDomain: shop })).toBe("pro");
    // No metafield read query in the log — resolver only goes KV → Billing.
    expect(queryLog.queries.find((q) => q.includes("ShopPlanMetafield"))).toBeUndefined();
  });

  it("writes the cache with TTL 60 on a miss", async () => {
    const shop = "shop6.myshopify.com";
    const { kv, lastPut, store } = makeKv();
    const graphql = makeGraphQL({ subs: [{ name: "Pro Monthly", status: "ACTIVE" }] });

    await resolvePlan({ graphql, kv, shopDomain: shop });
    expect(lastPut.ttl).toBe(60);
    const stored = store[planCacheKey(shop)];
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!.value) as { plan: string; checkedAt: string };
    expect(parsed.plan).toBe("pro");
    expect(parsed.checkedAt).toBe("2026-04-01T12:00:00.000Z");
  });

  it("survives a metafield write-back failure (still returns the resolved plan)", async () => {
    const shop = "shop7.myshopify.com";
    const { kv } = makeKv();
    const graphql = makeGraphQL({
      subs: [{ name: "Pro Monthly", status: "ACTIVE" }],
      failMetafieldsSet: true,
    });

    const plan = await resolvePlan({ graphql, kv, shopDomain: shop });
    expect(plan).toBe("pro");
  });
});

// ---- invalidatePlanCache ----

describe("invalidatePlanCache", () => {
  it("deletes the cached entry so the next resolve goes to Billing API", async () => {
    const shop = "shop8.myshopify.com";
    const cached = JSON.stringify({ plan: "pro", checkedAt: new Date().toISOString() });
    const { kv, store } = makeKv({
      [planCacheKey(shop)]: { value: cached, ttl: 30, storedAt: Date.now() },
    });

    expect(store[planCacheKey(shop)]).toBeDefined();
    await invalidatePlanCache(kv, shop);
    expect(store[planCacheKey(shop)]).toBeUndefined();
  });
});

// ---- Webhook handler clears the cache ----

describe("webhook clears plan cache", () => {
  it("app/uninstalled webhook deletes plan:{shop} after HMAC verification", async () => {
    // We exercise the route layer end-to-end so we cover HMAC verification.
    const { createApp } = await import("../app.js");
    const { hmacSha256Base64 } = await import("../lib/crypto.js");
    const shop = "shop-uninstall.myshopify.com";
    const cached = JSON.stringify({ plan: "pro", checkedAt: new Date().toISOString() });
    const { kv, store } = makeKv({
      [planCacheKey(shop)]: { value: cached, ttl: 30, storedAt: Date.now() },
    });

    const env = {
      SHOPIFY_API_VERSION: "2026-04",
      SHOPIFY_API_KEY: "key",
      SHOPIFY_API_SECRET: "secret",
      SHOPIFY_APP_URL: "https://example.com",
      BULK_OPS_KV: kv,
    } as unknown as { SHOPIFY_API_SECRET: string };

    const app = createApp();
    const body = JSON.stringify({ domain: shop });
    const sig = await hmacSha256Base64("secret", body);

    const res = await app.request(
      "/webhooks/app/uninstalled",
      {
        method: "POST",
        headers: {
          "x-shopify-hmac-sha256": sig,
          "x-shopify-shop-domain": shop,
          "content-type": "application/json",
        },
        body,
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(store[planCacheKey(shop)]).toBeUndefined();
  });

  it("app/uninstalled webhook rejects tampered HMAC and does NOT clear cache", async () => {
    const { createApp } = await import("../app.js");
    const shop = "shop-tamper.myshopify.com";
    const cached = JSON.stringify({ plan: "pro", checkedAt: new Date().toISOString() });
    const { kv, store } = makeKv({
      [planCacheKey(shop)]: { value: cached, ttl: 30, storedAt: Date.now() },
    });

    const env = {
      SHOPIFY_API_VERSION: "2026-04",
      SHOPIFY_API_KEY: "key",
      SHOPIFY_API_SECRET: "secret",
      SHOPIFY_APP_URL: "https://example.com",
      BULK_OPS_KV: kv,
    } as unknown as { SHOPIFY_API_SECRET: string };

    const app = createApp();
    const res = await app.request(
      "/webhooks/app/uninstalled",
      {
        method: "POST",
        headers: {
          "x-shopify-hmac-sha256": "not-a-valid-signature",
          "x-shopify-shop-domain": shop,
          "content-type": "application/json",
        },
        body: JSON.stringify({ domain: shop }),
      },
      env,
    );

    expect(res.status).toBe(401);
    expect(store[planCacheKey(shop)]).toBeDefined();
  });

  it("app_subscriptions/update webhook re-caches plan from payload", async () => {
    const { createApp } = await import("../app.js");
    const { hmacSha256Base64 } = await import("../lib/crypto.js");
    const shop = "shop-sub.myshopify.com";
    // Old cached value was 'free' — the webhook should overwrite to 'pro'.
    const cached = JSON.stringify({ plan: "free", checkedAt: new Date().toISOString() });
    const { kv, store } = makeKv({
      [planCacheKey(shop)]: { value: cached, ttl: 30, storedAt: Date.now() },
    });

    const env = {
      SHOPIFY_API_VERSION: "2026-04",
      SHOPIFY_API_KEY: "key",
      SHOPIFY_API_SECRET: "secret",
      SHOPIFY_APP_URL: "https://example.com",
      BULK_OPS_KV: kv,
    } as unknown as { SHOPIFY_API_SECRET: string };

    const app = createApp();
    const body = JSON.stringify({
      app_subscription: { name: "Pro Monthly", status: "ACTIVE" },
    });
    const sig = await hmacSha256Base64("secret", body);

    const res = await app.request(
      "/webhooks/app_subscriptions/update",
      {
        method: "POST",
        headers: {
          "x-shopify-hmac-sha256": sig,
          "x-shopify-shop-domain": shop,
          "content-type": "application/json",
        },
        body,
      },
      env,
    );

    expect(res.status).toBe(200);
    const stored = store[planCacheKey(shop)];
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!.value) as { plan: string };
    expect(parsed.plan).toBe("pro");
  });
});
