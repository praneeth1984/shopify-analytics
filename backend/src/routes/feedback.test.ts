/**
 * Integration tests for the feedback hub routes (F42).
 *
 * Each test mounts `feedbackRoutes` with a fake auth override that injects
 * the requesting shop and a mocked Billing-API GraphQL client. D1 is
 * replaced with a tiny in-memory implementation that supports the small
 * subset of `prepare(...).bind(...).all/first/run/batch` calls the route
 * actually makes.
 */

import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { feedbackRoutes } from "./feedback.js";
import type { Env } from "../env.js";
import { HttpError } from "../lib/errors.js";
import type { GraphQLClient } from "../shopify/graphql-client.js";
import type { D1Database } from "@cloudflare/workers-types";

// ---- In-memory D1 mock ----

type FeedbackRowData = {
  id: string;
  type: string;
  title: string;
  description: string;
  page: string | null;
  severity: string | null;
  frequency: string | null;
  shop_domain: string;
  plan: string;
  status: string;
  upvotes: number;
  submitted_at: string;
  shipped_at: string | null;
};

type UpvoteRowData = {
  feedback_id: string;
  shop_domain: string;
  created_at: string;
};

type DbState = {
  feedback: FeedbackRowData[];
  upvotes: UpvoteRowData[];
};

function makeDb(): { db: D1Database; state: DbState } {
  const state: DbState = { feedback: [], upvotes: [] };

  function exec(sql: string, params: unknown[]): {
    results: unknown[];
    success: boolean;
  } {
    const lower = sql.trim().toLowerCase();
    // ---- COUNT(*) for rate limit ----
    if (lower.startsWith("select count(*) as cnt from feedback")) {
      const [shop, since] = params as [string, string];
      const cnt = state.feedback.filter(
        (r) => r.shop_domain === shop && r.submitted_at > since,
      ).length;
      return { results: [{ cnt }], success: true };
    }
    // ---- public listing ----
    if (lower.startsWith("select id, type, title, status, upvotes, submitted_at")) {
      const rows = state.feedback
        .filter((r) =>
          ["open", "planned", "shipped"].includes(r.status),
        )
        .sort(
          (a, b) =>
            b.upvotes - a.upvotes ||
            b.submitted_at.localeCompare(a.submitted_at),
        )
        .map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          status: r.status,
          upvotes: r.upvotes,
          submitted_at: r.submitted_at,
        }));
      return { results: rows, success: true };
    }
    // ---- per-shop upvote flags ----
    if (lower.startsWith("select feedback_id from upvotes where shop_domain")) {
      const [shop] = params as [string];
      const rows = state.upvotes
        .filter((u) => u.shop_domain === shop)
        .map((u) => ({ feedback_id: u.feedback_id }));
      return { results: rows, success: true };
    }
    // ---- existence + status check ----
    if (lower.startsWith("select id, status from feedback where id")) {
      const [id] = params as [string];
      const r = state.feedback.find((f) => f.id === id);
      return { results: r ? [{ id: r.id, status: r.status }] : [], success: true };
    }
    if (lower.startsWith("select 1 as found from upvotes")) {
      const [id, shop] = params as [string, string];
      const r = state.upvotes.find(
        (u) => u.feedback_id === id && u.shop_domain === shop,
      );
      return { results: r ? [{ found: 1 }] : [], success: true };
    }
    if (lower.startsWith("select upvotes from feedback where id")) {
      const [id] = params as [string];
      const r = state.feedback.find((f) => f.id === id);
      return { results: r ? [{ upvotes: r.upvotes }] : [], success: true };
    }
    // ---- INSERT feedback ----
    if (lower.startsWith("insert into feedback")) {
      const [
        id, type, title, description, page, severity, frequency,
        shop_domain, plan, submitted_at,
      ] = params as [
        string, string, string, string, string | null, string | null,
        string | null, string, string, string,
      ];
      state.feedback.push({
        id, type, title, description, page, severity, frequency,
        shop_domain, plan, status: "open", upvotes: 0,
        submitted_at, shipped_at: null,
      });
      return { results: [], success: true };
    }
    // ---- INSERT upvotes ----
    if (lower.startsWith("insert into upvotes")) {
      const [feedback_id, shop_domain, created_at] = params as [string, string, string];
      state.upvotes.push({ feedback_id, shop_domain, created_at });
      return { results: [], success: true };
    }
    // ---- DELETE upvotes ----
    if (lower.startsWith("delete from upvotes")) {
      const [feedback_id, shop_domain] = params as [string, string];
      state.upvotes = state.upvotes.filter(
        (u) => !(u.feedback_id === feedback_id && u.shop_domain === shop_domain),
      );
      return { results: [], success: true };
    }
    // ---- UPDATE feedback set upvotes ----
    if (lower.startsWith("update feedback set upvotes")) {
      const [id] = params as [string];
      const row = state.feedback.find((f) => f.id === id);
      if (row) {
        if (lower.includes("upvotes - 1")) {
          row.upvotes = Math.max(row.upvotes - 1, 0);
        } else if (lower.includes("upvotes + 1")) {
          row.upvotes += 1;
        }
      }
      return { results: [], success: true };
    }
    throw new Error(`Unhandled SQL in mock: ${sql}`);
  }

  function makeStatement(sql: string, params: unknown[] = []) {
    const stmt = {
      bind(...rest: unknown[]) {
        return makeStatement(sql, [...params, ...rest]);
      },
      async first<T = unknown>(): Promise<T | null> {
        const r = exec(sql, params);
        return (r.results[0] as T | undefined) ?? null;
      },
      async all<T = unknown>() {
        const r = exec(sql, params);
        return { results: r.results as T[], success: r.success, meta: {} };
      },
      async run() {
        const r = exec(sql, params);
        return { success: r.success, meta: {} };
      },
    };
    return stmt;
  }

  const db = {
    prepare(sql: string) {
      return makeStatement(sql);
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      // Run sequentially; in-memory mock has no atomicity needs.
      const out = [];
      for (const s of statements) {
        out.push(await s.run());
      }
      return out;
    },
  } as unknown as D1Database;

  return { db, state };
}

