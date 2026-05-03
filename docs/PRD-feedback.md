# FirstBridge Analytics — PRD: Feedback & Feature Requests Hub (F42)
**Date:** 2026-05-03
**Feature:** In-app feedback submission and public roadmap view
**Infrastructure exception:** Cloudflare D1 (SQLite) — first and only exception to the no-database rule. Justified below.

---

## Strategic Context

Merchants who can see their feedback acknowledged are more likely to stay installed through the early growth phase. Right now, if a merchant hits a bug or wants a feature, there is no in-app path — they either uninstall or leave a negative review. A lightweight feedback channel:

1. Converts frustration into a support ticket instead of a churn event.
2. Surfaces real merchant pain points to inform the roadmap (better than guessing from competitor catalogs).
3. Gives Pro-upgrade leverage — merchants whose feature requests get built upgrade faster.
4. Reduces negative App Store reviews by giving an outlet *before* the merchant visits the listing.

**Why not Canny / UserVoice / Gleap?** Third-party feedback SaaS introduces another vendor, another OAuth consent, and potential PII leakage for merchant emails. Building in-app keeps the experience native to Polaris, keeps data in our control, and costs nearly nothing on D1's free tier.

---

## Why Cloudflare D1 (Architecture Exception)

The no-database hard constraint in CLAUDE.md explicitly targets Postgres / Redis / Mongo for *merchant analytics data*. Feedback is fundamentally different:

| Consideration | Metafield option | D1 option |
|---|---|---|
| Data ownership | Per-shop — each merchant can only see their own feedback | Cross-merchant — all submissions in one place, queryable by the dev team |
| Queryability | Cannot query across shops without calling every shop's Admin API | Full SQL across all submissions |
| Write access | Requires an active Admin API token per shop | Worker writes directly; no token needed after JWT verify |
| Storage cost | Counts against the app's metafield quota | D1: 5 GB free, $0.75/GB after |
| Admin tooling | `wrangler` cannot query metafields | `wrangler d1 execute firstbridge-db --command "SELECT …"` |

D1 is Workers-native, included in the $5/mo Workers Paid plan at no extra cost up to 5 GB, and requires no egress fees. No stored merchant OAuth tokens are involved — the Worker writes to D1 directly after verifying the App Bridge JWT.

**This is the only use of D1 in the project.** It must be documented in CLAUDE.md and reviewed before any future D1 additions.

---

## Feature Scope

### F42-A — Feedback submission (bug report + feature request)

Merchants can submit a bug report or feature request from anywhere in the app.

**Entry point:** A persistent **"Feedback"** link in the Shopify NavMenu, below Settings. Keeps the surface area minimal while being discoverable from every page.

**Submission form (Polaris `Modal` or dedicated `/feedback` page):**

Two tabs: **Report a Bug** · **Request a Feature**

**Bug report fields:**
- Title (required, max 100 chars) — Polaris `TextField`
- Description (required, max 1,000 chars) — `TextField` multiline, placeholder: "What happened? What did you expect?"
- Page/section where it occurred — `Select` populated with the app's nav sections (auto-filled if the merchant navigates directly from a page)
- Severity — `Select`: Minor inconvenience / Blocks my workflow / Data looks wrong
- (Auto-captured, not shown) — plan tier, shop domain, current page URL, timestamp

**Feature request fields:**
- Title (required, max 100 chars)
- Description (required, max 1,000 chars) — "What would this help you do?"
- How often would you use this? — `Select`: Daily / Weekly / Monthly / Occasionally
- (Auto-captured) — plan tier, shop domain, timestamp

**Validation:**
- Title must be at least 10 characters.
- Description must be at least 20 characters.
- Rate limit: max 5 submissions per shop per 24-hour window (enforced in the Worker via D1 query before insert).

**Success state:** Polaris `Toast` — "Thanks! We read every submission." No email confirmation (avoids email infra dependency).

---

### F42-B — Public roadmap view

A read-only tab on the Feedback page showing what's been submitted, planned, and shipped. Gives merchants visibility and reduces repeat submissions.

