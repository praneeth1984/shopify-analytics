/**
 * Feedback & Feature Requests Hub (F42).
 *
 *   POST /api/feedback                — submit a bug report or feature request
 *   GET  /api/feedback                — list public-facing feedback (open/planned/shipped)
 *   POST /api/feedback/:id/upvote     — toggle the requesting shop's upvote on an item
 *
 * Storage: Cloudflare D1 (`FEEDBACK_DB`). Two tables — `feedback` and
 * `upvotes`. Cross-shop visibility is intentional for the public listing so
 * merchants can see what others are asking for; per-shop scoping for inserts
 * and the `hasUpvoted` flag is enforced at the route layer.
 *
 * Auth: every endpoint requires a verified Shopify session token via
 * `requireSessionToken` — `c.get('shopDomain')` is the per-request identity.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { getPlanCached } from "../plan/get-plan.js";
import { BadRequest, Upstream } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import type {
  FeedbackItem,
  FeedbackType,
  BugSeverity,
  FeatureFrequency,
  SubmitFeedbackRequest,
} from "@fbc/shared";

// ---- Validation constants ----

const TITLE_MIN = 10;
const TITLE_MAX = 100;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 1000;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const RATE_LIMIT_MAX = 10;

const VALID_TYPES: readonly FeedbackType[] = ["bug_report", "feature_request"];
const VALID_SEVERITY: readonly BugSeverity[] = ["minor", "blocks", "data_wrong"];
const VALID_FREQUENCY: readonly FeatureFrequency[] = ["daily", "weekly", "monthly", "occasionally"];

// Public-listing statuses match FeedbackItem.status (open | planned | shipped).
const PUBLIC_STATUSES = ["open", "planned", "shipped"] as const;

// ---- Validation ----

function isValidSubmission(v: unknown): v is SubmitFeedbackRequest {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;

  if (typeof o.type !== "string" || !(VALID_TYPES as readonly string[]).includes(o.type)) {
    return false;
  }
  if (
    typeof o.title !== "string" ||
    o.title.trim().length < TITLE_MIN ||
    o.title.trim().length > TITLE_MAX
  ) {
    return false;
  }
  if (
    typeof o.description !== "string" ||
    o.description.trim().length < DESCRIPTION_MIN ||
    o.description.trim().length > DESCRIPTION_MAX
  ) {
    return false;
  }
  if (o.page !== undefined && typeof o.page !== "string") return false;

  if (o.type === "bug_report") {
    if (
      o.severity !== undefined &&
      (typeof o.severity !== "string" ||
        !(VALID_SEVERITY as readonly string[]).includes(o.severity))
    ) {
      return false;
    }
  }
  if (o.type === "feature_request") {
    if (
      o.frequency !== undefined &&
      (typeof o.frequency !== "string" ||
        !(VALID_FREQUENCY as readonly string[]).includes(o.frequency))
    ) {
      return false;
    }
  }
  return true;
}

// ---- Row shapes (D1 returns plain objects) ----

type FeedbackRow = {
  id: string;
  type: FeedbackType;
  title: string;
  status: FeedbackItem["status"];
  upvotes: number;
  submitted_at: string;
};

type UpvoteFlagRow = { feedback_id: string };

// ---- Routes ----

export function feedbackRoutes(authOverride?: ReturnType<typeof requireSessionToken>) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", authOverride ?? requireSessionToken());

  // POST / — submit feedback
  app.post("/", async (c) => {
    const shopDomain = c.get("shopDomain");
    const db = c.env.FEEDBACK_DB;

    const body = await c.req.json<unknown>().catch(() => null);
    if (!isValidSubmission(body)) {
      throw BadRequest(
        `feedback must include type, title (${TITLE_MIN}–${TITLE_MAX} chars), and description (${DESCRIPTION_MIN}–${DESCRIPTION_MAX} chars)`,
      );
    }

    // Rate limit: at most RATE_LIMIT_MAX submissions per shop per 24h window.
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const countRow = await db
      .prepare(
        "SELECT COUNT(*) as cnt FROM feedback WHERE shop_domain = ? AND submitted_at > ?",
      )
      .bind(shopDomain, windowStart)
      .first<{ cnt: number }>();
    const recent = countRow?.cnt ?? 0;
    if (recent >= RATE_LIMIT_MAX) {
      throw BadRequest(
        `You've submitted ${recent} items in the last 24 hours. Please wait before submitting more.`,
      );
    }

    const plan = await getPlanCached(c);
    // The schema constraint only allows 'free' | 'pro'; map legacy "insights" to "pro".
    const planForDb: "free" | "pro" = plan === "free" ? "free" : "pro";

    const id = crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    const title = body.title.trim();
    const description = body.description.trim();
    const page = body.page ?? null;
    const severity = body.type === "bug_report" ? body.severity ?? null : null;
    const frequency = body.type === "feature_request" ? body.frequency ?? null : null;

    try {
      await db
        .prepare(
          `INSERT INTO feedback
             (id, type, title, description, page, severity, frequency,
              shop_domain, plan, status, upvotes, submitted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, ?)`,
        )
        .bind(
          id,
          body.type,
          title,
          description,
          page,
          severity,
          frequency,
          shopDomain,
          planForDb,
          submittedAt,
        )
        .run();
    } catch (err) {
      log.error("feedback.insert_failed", {
        shop: shopDomain,
        message: err instanceof Error ? err.message : "unknown",
      });
      throw Upstream("Could not save feedback");
    }

    log.info("feedback.submitted", { shop: shopDomain, type: body.type, id });
    return c.json({ id }, 201);
  });

  // GET / — public listing (cross-shop). hasUpvoted is per requesting shop.
  app.get("/", async (c) => {
    const shopDomain = c.get("shopDomain");
    const db = c.env.FEEDBACK_DB;

    let rows: FeedbackRow[];
    try {
      const result = await db
        .prepare(
          `SELECT id, type, title, status, upvotes, submitted_at
             FROM feedback
            WHERE status IN ('open', 'planned', 'shipped')
            ORDER BY upvotes DESC, submitted_at DESC`,
        )
        .all<FeedbackRow>();
      rows = result.results;
    } catch (err) {
      log.error("feedback.list_failed", {
        shop: shopDomain,
        message: err instanceof Error ? err.message : "unknown",
      });
      throw Upstream("Could not load feedback");
    }

    // Per-shop upvote flags. One query, then a Set lookup per row.
    let upvotedIds: Set<string> = new Set();
    try {
      const upvoteResult = await db
        .prepare(
          `SELECT feedback_id FROM upvotes WHERE shop_domain = ?`,
        )
        .bind(shopDomain)
        .all<UpvoteFlagRow>();
      upvotedIds = new Set(upvoteResult.results.map((r) => r.feedback_id));
    } catch (err) {
      // Non-fatal: we degrade by treating all items as not-upvoted.
      log.warn("feedback.upvote_flags_failed", {
        shop: shopDomain,
        message: err instanceof Error ? err.message : "unknown",
      });
    }

    const items: FeedbackItem[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      // Public listing only ever returns the three public statuses.
      status: r.status as FeedbackItem["status"],
      upvotes: r.upvotes,
      hasUpvoted: upvotedIds.has(r.id),
      submittedAt: r.submitted_at,
    }));

    return c.json({ items });
  });

  // POST /:id/upvote — toggle upvote (insert+inc, or delete+dec) atomically.
  app.post("/:id/upvote", async (c) => {
    const shopDomain = c.get("shopDomain");
    const db = c.env.FEEDBACK_DB;
    const id = c.req.param("id");

    if (!id || id.length === 0) {
      throw BadRequest("feedback id required");
    }

    // Confirm the feedback row exists and is publicly visible.
    const fb = await db
      .prepare(
        `SELECT id, status FROM feedback WHERE id = ?`,
      )
      .bind(id)
      .first<{ id: string; status: string }>();
    if (!fb) {
      throw BadRequest("feedback not found");
    }
    if (!(PUBLIC_STATUSES as readonly string[]).includes(fb.status)) {
      throw BadRequest("feedback is not open for upvotes");
    }

    const existing = await db
      .prepare(
        `SELECT 1 as found FROM upvotes WHERE feedback_id = ? AND shop_domain = ?`,
      )
      .bind(id, shopDomain)
      .first<{ found: number }>();

    const hasUpvoted = !existing;
    const createdAt = new Date().toISOString();

    try {
      if (existing) {
        // Remove upvote.
        await db.batch([
          db
            .prepare(
              `DELETE FROM upvotes WHERE feedback_id = ? AND shop_domain = ?`,
            )
            .bind(id, shopDomain),
          db
            .prepare(
              `UPDATE feedback SET upvotes = MAX(upvotes - 1, 0) WHERE id = ?`,
            )
            .bind(id),
        ]);
      } else {
        // Add upvote.
        await db.batch([
          db
            .prepare(
              `INSERT INTO upvotes (feedback_id, shop_domain, created_at) VALUES (?, ?, ?)`,
            )
            .bind(id, shopDomain, createdAt),
          db
            .prepare(
              `UPDATE feedback SET upvotes = upvotes + 1 WHERE id = ?`,
            )
            .bind(id),
        ]);
      }
    } catch (err) {
      log.error("feedback.upvote_failed", {
        shop: shopDomain,
        id,
        message: err instanceof Error ? err.message : "unknown",
      });
      throw Upstream("Could not record upvote");
    }

    const updated = await db
      .prepare(`SELECT upvotes FROM feedback WHERE id = ?`)
      .bind(id)
      .first<{ upvotes: number }>();

    return c.json({
      upvotes: updated?.upvotes ?? 0,
      hasUpvoted,
    });
  });

  return app;
}
