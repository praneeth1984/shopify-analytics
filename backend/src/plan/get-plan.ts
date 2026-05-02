/**
 * Resolve the active plan for the requesting shop.
 *
 * Source of truth: Shopify's Billing API (`currentAppInstallation.activeSubscriptions`).
 * The `firstbridge_analytics.plan` shop metafield is a denormalised read-cache
 * that is convenient for clients but is NOT trusted on the backend — a merchant
 * with `write_app_data_metafields` could otherwise fake a plan.
 *
 * Resolution order:
 *   1. KV cache (`BULK_OPS_KV`, key `plan:{shop_domain}`, 30 s TTL).
 *   2. Billing API GraphQL query → derive plan from active subscriptions.
 *   3. Cache result in KV (TTL 30) and write-back to the metafield.
 *
 * Within a single request the resolved plan is also memoised on the Hono
 * context to avoid repeated KV/GraphQL hits across middleware.
 */

import type { Context } from "hono";
import type { Env } from "../env.js";
import type { GraphQLClient } from "../shopify/graphql-client.js";
import { METAFIELD_NAMESPACE, METAFIELD_KEYS } from "@fbc/shared";
import type { Plan } from "@fbc/shared";
import { getShopGid } from "../metafields/client.js";
import { log } from "../lib/logger.js";

/** GraphQL: read the merchant's currently active subscriptions for this app. */
export const ACTIVE_SUBSCRIPTIONS_QUERY = /* GraphQL */ `
  query ActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        name
        status
      }
    }
  }
`;

/**
 * Idempotent metafield write so other reads of `firstbridge_analytics.plan`
 * (e.g. UI display) see the latest resolved plan.
 *
 * Note: this metafield is a denormalised read-cache, NOT the source of truth.
 * The backend always re-derives plan from the Billing API.
 */
