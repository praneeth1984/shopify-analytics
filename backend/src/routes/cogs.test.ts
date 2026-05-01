/**
 * Integration tests for COGS export + import routes.
 *
 * The cogs router is mounted with a test-only auth override that injects a
 * pre-configured GraphQL mock onto the Hono context, bypassing real Shopify
 * session-token verification. The mock keeps an in-memory entries array and
 * responds to ReadCogs / SetCogsMetafields / DeleteCogsMetafields so we
 * exercise the real route + store layer end-to-end.
 */

import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { cogsRoutes } from "./cogs.js";
import type { Env } from "../env.js";
import type { CogsEntry, CogsMeta } from "@fbc/shared";
import type { GraphQLClient } from "../shopify/graphql-client.js";

// ---- Test scaffolding ----

type ShopState = {
  entries: CogsEntry[];
  meta: CogsMeta;
  shopCurrency: string;
};

function emptyMeta(currency: string): CogsMeta {
  return {
    schemaVersion: 1,
    totalCount: 0,
    shardCount: 0,
    defaultMarginPct: 0,
    lastWriteAt: "2026-04-01T12:00:00.000Z",
    currency_code: currency,
  };
}

function makeShopState(currency = "USD", entries: CogsEntry[] = []): ShopState {
  return {
    entries,
    meta: { ...emptyMeta(currency), totalCount: entries.length },
    shopCurrency: currency,
  };
}

/**
 * In-memory GraphQL mock that round-trips through the metafield read/write
 * flow used by `cogs/store.ts`.
 */
function makeMockGraphQL(state: ShopState, plan: "free" | "pro" = "free"): GraphQLClient {
  return (async (query: string, variables?: Record<string, unknown>) => {
    if (query.includes("ShopCurrency") || query.includes("currencyCode")) {
      return { data: { shop: { currencyCode: state.shopCurrency } } };
    }
    if (query.includes("ActiveSubscriptions")) {
      const subs =
        plan === "pro"
          ? [{ name: "Pro Monthly", status: "ACTIVE" }]
          : [];
      return {
        data: { currentAppInstallation: { activeSubscriptions: subs } },
      };
    }
    if (query.includes("ShopId")) {
      return { data: { shop: { id: "gid://shopify/Shop/1" } } };
    }
    if (query.includes("WritePlanMetafield")) {
      return {
        data: { metafieldsSet: { metafields: [{ id: "x" }], userErrors: [] } },
      };
    }
    if (query.includes("ReadCogs")) {
      const nodes = [
        {
          id: "gid://shopify/Metafield/meta",
          key: "cogs_meta",
          value: JSON.stringify(state.meta),
          type: "json",
          updatedAt: state.meta.lastWriteAt,
        },
      ];
      if (state.entries.length > 0) {
        nodes.push({
          id: "gid://shopify/Metafield/idx",
          key: "cogs_index",
          value: JSON.stringify({
            version: 1,
            count: state.entries.length,
            updatedAt: state.meta.lastWriteAt,
            entries: state.entries,
          }),
          type: "json",
          updatedAt: state.meta.lastWriteAt,
        });
      }
      return {
        data: {
          shop: { id: "gid://shopify/Shop/1", metafields: { nodes } },
        },
      };
    }
    if (query.includes("SetCogsMetafields") || query.includes("metafieldsSet")) {
      // Reflect the writes back into our in-memory state.
      const inputs = (variables?.metafields as Array<{
        key: string;
        value: string;
      }>) ?? [];
      for (const i of inputs) {
        if (i.key === "cogs_meta") {
          state.meta = JSON.parse(i.value) as CogsMeta;
        } else if (i.key === "cogs_index") {
          const blob = JSON.parse(i.value) as { entries: CogsEntry[] };
          state.entries = blob.entries;
        }
      }
      return {
        data: {
          metafieldsSet: { metafields: [{ id: "x" }], userErrors: [] },
        },
      };
    }
    if (query.includes("DeleteCogsMetafields")) {
      return { data: { metafieldsDelete: { deletedMetafields: [] } } };
    }
    throw new Error(`unexpected query: ${query.slice(0, 80)}`);
  }) as unknown as GraphQLClient;
}