// ---- KV mock (Plan resolver writes to BULK_OPS_KV) ----

function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return { keys: [], list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
}

// ---- GraphQL mock (only for plan resolution) ----

function makeGraphQL(plan: "free" | "pro" = "free"): GraphQLClient {
  return (async (query: string) => {
    if (query.includes("ActiveSubscriptions")) {
      return {
        data: {
          currentAppInstallation: {
            activeSubscriptions:
              plan === "pro" ? [{ name: "Pro Monthly", status: "ACTIVE" }] : [],
          },
        },
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
    return { data: {} };
  }) as unknown as GraphQLClient;
}

// ---- Test app builder ----

function buildTestApp(opts: { plan?: "free" | "pro"; shop?: string } = {}) {
  const { db, state } = makeDb();
  const kv = makeKv();
  const graphql = makeGraphQL(opts.plan ?? "free");
  const app = new Hono<{ Bindings: Env }>();

  const fakeAuth = vi.fn(async (c, next) => {
    c.set("shopDomain", opts.shop ?? "alpha.myshopify.com");
    c.set("userId", "1");
    c.set("accessToken", "test");
    c.set("graphql", graphql);
    await next();
  });
  app.route("/api/feedback", feedbackRoutes(fakeAuth as never));
  // Mirror createApp() error handling so HttpError instances become typed JSON responses.
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(
        { error: err.code, message: err.publicMessage },
        err.status as ContentfulStatusCode,
      );
    }
    return c.json({ error: "internal_error", message: "Internal server error" }, 500);
  });

  const env = {
    SHOPIFY_API_VERSION: "2026-04",
    SHOPIFY_API_KEY: "key",
    SHOPIFY_API_SECRET: "secret",
    SHOPIFY_APP_URL: "https://example.com",
    BULK_OPS_KV: kv,
    FEEDBACK_DB: db,
  } as unknown as Env;

  return { app, env, state };
}

// ---- Tests ----

const VALID_BODY = {
  type: "feature_request" as const,
  title: "Add email digest of weekly results",
  description:
    "It would help me see how the week went without having to log in every time.",
};

