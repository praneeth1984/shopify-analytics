/**
 * UI preference flags persisted to `firstbridge_analytics.config` metafield.
 *
 *   GET   /api/preferences        return the merged preferences object
 *   PATCH /api/preferences        merge-update one or more keys
 *
 * The preferences metafield is intentionally permissive: each key is a single
 * boolean / scalar that the UI uses to remember dismissals and configuration.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { readMetafield, writeMetafield, getShopGid } from "../metafields/client.js";
import { METAFIELD_KEYS } from "@fbc/shared";
import { BadRequest } from "../lib/errors.js";
import type { GatewayRate } from "@fbc/shared";
import type { GraphQLClient } from "../shopify/graphql-client.js";

export type SavedView = {
  name: string;
  url: string;
};

export type Preferences = {
  cogsBackupTipDismissed?: boolean;
  gatewayRates?: GatewayRate[];
  savedViews?: SavedView[];
};

export async function readPreferences(graphql: GraphQLClient): Promise<Preferences> {
  return (await readMetafield<Preferences>(graphql, METAFIELD_KEYS.config)) ?? {};
}

function isValidGatewayRate(v: unknown): v is GatewayRate {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.gateway === "string" &&
    typeof r.pct === "number" &&
    r.pct >= 0 && r.pct <= 0.5 &&
    typeof r.fixed_minor === "number" &&
    r.fixed_minor >= 0
  );
}

function isValidSavedView(v: unknown): v is SavedView {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return typeof r.name === "string" && r.name.length > 0 && r.name.length <= 40 &&
    typeof r.url === "string" && r.url.startsWith("/");
}

function isPreferencesPatch(v: unknown): v is Preferences {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  for (const [k, val] of Object.entries(obj)) {
    if (typeof k !== "string") return false;
    if (k === "gatewayRates") {
      if (!Array.isArray(val) || !val.every(isValidGatewayRate)) return false;
    } else if (k === "savedViews") {
      if (!Array.isArray(val) || !val.every(isValidSavedView)) return false;
    } else if (val !== undefined && typeof val !== "boolean" && typeof val !== "string") {
      return false;
    }
  }
  return true;
}

export function preferencesRoutes(authOverride?: ReturnType<typeof requireSessionToken>) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", authOverride ?? requireSessionToken());

  app.get("/", async (c) => {
    const graphql = c.get("graphql");
    const prefs = await readPreferences(graphql);
    return c.json({ preferences: prefs });
  });

  app.patch("/", async (c) => {
    const graphql = c.get("graphql");
    const patch = await c.req.json<unknown>();
    if (!isPreferencesPatch(patch)) {
      throw BadRequest("preferences must be an object of valid flags");
    }
    const current = await readPreferences(graphql);
    const next: Preferences = { ...current, ...patch };
    const ownerId = await getShopGid(graphql);
    await writeMetafield(graphql, ownerId, METAFIELD_KEYS.config, next);
    return c.json({ preferences: next });
  });

  // POST /api/preferences/saved-views — save a named view (cap: 3 on Free, unlimited on Pro)
  app.post("/saved-views", async (c) => {
    const body = await c.req.json<unknown>();
    if (!isValidSavedView(body)) {
      throw BadRequest("name (1–40 chars) and url (starting with /) required");
    }
    const graphql = c.get("graphql");
    const current = await readPreferences(graphql);
    const views = current.savedViews ?? [];

    // Duplicate name check
    if (views.some((v) => v.name === body.name)) {
      throw BadRequest("a view with that name already exists");
    }

    // Import plan resolution lazily to avoid circular deps
    const { getPlanCached } = await import("../plan/get-plan.js");
    const plan = await getPlanCached(c as Parameters<typeof getPlanCached>[0]);
    const FREE_MAX = 3;
    if (plan === "free" && views.length >= FREE_MAX) {
      throw BadRequest(`Free plan is limited to ${FREE_MAX} saved views. Upgrade to Pro for unlimited.`);
    }

    const next: Preferences = { ...current, savedViews: [...views, body] };
    const ownerId = await getShopGid(graphql);
    await writeMetafield(graphql, ownerId, METAFIELD_KEYS.config, next);
    return c.json({ saved_views: next.savedViews });
  });

  // DELETE /api/preferences/saved-views/:name — remove a view by name
  app.delete("/saved-views/:name", async (c) => {
    const name = decodeURIComponent(c.req.param("name"));
    const graphql = c.get("graphql");
    const current = await readPreferences(graphql);
    const views = (current.savedViews ?? []).filter((v) => v.name !== name);
    const next: Preferences = { ...current, savedViews: views };
    const ownerId = await getShopGid(graphql);
    await writeMetafield(graphql, ownerId, METAFIELD_KEYS.config, next);
    return c.json({ saved_views: next.savedViews });
  });

  return app;
}