/** KV mock matching the subset our route layer touches. */
function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async list() {
      return { keys: [], list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
}

function buildTestApp(state: ShopState, plan: "free" | "pro" = "free") {
  const graphql = makeMockGraphQL(state, plan);
  const kv = makeKv();
  const app = new Hono<{ Bindings: Env }>();
  // Bypass real session-token auth in tests by injecting context vars directly.
  const fakeAuth = vi.fn(async (c, next) => {
    c.set("shopDomain", "test-shop.myshopify.com");
    c.set("userId", "1");
    c.set("accessToken", "test");
    c.set("graphql", graphql);
    await next();
  });
  app.route("/api/cogs", cogsRoutes(fakeAuth as never));

  const env = {
    SHOPIFY_API_VERSION: "2026-04",
    SHOPIFY_API_KEY: "key",
    SHOPIFY_API_SECRET: "secret",
    SHOPIFY_APP_URL: "https://example.com",
    BULK_OPS_KV: kv,
  } as unknown as Env;

  return { app, env, state };
}

function makeEntry(n: number, costAmount = "1.00"): CogsEntry {
  return {
    variantId: `gid://shopify/ProductVariant/${n}`,
    productId: `gid://shopify/Product/${n}`,
    sku: `SKU-${n}`,
    title: `Variant ${n}`,
    cost: { amount: costAmount, currency_code: "USD" },
    updatedAt: "2026-04-01T12:00:00.000Z",
  };
}

// ---- Tests ----

describe("GET /api/cogs/export", () => {
  it("returns CSV with correct headers and content-type", async () => {
    const state = makeShopState("USD", [makeEntry(1, "2.50"), makeEntry(2, "3.75")]);
    const { app, env } = buildTestApp(state);
    const res = await app.request("/api/cogs/export", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    const cd = res.headers.get("content-disposition") ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toContain("firstbridge-cogs-test-shop-");
    const csv = await res.text();
    expect(csv).toContain("variant_id,sku,product_id,title,cost_amount,cost_currency,updated_at");
    expect(csv).toContain("gid://shopify/ProductVariant/1");
    expect(csv).toContain("2.50");
  });
});

describe("POST /api/cogs/import: round-trip", () => {
  it("export round-trips through import (count + values preserved)", async () => {
    const original = [makeEntry(1, "2.00"), makeEntry(2, "3.50"), makeEntry(3, "4.25")];
    const exportState = makeShopState("USD", original);
    const { app: exportApp, env: exportEnv } = buildTestApp(exportState);

    const exportRes = await exportApp.request("/api/cogs/export", {}, exportEnv);
    const csv = await exportRes.text();

    // Now import the CSV into a fresh shop with no existing entries.
    const importState = makeShopState("USD", []);
    const { app: importApp, env: importEnv } = buildTestApp(importState, "pro");

    const importRes = await importApp.request(
      "/api/cogs/import",
      {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: csv,
      },
      importEnv,
    );
    expect(importRes.status).toBe(200);
    const body = (await importRes.json()) as {
      imported: number;
      skipped: unknown[];
      meta: CogsMeta;
    };
    expect(body.imported).toBe(3);
    expect(body.skipped).toHaveLength(0);
    expect(body.meta.totalCount).toBe(3);
    expect(importState.entries).toHaveLength(3);
    const ids = importState.entries.map((e) => e.variantId).sort();
    expect(ids).toEqual([
      "gid://shopify/ProductVariant/1",
      "gid://shopify/ProductVariant/2",
      "gid://shopify/ProductVariant/3",
    ]);
    const e1 = importState.entries.find((e) => e.variantId.endsWith("/1"));
    expect(e1?.cost.amount).toBe("2.00");
  });
});

describe("POST /api/cogs/import: free-tier cap", () => {
  it("respects Free 20-cap (partial success response)", async () => {
    // 18 already saved, importing 5 more — only 2 fit.
    const existing = Array.from({ length: 18 }, (_, i) => makeEntry(i + 1));
    const state = makeShopState("USD", existing);
    const { app, env } = buildTestApp(state, "free");

    const newRows = [19, 20, 21, 22, 23].map((n) => makeEntry(n));
    const csvLines = [
      "variant_id,sku,product_id,title,cost_amount,cost_currency,updated_at",
      ...newRows.map(
        (r) =>
          `${r.variantId},${r.sku ?? ""},${r.productId},${r.title},${r.cost.amount},${r.cost.currency_code},${r.updatedAt}`,
      ),
    ];
    const csv = csvLines.join("\n");

    const res = await app.request(
      "/api/cogs/import",
      {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: csv,
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      imported: number;
      skipped: Array<{ reason: string; variant_id: string }>;
      cap: number | null;
    };
    expect(body.imported).toBe(2);
    expect(body.skipped).toHaveLength(3);
    expect(body.skipped.every((s) => s.reason === "free_cap")).toBe(true);
    expect(body.cap).toBe(20);
    // The first two new variants made it.
    expect(body.skipped.map((s) => s.variant_id)).toEqual([
      "gid://shopify/ProductVariant/21",
      "gid://shopify/ProductVariant/22",
      "gid://shopify/ProductVariant/23",
    ]);
  });
});

describe("POST /api/cogs/import: currency mismatch", () => {
  it("rejects rows with a currency mismatch and lists them in the response", async () => {
    const state = makeShopState("USD", []);
    const { app, env } = buildTestApp(state, "pro");

    const csv = [
      "variant_id,sku,product_id,title,cost_amount,cost_currency,updated_at",
      "gid://shopify/ProductVariant/1,SKU-1,gid://shopify/Product/1,A,1.00,USD,2026-04-01T00:00:00Z",
      "gid://shopify/ProductVariant/2,SKU-2,gid://shopify/Product/2,B,2.00,EUR,2026-04-01T00:00:00Z",
      "gid://shopify/ProductVariant/3,SKU-3,gid://shopify/Product/3,C,3.00,USD,2026-04-01T00:00:00Z",
    ].join("\n");

    const res = await app.request(
      "/api/cogs/import",
      {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: csv,
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      imported: number;
      skipped: Array<{ reason: string; variant_id: string }>;
    };
    expect(body.imported).toBe(2);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0]?.reason).toBe("currency_mismatch");
    expect(body.skipped[0]?.variant_id).toBe("gid://shopify/ProductVariant/2");
  });

  it("skips rows with invalid variant ids", async () => {
    const state = makeShopState("USD", []);
    const { app, env } = buildTestApp(state, "pro");

    const csv = [
      "variant_id,sku,product_id,title,cost_amount,cost_currency,updated_at",
      "not-a-gid,SKU,gid://shopify/Product/1,A,1.00,USD,2026-04-01T00:00:00Z",
      "gid://shopify/ProductVariant/2,SKU,gid://shopify/Product/2,B,2.00,USD,2026-04-01T00:00:00Z",
    ].join("\n");

    const res = await app.request(
      "/api/cogs/import",
      {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: csv,
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      imported: number;
      skipped: Array<{ reason: string }>;
    };
    expect(body.imported).toBe(1);
    expect(body.skipped[0]?.reason).toBe("invalid_variant_id");
  });
});

describe("POST /api/cogs/import: idempotency + merge", () => {
  it("importing the same CSV twice yields the same final state", async () => {
    const state = makeShopState("USD", []);
    const { app, env } = buildTestApp(state, "pro");
    const csv = [
      "variant_id,sku,product_id,title,cost_amount,cost_currency,updated_at",
      "gid://shopify/ProductVariant/1,SKU-1,gid://shopify/Product/1,A,1.00,USD,2026-04-01T00:00:00Z",
      "gid://shopify/ProductVariant/2,SKU-2,gid://shopify/Product/2,B,2.00,USD,2026-04-01T00:00:00Z",
    ].join("\n");

    const first = await app.request(
      "/api/cogs/import",
      { method: "POST", headers: { "content-type": "text/csv" }, body: csv },
      env,
    );
    expect(first.status).toBe(200);
    const after1 = state.entries.map((e) => e.variantId).sort();

    const second = await app.request(
      "/api/cogs/import",
      { method: "POST", headers: { "content-type": "text/csv" }, body: csv },
      env,
    );
    expect(second.status).toBe(200);
    const after2 = state.entries.map((e) => e.variantId).sort();

    expect(after2).toEqual(after1);
    expect(state.entries).toHaveLength(2);
    // Cost values match the CSV (idempotent: re-applying the same data is a no-op).
    const e1 = state.entries.find((e) => e.variantId.endsWith("/1"));
    expect(e1?.cost.amount).toBe("1.00");
  });

  it("merges rather than replaces — variants not in the CSV are preserved", async () => {
    const existing = [makeEntry(1, "1.00"), makeEntry(2, "2.00")];
    const state = makeShopState("USD", existing);
    const { app, env } = buildTestApp(state, "pro");

    // Import only updates variant 2 and adds variant 3. Variant 1 should remain untouched.
    const csv = [
      "variant_id,sku,product_id,title,cost_amount,cost_currency,updated_at",
      "gid://shopify/ProductVariant/2,SKU-2,gid://shopify/Product/2,B-updated,9.99,USD,2026-04-01T00:00:00Z",
      "gid://shopify/ProductVariant/3,SKU-3,gid://shopify/Product/3,C,3.00,USD,2026-04-01T00:00:00Z",
    ].join("\n");

    const res = await app.request(
      "/api/cogs/import",
      { method: "POST", headers: { "content-type": "text/csv" }, body: csv },
      env,
    );
    expect(res.status).toBe(200);
    expect(state.entries).toHaveLength(3);
    const e1 = state.entries.find((e) => e.variantId.endsWith("/1"));
    expect(e1?.cost.amount).toBe("1.00"); // untouched
    const e2 = state.entries.find((e) => e.variantId.endsWith("/2"));
    expect(e2?.cost.amount).toBe("9.99"); // updated
    const e3 = state.entries.find((e) => e.variantId.endsWith("/3"));
    expect(e3?.cost.amount).toBe("3.00"); // added
  });
});
