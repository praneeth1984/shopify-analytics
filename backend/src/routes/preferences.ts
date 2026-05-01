/**
 * UI preference flags persisted to `firstbridge_analytics.config` metafield.
 *
 *   GET   /api/preferences        return the merged preferences object
 *   PATCH /api/preferences        merge-update one or more keys
 *
 * The preferences metafield is intentionally permissive: each key is a single
 * boolean / scalar that the UI uses to remember dismissals. We write idempotent
 * `metafieldsSet` on every PATCH (no CAS — collisions on tiny boolean updates
 * are not worth the round trip).
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { readMetafield, writeMetafield, getShopGid } from "../metafields/client.js";
import { METAFIELD_KEYS } from "@fbc/shared";
import { BadRequest } from "../lib/errors.js";

type Preferences = {
  cogsBackupTipDismissed?: boolean;
  // Other UI flags can land here over time without bumping the schema.
};

function isPreferencesPatch(v: unknown): v is Preferences {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  for (const [k, val] of Object.entries(obj)) {
    if (typeof k !== "string") return false;
    if (val !== undefined && typeof val !== "boolean" && typeof val !== "string") {
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
    const prefs = (await readMetafield<Preferences>(graphql, METAFIELD_KEYS.config)) ?? {};
    return c.json({ preferences: prefs });
  });

  app.patch("/", async (c) => {
    const graphql = c.get("graphql");
    const patch = await c.req.json<unknown>();
    if (!isPreferencesPatch(patch)) {
      throw BadRequest("preferences must be an object of boolean/string flags");
    }
    const current = (await readMetafield<Preferences>(graphql, METAFIELD_KEYS.config)) ?? {};
    const next: Preferences = { ...current, ...patch };
    const ownerId = await getShopGid(graphql);
    await writeMetafield(graphql, ownerId, METAFIELD_KEYS.config, next);
    return c.json({ preferences: next });
  });

  return app;
}