describe("POST /api/feedback", () => {
  it("rejects bodies with too-short title or description", async () => {
    const { app, env } = buildTestApp();
    const res = await app.request(
      "/api/feedback",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "bug_report", title: "x", description: "y" }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("rejects an unknown type", async () => {
    const { app, env } = buildTestApp();
    const res = await app.request(
      "/api/feedback",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...VALID_BODY, type: "compliment" }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("creates a feedback row and returns its id", async () => {
    const { app, env, state } = buildTestApp({ plan: "free" });
    const res = await app.request(
      "/api/feedback",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(typeof body.id).toBe("string");
    expect(state.feedback).toHaveLength(1);
    expect(state.feedback[0]?.shop_domain).toBe("alpha.myshopify.com");
    expect(state.feedback[0]?.plan).toBe("free");
    expect(state.feedback[0]?.status).toBe("open");
    expect(state.feedback[0]?.upvotes).toBe(0);
  });

  it("rate-limits a shop after 10 submissions in 24h", async () => {
    const { app, env, state } = buildTestApp({ plan: "pro" });
    // Pre-fill with 10 recent submissions for this shop.
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      state.feedback.push({
        id: `pre-${i}`,
        type: "feature_request",
        title: "x",
        description: "y",
        page: null,
        severity: null,
        frequency: null,
        shop_domain: "alpha.myshopify.com",
        plan: "pro",
        status: "open",
        upvotes: 0,
        submitted_at: new Date(now - i * 1000).toISOString(),
        shipped_at: null,
      });
    }
    const res = await app.request(
      "/api/feedback",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/feedback", () => {
  it("returns public-status items only, sorted by upvotes desc", async () => {
    const { app, env, state } = buildTestApp();
    state.feedback.push(
      {
        id: "a", type: "feature_request", title: "Feature A",
        description: "x", page: null, severity: null, frequency: null,
        shop_domain: "other.myshopify.com", plan: "pro", status: "open",
        upvotes: 5, submitted_at: "2026-04-01T00:00:00Z", shipped_at: null,
      },
      {
        id: "b", type: "bug_report", title: "Bug B",
        description: "y", page: null, severity: null, frequency: null,
        shop_domain: "other.myshopify.com", plan: "pro", status: "shipped",
        upvotes: 12, submitted_at: "2026-03-01T00:00:00Z",
        shipped_at: "2026-04-15T00:00:00Z",
      },
      {
        id: "c", type: "feature_request", title: "Hidden",
        description: "z", page: null, severity: null, frequency: null,
        shop_domain: "other.myshopify.com", plan: "pro", status: "wont_fix",
        upvotes: 100, submitted_at: "2026-04-10T00:00:00Z", shipped_at: null,
      },
    );
    state.upvotes.push({
      feedback_id: "a",
      shop_domain: "alpha.myshopify.com",
      created_at: "2026-04-02T00:00:00Z",
    });

    const res = await app.request("/api/feedback", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ id: string; upvotes: number; hasUpvoted: boolean; status: string }>;
    };
    expect(body.items.map((i) => i.id)).toEqual(["b", "a"]);
    const a = body.items.find((i) => i.id === "a");
    expect(a?.hasUpvoted).toBe(true);
    const b = body.items.find((i) => i.id === "b");
    expect(b?.hasUpvoted).toBe(false);
  });
});

describe("POST /api/feedback/:id/upvote", () => {
  it("toggles upvote on then off and increments/decrements the count", async () => {
    const { app, env, state } = buildTestApp();
    state.feedback.push({
      id: "abc", type: "feature_request", title: "Feature",
      description: "x", page: null, severity: null, frequency: null,
      shop_domain: "other.myshopify.com", plan: "pro", status: "open",
      upvotes: 3, submitted_at: "2026-04-01T00:00:00Z", shipped_at: null,
    });

    const r1 = await app.request("/api/feedback/abc/upvote", { method: "POST" }, env);
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { upvotes: number; hasUpvoted: boolean };
    expect(b1.hasUpvoted).toBe(true);
    expect(b1.upvotes).toBe(4);
    expect(state.upvotes).toHaveLength(1);

    const r2 = await app.request("/api/feedback/abc/upvote", { method: "POST" }, env);
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { upvotes: number; hasUpvoted: boolean };
    expect(b2.hasUpvoted).toBe(false);
    expect(b2.upvotes).toBe(3);
    expect(state.upvotes).toHaveLength(0);
  });

  it("rejects upvote on a non-existent feedback id", async () => {
    const { app, env } = buildTestApp();
    const res = await app.request("/api/feedback/missing/upvote", { method: "POST" }, env);
    expect(res.status).toBe(400);
  });

  it("rejects upvote on an item with non-public status", async () => {
    const { app, env, state } = buildTestApp();
    state.feedback.push({
      id: "x", type: "bug_report", title: "Hidden",
      description: "y", page: null, severity: null, frequency: null,
      shop_domain: "other.myshopify.com", plan: "pro", status: "wont_fix",
      upvotes: 0, submitted_at: "2026-04-01T00:00:00Z", shipped_at: null,
    });
    const res = await app.request("/api/feedback/x/upvote", { method: "POST" }, env);
    expect(res.status).toBe(400);
  });
});