**Tabs:** Requested (open) · Planned · Shipped

**Card per entry (public view):**
- Title
- Type badge (Bug / Feature)
- Upvote count + "Upvote" button (one upvote per shop, toggle)
- Status badge: Open · Reviewing · Planned · Shipped · Won't Fix

**What merchants can do:**
- Upvote any open or planned item (one per shop)
- See total upvote count on each item
- Filter by type (Bug / Feature)

**What merchants cannot do:**
- See the submitting shop domain (anonymized)
- Edit or delete their own submissions after submit (keep it simple)
- Comment (Phase 2 if needed)

**Visibility rule:** Only `status IN ('open', 'planned', 'shipped')` items are shown publicly. `reviewing` and `won't_fix` are internal-only until admin acts on them. Submitted items start at `open`; admin promotes them.

---

### F42-C — Admin review interface

No new admin UI in Phase 1. Review and triage via `wrangler d1 execute`:

```sql
-- All open feedback, sorted by upvotes
SELECT id, type, title, upvotes, submitted_at, plan
FROM feedback
WHERE status = 'open'
ORDER BY upvotes DESC;

-- Promote to Planned
UPDATE feedback SET status = 'planned' WHERE id = 'abc123';

-- Mark shipped
UPDATE feedback SET status = 'shipped', shipped_at = datetime('now') WHERE id = 'abc123';
```

Phase 2: a password-protected admin page at `/admin/feedback` (Worker route, protected by a `ADMIN_SECRET` env var in a Bearer header). Lists all submissions with inline status-change selects.

---

## D1 Schema

```sql
-- database name: firstbridge-db (bound as FEEDBACK_DB in wrangler.toml)

CREATE TABLE IF NOT EXISTS feedback (
  id          TEXT    PRIMARY KEY,              -- nanoid(12)
  type        TEXT    NOT NULL CHECK(type IN ('bug_report', 'feature_request')),
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL,
  page        TEXT,                             -- app section where submitted (bug only)
  severity    TEXT,                             -- bug only: minor | blocks | data_wrong
  frequency   TEXT,                             -- feature only: daily | weekly | monthly | occasionally
  shop_domain TEXT    NOT NULL,
  plan        TEXT    NOT NULL CHECK(plan IN ('free', 'pro')),
  status      TEXT    NOT NULL DEFAULT 'open'
                      CHECK(status IN ('open', 'reviewing', 'planned', 'shipped', 'wont_fix')),
  upvotes     INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT   NOT NULL,                 -- ISO 8601 UTC
  shipped_at  TEXT                              -- set when status → shipped
);

CREATE TABLE IF NOT EXISTS upvotes (
  feedback_id TEXT NOT NULL REFERENCES feedback(id),
  shop_domain TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (feedback_id, shop_domain)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_feedback_status   ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type     ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_shop     ON feedback(shop_domain);
CREATE INDEX IF NOT EXISTS idx_upvotes_feedback  ON upvotes(feedback_id);
```

---

## API Routes (backend/src/routes/feedback.ts)

