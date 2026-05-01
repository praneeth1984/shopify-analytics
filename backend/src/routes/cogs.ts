/**
 * COGS routes.
 *
 *   GET    /api/cogs                        list current entries (server filtered/searched)
 *   GET    /api/cogs/export                 download all entries as CSV
 *   POST   /api/cogs/import                 merge-import entries from a CSV body
 *   POST   /api/cogs/upsert                 add or update a single variant entry
 *   DELETE /api/cogs/:variantId             remove a single entry
 *   PATCH  /api/cogs/default-margin         set the store-wide default margin %
 *
 * Auth: every route requires a verified Shopify session token (handled by
 * `requireSessionToken` middleware on the parent router).
 *
 * Concurrency: all writes are CAS on `cogs_meta.lastWriteAt`. A 409 with code
 * `COGS_VERSION_CONFLICT` tells the UI to refresh and retry.
 *
 * Plan gating: free tier is capped at 20 SKUs. Adding a NEW variant beyond
 * the cap returns 409 with `COGS_CAP_EXCEEDED`. Updates to existing entries
 * are always allowed regardless of count (preserves data on Pro->Free
 * downgrade).
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import {
  applyCogsWrite,
  ensureMetaInitialised,
  readCogsState,
} from "../cogs/store.js";
import { limitsFor } from "../cogs/cap.js";
import { getPlanCached } from "../plan/get-plan.js";
import { BadRequest, HttpError } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import { SHOP_CURRENCY_QUERY } from "../metrics/queries.js";
import {
  PRODUCT_VARIANT_SEARCH,
  type VariantSearchResult,
} from "../shopify/queries/variants.graphql.js";
import type { GraphQLClient } from "../shopify/graphql-client.js";
import type { CogsEntry, Money } from "@fbc/shared";
import { entriesToCsv, parseCogsCsv, type ParsedCsvRow } from "../cogs/csv.js";

// ---- Helpers ----

async function readShopCurrency(graphql: GraphQLClient): Promise<string> {
  const { data } = await graphql<{ shop: { currencyCode: string } }>(SHOP_CURRENCY_QUERY);
  return data.shop.currencyCode;
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function isMoney(v: unknown): v is Money {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.amount === "string" &&
    typeof m.currency_code === "string" &&
    m.amount.length > 0 &&
    m.currency_code.length > 0
  );
}

const VARIANT_GID_PREFIX = "gid://shopify/ProductVariant/";
const PRODUCT_GID_PREFIX = "gid://shopify/Product/";

/**
 * Read the request body as CSV text. Supports two shapes:
 *   - `content-type: text/csv`        — raw body
 *   - `content-type: multipart/...`   — first file part is taken as CSV
 *
 * Returns null when neither shape produced any text.
 */
async function readCsvBody(req: Request): Promise<string | null> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (ct.startsWith("multipart/")) {
    const form = await req.formData();
    for (const [, value] of form.entries()) {
      // Workers-types models the form-data file value as a `Blob`-like with
      // `.text()`. Strings are also possible (regular form fields); skip those.
      if (typeof value !== "string" && value && typeof (value as { text?: () => Promise<string> }).text === "function") {
        return await (value as { text: () => Promise<string> }).text();
      }
    }
    return null;
  }
  const text = await req.text();
  return text.length > 0 ? text : null;
}

type RowValidation =
  | { ok: true; entry: CogsEntry }
  | {
      ok: false;
      reason:
        | "invalid_variant_id"
        | "missing_product_id"
        | "invalid_cost"
        | "currency_mismatch";
      message: string;
    };

function validateRow(row: ParsedCsvRow, shopCurrency: string): RowValidation {
  const variantId = row.variant_id?.trim();
  if (!variantId || !variantId.startsWith(VARIANT_GID_PREFIX)) {
    return {
      ok: false,
      reason: "invalid_variant_id",
      message: `variant_id must be a Shopify variant GID (${VARIANT_GID_PREFIX}…)`,
    };
  }
  const costAmount = row.cost_amount?.trim();
  const costCurrency = (row.cost_currency ?? "").trim().toUpperCase();
  if (costCurrency !== shopCurrency.toUpperCase()) {
    return {
      ok: false,
      reason: "currency_mismatch",
      message: `cost_currency must match shop currency (${shopCurrency})`,
    };
  }
  const num = Number(costAmount);
  if (!costAmount || !Number.isFinite(num) || num < 0) {
    return {
      ok: false,
      reason: "invalid_cost",
      message: "cost_amount must be a non-negative decimal",
    };
  }
  const productId = row.product_id?.trim();
  if (!productId || !productId.startsWith(PRODUCT_GID_PREFIX)) {
    return {
      ok: false,
      reason: "missing_product_id",
      message: `product_id must be a Shopify product GID (${PRODUCT_GID_PREFIX}…)`,
    };
  }
  const title = (row.title ?? "").trim();
  const sku = (row.sku ?? "").trim();
  // updatedAt is rewritten on import to mark provenance; we don't trust the CSV value.
  const entry: CogsEntry = {
    variantId,
    productId,
    title: title || variantId,
    sku: sku.length > 0 ? sku : null,
    cost: { amount: costAmount, currency_code: shopCurrency },
    updatedAt: new Date().toISOString(),
  };
  return { ok: true, entry };
}