const WRITE_PLAN_METAFIELD = /* GraphQL */ `
  mutation WritePlanMetafield($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

/** TTL (seconds) on the KV plan-resolution cache.
 *  Cloudflare KV minimum expirationTtl is 60 seconds. */
export const PLAN_CACHE_TTL_SECONDS = 60;

const VALID_PLANS: readonly Plan[] = ["free", "pro", "insights"];

declare module "hono" {
  interface ContextVariableMap {
    plan?: Plan;
  }
}

type ActiveSubscription = { name: string; status: string };

type CachedPlan = {
  plan: Plan;
  checkedAt: string; // ISO timestamp
};

export function planCacheKey(shopDomain: string): string {
  return `plan:${shopDomain}`;
}

/** Map active-subscription rows to a Plan. Status is normalised to upper-case. */
export function derivePlan(subs: ActiveSubscription[]): Plan {
  const active = subs.filter((s) => s.status?.toUpperCase() === "ACTIVE");
  if (active.length === 0) return "free";

  const lc = (s: string) => (s ?? "").toLowerCase();
  if (active.some((s) => lc(s.name).includes("insights"))) return "insights";
  // Managed Pricing plan names come from the Partner Dashboard. Use `includes`
  // rather than `startsWith` to be resilient to any naming variation. Any
  // active subscription that isn't insights is treated as Pro — this app has
  // exactly two tiers.
  if (active.some((s) => lc(s.name).includes("pro"))) return "pro";
  // Fallback: any unrecognised active subscription still means a paid tier.
  return "pro";
}

function isPlan(v: unknown): v is Plan {
  return typeof v === "string" && (VALID_PLANS as readonly string[]).includes(v);
}

function parseCached(raw: string | null): CachedPlan | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { plan?: unknown; checkedAt?: unknown };
    if (!isPlan(parsed.plan) || typeof parsed.checkedAt !== "string") return null;
    return { plan: parsed.plan, checkedAt: parsed.checkedAt };
  } catch {
    return null;
  }
}

/**
 * Query the Billing API and return the derived plan. Does not touch caches.
 * Exported for tests.
 */
export async function fetchPlanFromBilling(graphql: GraphQLClient): Promise<Plan> {
  const { data } = await graphql<{
    currentAppInstallation: { activeSubscriptions: ActiveSubscription[] } | null;
  }>(ACTIVE_SUBSCRIPTIONS_QUERY);
  const subs = data.currentAppInstallation?.activeSubscriptions ?? [];
  log.info("plan.billing_api_subs", { count: subs.length, subs: subs.map((s) => ({ name: s.name, status: s.status })) });
  return derivePlan(subs);
}

/**
 * Best-effort write-back to `firstbridge_analytics.plan`.
 *
 * This metafield is a denormalised read-cache, NOT the source of truth. We
 * write it so frontend/UI reads see the same value the backend resolved, but
 * we never trust it on the way in.
 */
async function writePlanMetafield(graphql: GraphQLClient, plan: Plan): Promise<void> {
  try {
    const ownerId = await getShopGid(graphql);
    await graphql<{
      metafieldsSet: {
        metafields: { id: string }[] | null;
        userErrors: { field: string[]; message: string; code: string }[];
      };
    }>(WRITE_PLAN_METAFIELD, {
      metafields: [
        {
          ownerId,
          namespace: METAFIELD_NAMESPACE,
          key: METAFIELD_KEYS.plan,
          // single_line_text_field keeps the value human-readable in the admin.
          type: "single_line_text_field",
          value: plan,
        },
      ],
    });
  } catch (err) {
    // Write-back is best-effort. Failure here must not break the read path —
    // the KV cache already has the correct plan.
    log.warn("plan.metafield_writeback_failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}

/**
 * Read-through plan resolver:
 *   KV → Billing API → KV write + metafield write-back.
 *
 * `shopDomain` is required so we can key the cache. Pass an explicit
 * `kv` only in tests; production code always supplies the binding.
 */
export async function resolvePlan(args: {
  graphql: GraphQLClient;
  kv: KVNamespace;
  shopDomain: string;
}): Promise<Plan> {
  const { graphql, kv, shopDomain } = args;
  const key = planCacheKey(shopDomain);

  const cachedRaw = await kv.get(key);
  const cached = parseCached(cachedRaw);
  if (cached) {
    return cached.plan;
  }

  const plan = await fetchPlanFromBilling(graphql);
  const payload: CachedPlan = { plan, checkedAt: new Date().toISOString() };

  // Cache + write-back run independently; cache is the hot path so it goes first.
  await kv.put(key, JSON.stringify(payload), { expirationTtl: PLAN_CACHE_TTL_SECONDS });
  // Denormalised read-cache for the UI; backend never trusts this metafield.
  void writePlanMetafield(graphql, plan);

  return plan;
}

/**
 * Backwards-compatible helper kept for tests/callers that already pass a
 * GraphQLClient. Always queries Billing API; does NOT consult KV or metafield.
 */
export async function getPlan(graphql: GraphQLClient): Promise<Plan> {
  return fetchPlanFromBilling(graphql);
}

/** Cached per-request plan lookup using Hono context + KV. */
export async function getPlanCached(c: Context<{ Bindings: Env }>): Promise<Plan> {
  const memoised = c.get("plan");
  if (memoised) return memoised;

  // DEV OVERRIDE: set FORCE_PLAN=pro in .dev.vars to bypass Billing API locally.
  // Never set in production; presence of the var is the signal.
  if (c.env.FORCE_PLAN && isPlan(c.env.FORCE_PLAN)) {
    c.set("plan", c.env.FORCE_PLAN);
    return c.env.FORCE_PLAN;
  }

  const graphql = c.get("graphql");
  const shopDomain = c.get("shopDomain");
  const kv = c.env.BULK_OPS_KV;

  const plan = await resolvePlan({ graphql, kv, shopDomain });
  c.set("plan", plan);
  return plan;
}

/** Test/webhook helper: drop the cache for a shop. */
export async function invalidatePlanCache(kv: KVNamespace, shopDomain: string): Promise<void> {
  await kv.delete(planCacheKey(shopDomain));
}