All routes require a valid App Bridge JWT (reuse existing `authMiddleware`).

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/feedback` | Submit a bug report or feature request |
| `GET` | `/api/feedback` | List public feedback (open + planned + shipped), with upvote status for requesting shop |
| `POST` | `/api/feedback/:id/upvote` | Toggle upvote for a feedback item |

### POST /api/feedback

**Request body:**
```ts
{
  type: 'bug_report' | 'feature_request';
  title: string;           // 10–100 chars
  description: string;     // 20–1,000 chars
  page?: string;           // bug only
  severity?: 'minor' | 'blocks' | 'data_wrong';   // bug only
  frequency?: 'daily' | 'weekly' | 'monthly' | 'occasionally'; // feature only
}
```

**Worker logic:**
1. Verify JWT → extract `shop_domain` and `plan`.
2. Rate-limit check: count submissions from this shop in last 24h. If ≥ 5, return `429 Too Many Requests`.
3. Validate body (type, title length, description length).
4. Generate `id` via `nanoid(12)`.
5. Insert into `feedback` table.
6. Return `201 { id }`.

**Response (success):** `201 { id: string }`
**Response (rate limit):** `429 { error: 'rate_limit', retryAfterHours: number }`

### GET /api/feedback

**Query params:** `?type=bug_report|feature_request` (optional filter)

**Worker logic:**
1. Verify JWT → extract `shop_domain`.
2. Query `feedback` where `status IN ('open', 'planned', 'shipped')`, ordered by `upvotes DESC, submitted_at DESC`.
3. Left-join `upvotes` on `(feedback_id, shop_domain)` to determine `hasUpvoted` per item.
4. Return array of `FeedbackItem`.

**Response shape:**
```ts
type FeedbackItem = {
  id: string;
  type: 'bug_report' | 'feature_request';
  title: string;
  status: 'open' | 'planned' | 'shipped';
  upvotes: number;
  hasUpvoted: boolean;
  submittedAt: string;
};
```

### POST /api/feedback/:id/upvote

**Worker logic:**
1. Verify JWT → extract `shop_domain`.
2. Check if `(id, shop_domain)` exists in `upvotes`.
   - If not: insert into `upvotes`, increment `feedback.upvotes`, return `{ upvotes: newCount, hasUpvoted: true }`.
   - If exists: delete from `upvotes`, decrement `feedback.upvotes`, return `{ upvotes: newCount, hasUpvoted: false }`.
3. Return `200 { upvotes: number, hasUpvoted: boolean }`.

---

## Frontend — app/src/pages/Feedback.tsx

**Route:** `/feedback` (add to NavMenu and React Router)

**Layout:**

```
Page title: "Feedback"
Subtitle: "Report a bug or suggest a feature — we read every submission."

[Report a Bug]  [Request a Feature]     ← Polaris ButtonGroup tabs
                                          (switches the form below)

─── Submit form ────────────────────────
Title          [_____________________]
Description    [_____________________]
               [_____________________]
Page (bug)     [Select section ▼    ]
Severity (bug) [Select ▼            ]
Frequency (ft) [Select ▼            ]
               [Submit]

─── Community Requests ─────────────────
Tabs: [All] [Features] [Bugs]
Status filter: [Open] [Planned] [Shipped]

┌─────────────────────────────────────┐
│ ▲ 24   Dark mode support           │  ← feature badge, upvote button
│        Status: Planned             │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ ▲ 11   Orders chart wrong on Safari │  ← bug badge
│        Status: Open                │
└─────────────────────────────────────┘
```

**State:**
- `useFeedback` hook (new) — fetches `GET /api/feedback`, handles optimistic upvote toggle.
- Submit form — controlled form with Polaris validation states; calls `POST /api/feedback`.
- Upvote button — optimistic update (increment locally, sync on response).

**Empty state:** "No feedback yet in this category — be the first to share."

**Error state:** `Banner` with status `critical` per API error class convention.

---

## Shared Types (shared/src/index.ts additions)

```ts
export type FeedbackType = 'bug_report' | 'feature_request';
export type FeedbackStatus = 'open' | 'reviewing' | 'planned' | 'shipped' | 'wont_fix';
export type BugSeverity = 'minor' | 'blocks' | 'data_wrong';
export type FeatureFrequency = 'daily' | 'weekly' | 'monthly' | 'occasionally';

export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  title: string;
  status: FeedbackStatus;
  upvotes: number;
  hasUpvoted: boolean;
  submittedAt: string;
}

export interface SubmitFeedbackRequest {
  type: FeedbackType;
  title: string;
  description: string;
  page?: string;
  severity?: BugSeverity;
  frequency?: FeatureFrequency;
}
```

---

## Infrastructure Changes

### wrangler.toml additions

```toml
[[d1_databases]]
binding = "FEEDBACK_DB"
database_name = "firstbridge-db"
database_id = "<to be set after wrangler d1 create firstbridge-db>"
```

### Env type additions (backend/src/env.ts)

```ts
FEEDBACK_DB: D1Database;
```

### Migration script

```
backend/migrations/
  0001_create_feedback.sql   -- the schema above
