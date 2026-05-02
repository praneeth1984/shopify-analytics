# FirstBridge Analytics — Shopify App

A Shopify analytics app built by [FirstBridge Consulting](https://firstbridgeconsulting.com).
Freemium model. Free tier launches first to drive install velocity; paid tier layers on later.

## Product Vision

Most Shopify stores (~98%) have no dedicated analytics app. Triple Whale / Lifetimely / Polar
Analytics are powerful but expensive ($200+/mo). FirstBridge Analytics fills the gap with a
genuinely useful free tier and predictable pricing — no per-order pricing, no surprise scaling.

**Phase 1 (current):** Free analytics dashboard. Headline overview metrics — revenue,
orders, AOV, unique customers — with previous-period comparison and a date-range picker.
**Profit-aware dashboard (R1)** — gross profit, margin %, profit-per-order, top
profitable products, COGS coverage banner — driven by manual per-variant cost entry on
a Settings page (capped at 20 SKUs on Free) plus a store-wide default margin %. **CSV
export/import (R1.2)** lets merchants back up costs since uninstall removes app data.
Up to 90-day history with synchronous aggregation (capped at 2,500 orders/range; UI shows
a "partial results" banner above the cap). Top products, traffic sources, inventory
at risk, new vs returning are queued for Phase 1.5.

**Phase 2:** Pro tier ($19–29/mo) — unlimited history, daily auto-refresh, cohort retention,
margin analysis, exports, peer benchmarks, period-over-period comparisons, deeper analysis
on every free-tier view.

### Plans & billing

- **Two plans only: Free and Pro.** No Insights/AI tier as a separate plan in the roadmap;
  AI features, if shipped, layer into Pro.
- **Monthly billing only.** No annual plans, no usage-based pricing, no per-order fees.
  Predictable pricing is part of the value prop — keep it that way.
- **Free → Pro split rule of thumb:** Free gives the headline number and a usable slice
  (recent history, current snapshot, top-N). Pro unlocks *more history, more comparisons,
  more depth, more automation* — never the headline number itself.

### Free-tier limits (apply across all features)

- **COGS / cost entry: capped at 20 SKUs on Free.** Stores with more SKUs fall back to a
  store-wide default margin %. Pro removes the cap. Rationale: profit is a headline number
  so it must be free, but unbounded per-SKU storage isn't sustainable on metafield-only
  storage and most small stores don't need it.
- **History depth: 90 days on Free, unlimited on Pro.**
- **Refresh: manual on Free, daily auto-refresh on Pro.**
- When a Free-tier user hits a cap, the UI must show the cap inline (not a generic upsell
  modal) and explain what Pro unlocks for *this specific view*.

## Hard Constraints (do not violate)

- **No database.** Shopify is the source of truth; configuration and snapshots live in shop
  metafields under namespace `firstbridge_analytics`. Heavy aggregations run via Shopify's
  bulk operations API. If you find yourself wanting to add Postgres / Redis / Mongo, stop and
  raise the question — the answer is almost certainly "use a metafield" or "compute on demand."
- **Stateless backend only.** Cloudflare Workers. OAuth, webhook verification, Billing
  API calls, GraphQL proxying, AI calls. No persistent server state.
- **Free tier must deliver real value alone.** Do not gate basic metrics behind paid tiers.
  Gate *history depth*, *automation*, *AI*, and *multi-store* — never the headline numbers.
- **Built for Shopify checklist compliance from day one.** Performance, accessibility, and
  security are not afterthoughts. We want the BFS badge.
- **Horizontal, not vertical.** No vertical-specific features in Phase 1. Every merchant
  regardless of industry should get value on first install.

## Architecture

```
Shopify Store
   |
   +-- Embedded admin app (App Bridge + Polaris React)
   |     - Dashboard UI, date range picker, metric cards, charts
   |
   +-- Stateless backend (Cloudflare Workers + Hono)
   |     - /auth/install, /auth/callback     OAuth flow
   |     - /webhooks/*                       HMAC-verified webhooks
   |     - /api/metrics/*                    GraphQL proxy + transforms
   |     - /api/billing/*                    Billing API (Phase 2)
   |     - /api/ai/*                         Claude API (Phase 3)
   |
   +-- Shop metafields (namespace: firstbridge_analytics)
         - config.preferences        user prefs (date range, currency, layout, dismissals)
         - cogs.meta                 pointer record: totalCount, shardCount, defaultMarginPct,
                                     lastWriteAt, currency_code (small, read first per request)
         - cogs.index                Free-tier COGS blob: ≤20 entries in one ~5KB metafield
         - cogs.shard.{n}            Pro-tier COGS shards: ≤200 entries each, n in 0..49
         - snapshot.daily            rolling 90-day metric cache (Phase 1.5)
         - snapshot.weekly           rolling 12-month aggregate (Phase 2)
         - plan                      DENORMALIZED CACHE ONLY — Billing API is the source of
                                     truth (see "Plan resolution" below). Free | Pro.
         - ai.last_summary           cached weekly brief (Phase 3)
```

### Plan resolution (R1.1)

The `plan` metafield is **not** the source of truth — it's writable by a determined
merchant via the Admin API. Plan is resolved per request like this:

1. **KV cache** (`BULK_OPS_KV`, key `plan:{shop_domain}`, 30-second TTL). Hit → return.
2. **Billing API** — GraphQL `currentAppInstallation { activeSubscriptions { name status } }`.
   Plan is `"pro"` if any subscription has `status === "ACTIVE"` and a Pro-named tier;
   otherwise `"free"`.
3. Write back to KV (TTL 30s) and to the metafield (best-effort, for display only).

Webhooks `app_subscriptions/update` and `app/uninstalled` invalidate the KV cache
(HMAC-verified first). The webhook re-cache uses the payload directly, since we don't
persist offline tokens.

### Why metafields for storage

- 10MB per namespace, 64KB per metafield value, JSON allowed.
- Partition snapshots: one metafield per metric per period (e.g., `snapshot.revenue.2026-04`).
- Free, durable, scoped per shop, accessible from both backend and embedded UI.
- Migrating away later (if ever needed) is straightforward: snapshots are already structured.

### Why Cloudflare Workers

- **Cost match for our workload.** Most backend requests proxy Shopify GraphQL — wall time
  is dominated by network I/O. Workers bill *CPU time*, not wall time, so I/O-heavy traffic
  is much cheaper than Vercel's per-invocation + GB-hour model. At 50M req/mo a Shopify
  analytics workload is ~$17/mo on Workers vs ~$180+/mo on Vercel Pro.
- **No egress fees.** Predictable cost as installs grow.
- **$5/mo paid plan** vs Vercel Pro's $20/seat — important for a freemium app.
- **Edge deployment** lowers latency for global Shopify merchants without extra config.
- **Workers KV** is purpose-built for the one ephemeral-state need we have (bulk operation
  polling cursors), included in the $5 plan with a generous free tier.
- We use raw `fetch` + JWT verify + HMAC verify (all native on Workers); we do not depend
  on `@shopify/shopify-api`'s Node-only helpers.

## Tech Stack (proposed)

- **Frontend:** React + TypeScript, Shopify App Bridge, Polaris React, Recharts (or Polaris
  Viz when stable). Vite for bundling.
- **Backend:** TypeScript on Cloudflare Workers, Hono as the request router. Hono apps
  are testable independent of the Workers runtime via `app.request()`.
- **Shopify integration:** Hand-rolled, Web Crypto-only helpers — JWT (HS256) verify for
  App Bridge session tokens, HMAC-SHA256 for OAuth callback (hex) and webhooks (base64),
  Token Exchange and Authorization-Code Grant via raw `fetch`. We deliberately avoid
  `@shopify/shopify-api` so the bundle stays small and Workers-native.
- **AI (Phase 3):** `@anthropic-ai/sdk`, Claude Sonnet 4.6, **prompt caching enabled** on
  system prompt + dashboard schema (most tokens are cacheable across stores).
- **Testing:** Vitest for unit/integration, Playwright for embedded-app E2E.
- **Lint/format:** ESLint + Prettier with Shopify's recommended config.

## Repository Layout (current)

```
fbc-shopify/
  app/                                  embedded admin app (React + Polaris + App Bridge)
    src/
      main.tsx                          ReactDOM root + Polaris AppProvider
      App.tsx                           Polaris Page shell
      pages/Dashboard.tsx               overview grid + range picker + skeletons + banners
      components/MetricCard.tsx         label + value + delta badge
      components/RangePicker.tsx        Polaris Select wrapping DateRangePreset
      components/ReturnReasonsBreakdown.tsx  return-reasons donut chart panel
      components/charts/                Recharts wrappers (lazy-loaded, own bundle chunk)
        RevenueOrdersChart.tsx          dual-axis revenue + orders time-series
        DowChart.tsx                    sales by day-of-week bar chart
        MarginTrendChart.tsx            gross margin % trend
        ReturnRateTrendChart.tsx        return rate trend
      hooks/useReturnReasons.ts         SWR-style hook for /api/metrics/returns/reasons
      lib/app-bridge.ts                 window.shopify.idToken() helper
      lib/api.ts                        Bearer-authed fetch wrapper, ApiError
      lib/format.ts                     money/number/delta-pct formatting
      lib/chart-theme.ts                Recharts color palette + axis formatter helpers
      lib/rolling-average.ts            3-point rolling average for noisy series
      vite-env.d.ts                     VITE_BACKEND_URL typing
    index.html                          loads app-bridge.js from cdn.shopify.com
    vite.config.ts                      port 5173, /api proxy to :8787, recharts manualChunk
    tsconfig.json
    package.json
  backend/                              stateless API (Cloudflare Workers + Hono)
    src/
      index.ts                          Worker entry — `export default { fetch: app.fetch }`
      app.ts                            Hono app factory; mounts /auth, /webhooks, /api/metrics
      env.ts                            Env type (vars + secrets + ENVIRONMENT flag)
      routes/
        auth.ts                         /auth/install, /auth/callback (managed-install fallback)
        webhooks.ts                     /webhooks/compliance, /webhooks/app/uninstalled
        metrics.ts                      /api/metrics/overview (session-token guarded)
        metrics-returns.ts              /api/metrics/returns/* (by-product, net-revenue, reasons, resolution)
      middleware/
        auth.ts                         verify JWT → token-exchange → attach GraphQL client
      shopify/
        session-token.ts                HS256 JWT verify, claim checks, shop derivation
        token-exchange.ts               OAuth 2.0 token-exchange grant (online or offline)
        oauth.ts                        install URL, callback HMAC verify (hex), code-for-token
        webhook-verify.ts               base64 HMAC verify on raw body
        graphql-client.ts               typed Admin API client; verbose errors in dev only
        shop-domain.ts                  *.myshopify.com regex guard
      metafields/client.ts              read/write/delete via metafieldsSet (idempotent)
      metrics/
        date-range.ts                   resolve DateRangePreset → UTC start/end
        queries.ts                      GraphQL: orders (ORDERS_OVERVIEW_QUERY) + lightweight ORDERS_RETURNS_QUERY
        orders-fetch.ts                 shared pagination loop (PAGE_SIZE=250, MAX_PAGES=10)
        history-clamp.ts                90-day Free plan history clamp helper
        overview.ts                     BigInt minor-unit aggregation w/ comparison; net revenue = totalPriceSet − totalRefundedSet
        profit.ts                       gross profit, margin, top products, COGS coverage
        timeseries.ts                   time-series + DoW bucketing for all dashboard charts
        returns-by-product.ts           top returned products via refund line items
        returns-reasons.ts              return reason breakdown (requires read_returns scope)
        returns-resolution.ts           refund bucket breakdown (cash_refund, Phase 1)
      lib/
        logger.ts                       PII/secret-redacting JSON logger
        errors.ts                       HttpError + Unauthorized/Forbidden/BadRequest/Upstream
        crypto.ts                       Web Crypto helpers (HMAC, base64url, timing-safe eq)
    wrangler.toml                       Workers config (vars + KV binding + ENVIRONMENT=production)
    tsconfig.json
    package.json
  shared/
    src/index.ts                        wire-contract types: Money, DateRange, Overview, Plan,
                                        PendingReturns, ReturnsByProduct, ReturnReasons,
                                        ReturnResolution, TimeSeriesPoint, DowPoint, Granularity, …
    tsconfig.json
    package.json
  shopify.app.toml                      app handle, scopes (incl. read_returns), redirect URLs
  package.json                          pnpm workspaces root, dev/build/test scripts
  .gitignore  .npmrc  README.md  CLAUDE.md
  .claude/
    agents/                             shopify-architect, shopify-builder, shopify-reviewer
    settings.local.json                 permissions
```

## Current Implementation State

What ships in the repo right now:

- **Auth model is fully stateless.** Every embedded request carries an App Bridge JWT;
  the backend verifies it (HS256) and exchanges it for a fresh online Admin API access
  token via Shopify's Token Exchange grant. **No access tokens are persisted anywhere.**
  The classic OAuth `/auth/install` + `/auth/callback` routes exist as a fallback for
  direct-link installs but do not store the offline token they receive.
- **Webhooks.** All webhook handlers HMAC-verify before doing anything. Implemented:
  - `/webhooks/compliance` (`customers/data_request`, `customers/redact`, `shop/redact`)
    — Phase 1 holds zero merchant PII, so these acknowledge.
  - `/webhooks/app/uninstalled` — clears all shop-scoped KV keys (`plan:{shop}`, any
    `bulk:{shop}:*` cursors). Shopify auto-removes app-owned metafields.
  - `/webhooks/app_subscriptions/update` (R1.1) — derives plan from the payload and
    re-caches in KV.
- **`/api/metrics/overview`** is wired end-to-end. Synchronously paginates orders for
  the requested date range (PAGE_SIZE=250, MAX_PAGES=10 → 2,500-order budget), aggregates
  in BigInt minor units, computes previous-period comparison deltas, and returns a typed
  `OverviewMetrics & { truncated: boolean }`. The dashboard surfaces a "partial results"
  banner when truncated. Phase 1.5 will swap the synchronous path for bulk operations +
  KV-cached polling cursor when ranges exceed the budget.
  - **Revenue is always `totalPriceSet − totalRefundedSet`.** Shopify's `currentTotalPriceSet`
    does not reliably reflect manual refunds; the explicit subtraction is the source of truth.
    This field is fetched in `ORDERS_OVERVIEW_QUERY` and used across `overview.ts` and
    `timeseries.ts`.
  - **Time-series and DoW charts** are computed server-side in `metrics/timeseries.ts` and
    returned as `TimeSeriesPoint[]` arrays on every overview and profit response. The frontend
    renders them with Recharts (lazy-loaded into its own bundle chunk via Vite `manualChunks`).
- **`/api/metrics/profit`** (R1) returns gross revenue, gross profit, margin %,
  profit-per-order, top 10 profitable products (product-level), `cogsCoverage` breakdown
  (explicit / default-margin / no cost), and previous-period comparison. Reuses the
  overview's order pagination — no second Admin API pass. Free plan clamps `from/to` to
  90 days and surfaces `historyClampedTo` on the response.
- **`/api/metrics/returns/*`** — four endpoints for returns analytics:
  - `GET /by-product` — top returned products ranked by refunded unit count, sourced
    from `refunds[].refundLineItems` (not the Returns API, so no extra scope needed).
  - `GET /net-revenue` — current-period revenue with pending-return value flagged as
    at-risk (`returnStatus: RETURN_REQUESTED | IN_PROGRESS`).
  - `GET /reasons` — return reason breakdown from `Order.returns` (requires `read_returns`
    scope; returns `{ scope_missing: true }` gracefully if scope is absent).
  - `GET /resolution` — refund bucket mix (Phase 1: all cash_refund; exchange detection
    queued for Phase 2 when `Refund.transactions` becomes available via API).
  - The reasons endpoint uses a dedicated lightweight `ORDERS_RETURNS_QUERY` (kept under
    Shopify's 1,000-point cost ceiling); all other returns endpoints reuse the shared
    `ORDERS_OVERVIEW_QUERY` via `fetchOrdersForRange`.
- **`/api/cogs`** (R1) — `GET ?cursor=&query=`, `POST /upsert`, `DELETE /:variantId`,
  `PATCH /default-margin`, **`GET /export`** (CSV), **`POST /import`** (CSV merge upsert,
  partial-success on Free 20-cap, idempotent). All JWT-authed.
- **`/api/preferences`** (R1.2) — small key/value store backed by `config.preferences`
  metafield. Used for dismissible UI banners (e.g. `cogsBackupTipDismissed`).
- **Plan resolution** (R1.1) — KV cache → Billing API → metafield write-back. Source of
  truth is `currentAppInstallation.activeSubscriptions`; the metafield is a denormalized
  display cache only. KV cache TTL 30s, invalidated by webhooks.
- **Settings page** with Polaris `IndexTable` for COGS, inline cap banner on Free
  (no upsell modal), default-margin field, variant search Combobox, "Backup & restore"
  card with CSV export/import (DropZone, ≤1MB), and a dismissible "back up your costs"
  tip banner shown when COGS entries exist.
- **Dashboard** renders profit cards, top profitable products, COGS coverage banner,
  returns analytics panels, and interactive Recharts charts alongside the overview metrics.
- **Verbose GraphQL errors in development.** `makeGraphQLClient` accepts a `verbose` flag
  (set from `env.ENVIRONMENT === "development"`). In dev the full Shopify error message
  is surfaced to the caller; in production only a generic "GraphQL error" is returned.
- **Metafields used at runtime:** `plan` (denormalized cache), `cogs.meta`, `cogs.index`,
  `cogs.shard.*`, `config.preferences`. Snapshot metafields are still queued for Phase 1.5.
- **Money math.** Aggregation uses BigInt minor units derived from Shopify's decimal
  string amounts. We never hold a money value as a JS `number`.
- **Tests:** 76 backend Vitest tests passing (`metrics/profit`, `metrics/timeseries`,
  `metrics/returns-*`, `cogs/store`, `routes/cogs`, `plan/get-plan`); 7 app Vitest tests
  passing (`format`). Playwright specs are stubbed but `test.skip`'d — `@playwright/test`
  is not yet a dep.

### Operational follow-ups before production deploy

- **`wrangler.toml` KV namespace IDs are placeholders.** Run
  `wrangler kv namespace create BULK_OPS_KV` (and the `--preview` variant) and paste the
  resulting IDs in. The namespace is shared between bulk-op cursors (`bulk:*` keys) and
  plan cache (`plan:*` keys).
- **Webhook subscriptions** (`app_subscriptions/update`, `app/uninstalled`, the three
  GDPR ones) are registered post-OAuth-callback. Verify they appear in the Partner
  dashboard after a clean install on a dev store.

### Phase 1.5 (queued, not yet built)

- Bulk operations path for ranges exceeding the synchronous budget.
- Top products by revenue, traffic sources, inventory at risk, new vs returning panels.
- Per-shop timezone handling (currently ranges align to UTC days).
- Auto-import COGS from Shopify's `inventoryItem.unitCost` as a one-time bootstrap.
- Variant-level (rather than product-level) ranking on Top Profitable Products as a
  Pro view.
- Playwright tooling installed and the existing E2E specs un-skipped.

## Conventions

- **TypeScript strict mode everywhere.** No `any` without a `// eslint-disable-next-line`
  comment explaining why.
- **GraphQL queries live in `.graphql` files** (or co-located `.ts` with `gql` template tag),
  never inline string-concatenated.
- **Webhooks must verify HMAC before doing anything else.** Helper in `backend/src/shopify/`.
- **Never log access tokens, customer PII, or order details.** Logging helpers redact.
- **Metafield writes are idempotent.** Always upsert (set), never assume existence.
- **Date handling:** all internal timestamps are UTC ISO strings; convert to shop timezone
  only at the UI layer.
- **Money:** store as { amount: string, currency_code: string } pairs everywhere — never
  bare numbers — to match Shopify's GraphQL types.
- **No telemetry / analytics on the merchant by default.** Privacy is part of the value prop.

## Development Practices

### Separation of Concerns
- Each module does one thing: route handlers validate + delegate; transformers aggregate;
  formatters format. Never mix concerns in the same file.
- Backend route files own only request parsing, auth checks, and response shaping —
  business logic lives in `metrics/` or `lib/`.
- Frontend pages own layout and state orchestration; extract data-fetching into custom
  hooks (`hooks/`) and presentation into components (`components/`).

### File Size & Module Boundaries
- **Aim for ≤200 lines per file.** When a file grows past that, split it along its natural
  seams (e.g. `timeseries.ts` → `timeseries-buckets.ts` + `timeseries-format.ts`).
- One exported "thing" per file is the default. Multiple small exports in one file are fine
  when they are tightly coupled; unrelated helpers must live in separate modules.
- Every new module gets its own Vitest test file.

### Constants
- Magic numbers and magic strings are forbidden. Name every threshold, limit, and sentinel:
  ```ts
  // backend/src/metrics/orders-fetch.ts
  const PAGE_SIZE = 250;
  const MAX_PAGES = 10; // 2,500-order synchronous budget
  ```
- Plan limits (`FREE_COGS_CAP = 20`, `FREE_HISTORY_DAYS = 90`) live in `shared/src/index.ts`
  so frontend and backend stay in sync.
- HTTP status codes use named constants from `lib/errors.ts`, not bare numbers.

### Performance
- **Avoid redundant Admin API calls.** The overview and profit endpoints share one paginated
  order fetch; returns endpoints that can reuse those orders do so.
- **Aggregate in BigInt on the server; send formatted strings to the client.** Never send
  raw minor-unit integers across the wire.
- **Lazy-load heavy UI chunks.** Recharts is split into its own Vite chunk via `manualChunks`;
  apply the same pattern to any new chart library or large dependency.
- **Cap unbounded loops.** Every pagination loop must have a `MAX_PAGES` guard. Document the
  maximum record count the cap implies.
- **Memoize expensive derived values** in React components with `useMemo`; stabilise
  callbacks with `useCallback` when passed to child components that use `React.memo`.

### Exception Handling & Logging
- All errors must be instances of typed classes from `lib/errors.ts`
  (`HttpError`, `Unauthorized`, `Forbidden`, `BadRequest`, `Upstream`). Never throw plain
  `Error` objects from route or metric code.
- Catch at the boundary (Hono route handler or top-level hook); let typed errors propagate
  naturally below that boundary.
- Every `catch` block must either re-throw a typed error or log + return a structured error
  response. Silent swallowing is forbidden.
- Use the PII-redacting logger in `lib/logger.ts` everywhere — never `console.log` in
  production code.
- Log at the right level: `info` for lifecycle events, `warn` for recoverable anomalies
  (e.g. partial results), `error` for unexpected failures. Include `shop` and `requestId`
  on every log line.
- Frontend API errors surface via `ApiError` (from `lib/api.ts`); components must handle
  error state visibly (Polaris `Banner` with status `critical`) — no silent failures.

### UI & Usability
- **Polaris first.** Use Polaris components for every UI element; custom CSS is a last
  resort and must be scoped.
- **Skeleton states for every async load.** No blank panels while data fetches.
- **Inline feedback, not modals.** Errors, warnings, and limit banners appear inline near
  the relevant control — never as blocking modals (except destructive-action confirmation).
- **Progressive disclosure.** Show the headline number first; reveal detail on demand
  (expand / tooltip / drawer). Keep the default view scannable in under 10 seconds.
- **Accessible by default.** All interactive elements need ARIA labels; colour is never the
  only visual indicator; focus management follows Polaris conventions.
- **Empty states must explain the next action.** An empty chart or table must tell the
  merchant why it is empty and what to do (e.g. "No orders in this date range — try
  expanding the range").
- **Date ranges update immediately** (optimistic UI with loading indicator); never require
  a separate "Apply" button.

## Testing Expectations

- Every metric transformer (`backend/src/metrics/*`) needs unit tests with realistic GraphQL
  fixtures.
- OAuth flow + webhook HMAC have integration tests that reject tampered payloads.
- Embedded app pages have at least one Playwright smoke test (dashboard loads, date range
  changes, snapshot displays).
- Tests run in CI before any deploy.

## Build for Shopify Checklist (track from day one)

- [ ] Performance: Lighthouse >= 90 on embedded app  *(awaiting first deploy)*
- [x] Polaris components only for admin UI  *(Page, Card, Grid, Banner, Select, Badge, Skeleton)*
- [x] App Bridge for navigation, toasts, modals  *(NavMenu + Toast wired; idToken on every request)*
- [x] OAuth + session token auth, no API key in frontend  *(Token Exchange per request)*
- [x] GDPR webhooks (customers/redact, customers/data_request, shop/redact) implemented
- [x] Mandatory webhooks: app/uninstalled
- [ ] Privacy policy + support contact on listing
- [ ] Onboarding: <60 seconds from install to first dashboard view  *(measure post-deploy)*

## Working Style with Claude Code

- This project has dedicated agents under `.claude/agents/`. Use them for their specialty:
  - `shopify-architect` — design decisions, GraphQL schema choices, metafield partitioning
  - `shopify-builder` — implementation of features end-to-end
  - `shopify-reviewer` — pre-merge code review against BFS + this CLAUDE.md
- Agent autonomy is intentionally high. The user wants to be unblocked, not consulted on
  every step. Default to acting; pause only for irreversible / external / cost-incurring
  decisions (production deploys, paid API keys, app store submission, billing changes).

## Out of Scope (Phase 1)

- Subscriptions, reviews, email/SMS marketing, loyalty — different apps, different products.
- Multi-store / agency dashboards (Phase 2 at earliest).
- Mobile app or POS extensions.
- Theme app extensions (storefront widgets) — possible Phase 2 if data-driven.