// ---- Routes ----

/**
 * @param authOverride  Optional middleware to use instead of the session-token
 *                       guard. Tests inject a fake that pre-populates the
 *                       Hono context with `shopDomain` + `graphql`. Production
 *                       always uses `requireSessionToken()`.
 */
export function cogsRoutes(authOverride?: ReturnType<typeof requireSessionToken>) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", authOverride ?? requireSessionToken());

  /**
   * GET /api/cogs
   *   ?query=...    server-side autocomplete against productVariants(query)
   *   ?cursor=...   pagination cursor (only used with query mode)
   *
   * No-query mode returns the full set of saved COGS entries plus meta + plan.
   * Query mode returns variant search results from Shopify with current cost
   * (from saved entries) joined in for display.
   */
  app.get("/", async (c) => {
    const graphql = c.get("graphql");
    const query = c.req.query("query");
    const cursor = c.req.query("cursor") ?? null;
    const plan = await getPlanCached(c);
    const limits = limitsFor(plan);

    const currency = await readShopCurrency(graphql);
    const state = await readCogsState(graphql, currency);

    if (query && query.trim().length > 0) {
      const { data } = await graphql<{ productVariants: VariantSearchResult }>(
        PRODUCT_VARIANT_SEARCH,
        { query: query.trim(), first: 25, after: cursor },
      );
      const byVariant = new Map(state.entries.map((e) => [e.variantId, e]));
      const results = data.productVariants.nodes.map((v) => {
        const existing = byVariant.get(v.id) ?? null;
        return {
          variant_id: v.id,
          product_id: v.product.id,
          sku: v.sku,
          title: v.product.title,
          variant_title: v.title === "Default Title" ? null : v.title,
          display_name: v.displayName,
          price: { amount: v.price, currency_code: currency },
          image_url: v.image?.url ?? v.product.featuredImage?.url ?? null,
          existing_cost: existing?.cost ?? null,
        };
      });
      return c.json({
        mode: "search" as const,
        page_info: data.productVariants.pageInfo,
        variants: results,
        plan,
        limits: { cogs_cap: limits.cogsCap, history_days: limits.historyDays },
        meta: state.meta,
      });
    }

    return c.json({
      mode: "list" as const,
      entries: state.entries,
      plan,
      limits: { cogs_cap: limits.cogsCap, history_days: limits.historyDays },
      meta: state.meta,
    });
  });

  /**
   * GET /api/cogs/export
   * CSV download of every saved entry across all shards.
   * Headers: variant_id, sku, product_id, title, cost_amount, cost_currency, updated_at
   */
  app.get("/export", async (c) => {
    const graphql = c.get("graphql");
    const shopDomain = c.get("shopDomain");
    const currency = await readShopCurrency(graphql);
    const state = await readCogsState(graphql, currency);

    const csv = entriesToCsv(state.entries);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    // Sanitise the shop subdomain for the filename — strip the .myshopify.com tail.
    const slug = shopDomain.replace(/\.myshopify\.com$/i, "");

    log.info("cogs.exported", { count: state.entries.length });
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="firstbridge-cogs-${slug}-${today}.csv"`,
        // Keep the file out of any intermediate caches.
        "cache-control": "no-store",
      },
    });
  });

  /**
   * POST /api/cogs/import
   *
   * Accepts either a raw CSV body (`content-type: text/csv`) or a multipart
   * form whose first file part is a CSV. Always 200 — partial success returns
   * a list of skipped rows with reasons.
   *
   * Free plan respects the 20-SKU cap: rows beyond the cap are skipped (not
   * 409). Existing variants in the imported CSV always update regardless of
   * count, since updates don't grow storage. Merge semantics: variants not
   * present in the CSV are preserved.
   */
  app.post("/import", async (c) => {
    const graphql = c.get("graphql");
    const plan = await getPlanCached(c);
    const limits = limitsFor(plan);
    const shopCurrency = await readShopCurrency(graphql);

    const csvText = await readCsvBody(c.req.raw);
    if (!csvText) {
      throw BadRequest("CSV body is required (text/csv or multipart file)");
    }

    const { rows, headerMissing } = parseCogsCsv(csvText);
    if (headerMissing.length > 0) {
      throw BadRequest(
        `CSV is missing required columns: ${headerMissing.join(", ")}. ` +
          "Headers must include variant_id, cost_amount, cost_currency.",
      );
    }

    // Re-read fresh so we can decide cap-vs-update for each row.
    await ensureMetaInitialised(graphql, shopCurrency);
    const current = await readCogsState(graphql, shopCurrency);
    const existingIds = new Set(current.entries.map((e) => e.variantId));

    const accepted: CogsEntry[] = [];
    const skipped: Array<{
      row: number;
      variant_id: string;
      reason:
        | "invalid_variant_id"
        | "missing_product_id"
        | "invalid_cost"
        | "currency_mismatch"
        | "free_cap";
      message: string;
    }> = [];

    // Track newly-added variants so we don't double-count when the CSV repeats
    // a variant, and so we enforce the cap deterministically by file order.
    let newAdds = 0;
    const existingPostImport = new Set(existingIds);
    const seenInCsv = new Set<string>();

    rows.forEach((row, idx) => {
      const lineNumber = idx + 2; // header is line 1, data starts at 2
      const result = validateRow(row, shopCurrency);
      if (!result.ok) {
        skipped.push({
          row: lineNumber,
          variant_id: row.variant_id ?? "",
          reason: result.reason,
          message: result.message,
        });
        return;
      }

      const variantId = result.entry.variantId;
      // De-dupe within the CSV: later occurrences of the same variantId win,
      // so replace any earlier accepted row.
      if (seenInCsv.has(variantId)) {
        const existingIdx = accepted.findIndex((a) => a.variantId === variantId);
        if (existingIdx >= 0) accepted[existingIdx] = result.entry;
        return;
      }
      seenInCsv.add(variantId);

      const isNew = !existingPostImport.has(variantId);
      if (isNew && !Number.isFinite(limits.cogsCap)) {
        // Pro: no cap.
        accepted.push(result.entry);
        existingPostImport.add(variantId);
        newAdds++;
        return;
      }
      if (isNew) {
        const projected = current.entries.length + newAdds + 1;
        if (projected > limits.cogsCap) {
          skipped.push({
            row: lineNumber,
            variant_id: variantId,
            reason: "free_cap",
            message: `Free plan cap of ${limits.cogsCap} reached. Upgrade to Pro for unlimited.`,
          });
          return;
        }
        newAdds++;
        existingPostImport.add(variantId);
      }
      accepted.push(result.entry);
    });

    if (accepted.length === 0) {
      log.info("cogs.imported_noop", {
        plan,
        skipped: skipped.length,
      });
      return c.json({
        imported: 0,
        skipped,
        meta: current.meta,
        plan,
        cap: Number.isFinite(limits.cogsCap) ? limits.cogsCap : null,
      });
    }

    const result = await applyCogsWrite({
      graphql,
      expectedLastWriteAt: current.meta.lastWriteAt,
      fallbackCurrency: shopCurrency,
      op: { kind: "bulk-upsert", entries: accepted },
    });

    log.info("cogs.imported", {
      plan,
      imported: accepted.length,
      skipped: skipped.length,
      total: result.meta.totalCount,
    });

    return c.json({
      imported: accepted.length,
      skipped,
      meta: result.meta,
      plan,
      cap: Number.isFinite(limits.cogsCap) ? limits.cogsCap : null,
    });
  });

  /**
   * POST /api/cogs/upsert
   * Body: {
   *   variantId, productId, title, sku, cost: Money,
   *   expectedLastWriteAt
   * }
   */
  app.post("/upsert", async (c) => {
    const graphql = c.get("graphql");
    const plan = await getPlanCached(c);
    const limits = limitsFor(plan);

    const body = await c.req.json<{
      variantId?: string;
      productId?: string;
      title?: string;
      sku?: string | null;
      cost?: Money;
      expectedLastWriteAt?: string;
    }>();

    if (!body.variantId || !body.variantId.startsWith("gid://shopify/ProductVariant/")) {
      throw BadRequest("variantId is required (Shopify variant GID)");
    }
    if (!body.productId || !body.productId.startsWith("gid://shopify/Product/")) {
      throw BadRequest("productId is required (Shopify product GID)");
    }
    if (!body.title) throw BadRequest("title is required");
    if (!isMoney(body.cost)) throw BadRequest("cost must be { amount, currency_code }");
    if (!body.expectedLastWriteAt) throw BadRequest("expectedLastWriteAt is required");

    // Negative costs make no sense; zero is allowed (loss-leader / freebie tracking).
    const amountNum = Number(body.cost.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      throw BadRequest("cost.amount must be a non-negative decimal string");
    }

    const shopCurrency = await readShopCurrency(graphql);
    if (body.cost.currency_code !== shopCurrency) {
      throw new HttpError(
        409,
        "COGS_CURRENCY_MISMATCH",
        `Cost currency must match the shop currency (${shopCurrency}).`,
      );
    }

    // Cap check — only blocks NEW variants.
    const current = await readCogsState(graphql, shopCurrency);
    const existing = current.entries.find((e) => e.variantId === body.variantId);
    const isNewEntry = !existing;
    if (isNewEntry && current.entries.length + 1 > limits.cogsCap) {
      log.info("cogs.cap_exceeded", { plan, used: current.entries.length, cap: limits.cogsCap });
      return c.json(
        {
          error: "COGS_CAP_EXCEEDED",
          message: `Free plan limit reached. Upgrade to Pro to add costs for more SKUs.`,
          cap: Number.isFinite(limits.cogsCap) ? limits.cogsCap : null,
          used: current.entries.length,
          plan,
        },
        409,
      );
    }

    const now = new Date().toISOString();
    const entry: CogsEntry = {
      variantId: body.variantId,
      sku: body.sku ?? existing?.sku ?? null,
      productId: body.productId,
      title: body.title,
      cost: body.cost,
      updatedAt: now,
    };

    const result = await applyCogsWrite({
      graphql,
      expectedLastWriteAt: body.expectedLastWriteAt,
      fallbackCurrency: shopCurrency,
      op: { kind: "upsert", entry },
    });

    log.info("cogs.upsert_ok", {
      plan,
      total: result.meta.totalCount,
      // do NOT log cost.amount — keep PII / cost values out of logs
    });

    return c.json({ meta: result.meta, entry });
  });

  /**
   * DELETE /api/cogs/:variantId
   * Body: { expectedLastWriteAt }
   */
  app.delete("/:variantId{.+}", async (c) => {
    const graphql = c.get("graphql");
    const variantId = decodeURIComponent(c.req.param("variantId"));
    if (!variantId.startsWith("gid://shopify/ProductVariant/")) {
      throw BadRequest("variantId must be a Shopify variant GID");
    }

    const body = await c.req
      .json<{ expectedLastWriteAt?: string }>()
      .catch((): { expectedLastWriteAt?: string } => ({}));
    if (!body.expectedLastWriteAt) throw BadRequest("expectedLastWriteAt is required");

    const shopCurrency = await readShopCurrency(graphql);
    const result = await applyCogsWrite({
      graphql,
      expectedLastWriteAt: body.expectedLastWriteAt,
      fallbackCurrency: shopCurrency,
      op: { kind: "delete", variantId },
    });

    log.info("cogs.delete_ok", { total: result.meta.totalCount });
    return c.json({ meta: result.meta });
  });

  /**
   * PATCH /api/cogs/default-margin
   * Body: { defaultMarginPct: number, expectedLastWriteAt: string }
   */
  app.patch("/default-margin", async (c) => {
    const graphql = c.get("graphql");
    const body = await c.req.json<{
      defaultMarginPct?: number;
      expectedLastWriteAt?: string;
    }>();
    if (!isPositiveNumber(body.defaultMarginPct) || (body.defaultMarginPct ?? 1) > 1) {
      throw BadRequest("defaultMarginPct must be between 0 and 1");
    }
    if (!body.expectedLastWriteAt) throw BadRequest("expectedLastWriteAt is required");

    const shopCurrency = await readShopCurrency(graphql);
    // Initialise meta if first write so CAS has a real timestamp to compare.
    await ensureMetaInitialised(graphql, shopCurrency);

    const result = await applyCogsWrite({
      graphql,
      expectedLastWriteAt: body.expectedLastWriteAt,
      fallbackCurrency: shopCurrency,
      op: { kind: "default-margin", defaultMarginPct: body.defaultMarginPct! },
    });

    log.info("cogs.default_margin_set");
    return c.json({ meta: result.meta });
  });

  return app;
}