```

Apply with:
```bash
wrangler d1 migrations apply firstbridge-db --remote
```

### Setup commands (one-time)

```bash
wrangler d1 create firstbridge-db
# Copy the database_id into wrangler.toml
wrangler d1 migrations apply firstbridge-db --remote
```

---

## Privacy & Security

- **No customer PII stored.** Feedback contains only: shop domain (already known to us via OAuth), plan, title, description, and auto-captured page/timestamps.
- **No merchant email stored.** Confirmation is a toast, not an email.
- **Shop domain in D1 is not surfaced in public API responses.** `GET /api/feedback` returns only `FeedbackItem` — no `shop_domain` field.
- **HMAC-verified session tokens** on all routes (same as every other `/api/*` route).
- **Rate limiting** (5 submissions/shop/24h) is enforced in the Worker before any D1 write.
- **SQL injection** — D1 bindings use prepared statements (`db.prepare('…').bind(…)`). Never string-interpolate user input into SQL.

---

## Free / Pro Split

Feedback is a support channel, not a feature gate. Both tiers get full access.

| Capability | Free | Pro |
|---|---|---|
| Submit bug reports | ✅ | ✅ |
| Submit feature requests | ✅ | ✅ |
| View public roadmap | ✅ | ✅ |
| Upvote items | ✅ | ✅ |
| Rate limit | 5/day | 5/day |

No upsell on this page — it would feel tone-deaf when a merchant is reporting a problem.

---

## Navigation Update

```
FirstBridge Analytics (Shopify NavMenu)
│
├── Overview
├── Profit
├── Products
├── Customers
├── Marketing
├── Reports
├── Settings
└── Feedback          ← new, always last
```

---

## Build Sequence

1. **Schema + D1 setup** — create DB, write migration file, apply locally and remotely, add binding to `wrangler.toml` and `env.ts`.
2. **Shared types** — add `FeedbackItem`, `SubmitFeedbackRequest`, and related enums to `shared/src/index.ts`.
3. **Backend routes** — `backend/src/routes/feedback.ts` with POST, GET, upvote. Unit-test rate limit logic, validation, and D1 interaction with a Vitest mock of the D1 binding.
4. **Mount route** — register `/api/feedback` in `backend/src/app.ts`.
5. **Frontend page** — `app/src/pages/Feedback.tsx` + `hooks/useFeedback.ts`. Skeleton states, error banners, optimistic upvote.
6. **NavMenu entry** — add "Feedback" link in `App.tsx` NavMenu definition.
7. **Smoke test** — submit a bug report and a feature request on a dev store; verify D1 row via `wrangler d1 execute firstbridge-db --command "SELECT * FROM feedback"`.

Estimated effort: **3–5 days** (backend ~1.5d, frontend ~1.5d, D1 setup + testing ~1d).

---

## Open Questions

1. **D1 database ID** — needs to be created via `wrangler d1 create firstbridge-db` before deploy; ID must be committed to `wrangler.toml`. Local dev uses a local D1 replica (wrangler handles this automatically with `--local`).
2. **Moderation** — should obscene or spam submissions be visible in the public roadmap? Phase 1: trust merchants (low abuse surface); Phase 2: add a `hidden` flag the admin can set via CLI.
3. **Upvote display threshold** — should items with 0 upvotes show in the public list immediately, or only after admin reviews? Recommend: show immediately (feedback loop matters) with a short disclaimer "Recent submissions are under review."
4. **Feedback from the roadmap view into planning** — once we have real submissions, how do we feed them into the build sequence in this PRD? Recommend: weekly `wrangler d1 execute` query sorted by upvotes, pipe into the sprint planning doc.
5. **D1 in CLAUDE.md** — the `## Hard Constraints` section must be updated to document this exception before the PR lands, so future sessions don't accidentally propose a second D1 usage without discussion.
