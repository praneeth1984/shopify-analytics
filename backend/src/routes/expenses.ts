/**
 * GET /api/expenses/:month  — read expenses for YYYY-MM
 * PUT /api/expenses/:month  — write expenses for YYYY-MM
 *
 * Auth: requires verified Shopify session token.
 * Storage: one metafield per month, key = "expenses_YYYY-MM".
 * Free plan: only current and previous month are writable.
 * Pro plan: unlimited history.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { readMetafield, writeMetafield, getShopGid } from "../metafields/client.js";
import { getPlanCached } from "../plan/get-plan.js";
import { BadRequest } from "../lib/errors.js";
import { METAFIELD_KEYS } from "@fbc/shared";
import type { MonthlyExpenses, ExpensesResponse } from "@fbc/shared";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function prevMonth(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const EMPTY_EXPENSES: MonthlyExpenses = {
  meta_ads: 0,
  google_ads: 0,
  tiktok_ads: 0,
  other_marketing: 0,
  other: [],
};

function isValidExpenses(v: unknown): v is MonthlyExpenses {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  for (const key of ["meta_ads", "google_ads", "tiktok_ads", "other_marketing"] as const) {
    if (typeof o[key] !== "number" || o[key] < 0) return false;
  }
  if (!Array.isArray(o["other"])) return false;
  for (const item of o["other"] as unknown[]) {
    if (typeof item !== "object" || item === null) return false;
    const i = item as Record<string, unknown>;
    if (typeof i["label"] !== "string" || typeof i["amount"] !== "number") return false;
  }
  return true;
}

export function expensesRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/:month", async (c) => {
    const month = c.req.param("month");
    if (!MONTH_RE.test(month)) throw BadRequest("month must be YYYY-MM");

    const graphql = c.get("graphql");
    const key = `${METAFIELD_KEYS.expensesPrefix}${month}`;
    const stored = await readMetafield<MonthlyExpenses>(graphql, key);

    const response: ExpensesResponse = {
      month,
      expenses: stored ?? EMPTY_EXPENSES,
    };
    return c.json(response);
  });

  app.put("/:month", async (c) => {
    const month = c.req.param("month");
    if (!MONTH_RE.test(month)) throw BadRequest("month must be YYYY-MM");

    const plan = await getPlanCached(c);
    if (plan === "free") {
      const allowed = [currentMonth(), prevMonth()];
      if (!allowed.includes(month)) {
        throw BadRequest(
          "Free plan can only edit the current and previous month. Upgrade to Pro for unlimited history.",
        );
      }
    }

    const body = await c.req.json<unknown>();
    if (!isValidExpenses(body)) throw BadRequest("invalid expenses payload");

    const graphql = c.get("graphql");
    const shopGid = await getShopGid(graphql);
    const key = `${METAFIELD_KEYS.expensesPrefix}${month}`;
    await writeMetafield(graphql, shopGid, key, body);

    return c.json({ ok: true, month });
  });

  return app;
}
