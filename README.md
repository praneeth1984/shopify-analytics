# FirstBridge Analytics

A freemium Shopify analytics app by [FirstBridge Consulting](https://firstbridgeconsulting.com).

> Most Shopify stores have no dedicated analytics app. Triple Whale and friends are powerful
> but expensive. FirstBridge Analytics fills the gap with a useful free tier and predictable
> pricing.

See [CLAUDE.md](./CLAUDE.md) for the full product brief, architecture, and conventions.  
See [docs/PRD.md](./docs/PRD.md) for the full feature roadmap.

---

## Repository layout

```
fbc-shopify/
  app/        Embedded admin UI — React + Vite + App Bridge + Polaris
  backend/    Stateless API — Cloudflare Workers + Hono
  shared/     TypeScript types shared between app and backend
  docs/       PRD and other planning documents
```

---

## What ships today

| Feature | Status | Endpoint(s) |
|---|---|---|
| Overview metrics (revenue, orders, AOV, customers) + range picker | ✅ | `GET /api/metrics/overview` |
| Interactive charts (time-series, day-of-week, margin trend, return rate) | ✅ | included in overview + profit responses |
| Profit dashboard (gross profit, margin %, profit/order, top products) | ✅ | `GET /api/metrics/profit` |
| Manual COGS entry — 20-SKU cap on Free, default margin %, variant search | ✅ | `GET/POST/DELETE/PATCH /api/cogs` |
| CSV export/import for COGS | ✅ | `GET /api/cogs/export`, `POST /api/cogs/import` |
| Plan resolution via Billing API + 30s KV cache | ✅ | invalidated by `app_subscriptions/update` |
| Returns analytics (top returned products, net revenue, reasons, resolution) | ✅ | `GET /api/metrics/returns/*` |

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 | [nodejs.org](https://nodejs.org) |
| pnpm | ≥ 10 | `npm i -g pnpm` |
| Wrangler CLI | ≥ 3 | `pnpm add -g wrangler` |
| Shopify CLI | ≥ 3 | `npm i -g @shopify/cli` |

You also need:
- A **Shopify Partner account** at [partners.shopify.com](https://partners.shopify.com)
- A **development store** created under your Partner account
- A **Cloudflare account** (free tier is sufficient) — [dash.cloudflare.com](https://dash.cloudflare.com)

---

## One-time setup

### 1. Clone and install dependencies

```bash
git clone <repo-url> fbc-shopify
cd fbc-shopify
pnpm install
```

### 2. Create a Shopify app in the Partner dashboard

1. Go to **Partners → Apps → Create app → Create app manually**.
2. Set the app URL to `https://localhost` for now (the Shopify CLI will update it automatically when you run `shopify app dev`).
3. Add redirect URL: `https://localhost/api/auth/callback`.
4. Note your **API key** and **API secret** — you'll need them in the next step.
5. Under **App setup → Access scopes**, request:
   ```
   read_products, read_orders, read_customers, read_inventory, read_reports, read_returns
   ```
6. Update `shopify.app.toml` with your app's `client_id`.

### 3. Set backend secrets

```bash
cd backend

# Required for the auth flow and webhook verification
wrangler secret put SHOPIFY_API_KEY      # from the Partner dashboard
wrangler secret put SHOPIFY_API_SECRET   # from the Partner dashboard

# The public URL of your deployed Worker (set to localhost for local dev)
wrangler secret put SHOPIFY_APP_URL      # e.g. https://fbc-shopify-backend.<your-account>.workers.dev
```

For local development only, create `backend/.dev.vars` (gitignored):

```ini
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SHOPIFY_APP_URL=https://<your-tunnel-host>
ENVIRONMENT=development
```

### 4. Create the KV namespace

The KV namespace is used for the 30-second plan cache and bulk-operation cursors.

```bash
cd backend
wrangler kv namespace create BULK_OPS_KV
wrangler kv namespace create BULK_OPS_KV --preview
```

Copy the returned `id` and `preview_id` values into `backend/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "BULK_OPS_KV"
id = "<paste id here>"
preview_id = "<paste preview_id here>"
```

> **Note:** If you are using the main repo, the KV IDs in `wrangler.toml` already point to the project's Cloudflare account. A new contributor needs to create their own namespaces and replace these values.

### 5. Authenticate with Cloudflare

```bash
wrangler login
```

---

## Running locally

### Start both servers

```bash
# From the repo root — starts backend (Wrangler on :8787) and app (Vite on :5173) in parallel
pnpm dev
```

### Tunnel and embed inside a dev store

In a separate terminal, run the Shopify CLI. It tunnels your local servers and installs the app into your dev store:

```bash
shopify app dev --store=<your-dev-store>.myshopify.com
```

The CLI will:
- Start a public Cloudflare tunnel for the embedded app
- Inject `SHOPIFY_API_KEY` into the Vite dev server automatically
- Open a browser to your dev store admin

Once it's running, open **Apps → FirstBridge Analytics** in your dev store admin to see the embedded app.

### Port reference

| Service | Port | Notes |
|---|---|---|
| Vite (frontend) | 5173 | Proxies `/api/*` to `:8787` |
| Wrangler (backend) | 8787 | Cloudflare Workers runtime |

---

## Project scripts

Run from the repo root:

```bash
pnpm dev          # start backend + app in parallel (watch mode)
pnpm build        # production build for all workspaces
pnpm test         # run all Vitest tests
pnpm typecheck    # TypeScript strict-mode check across all workspaces
pnpm lint         # ESLint across all workspaces
```

Run for a specific workspace:

```bash
pnpm --filter @fbc/backend dev        # backend only
pnpm --filter @fbc/app dev            # frontend only
pnpm --filter @fbc/backend test       # backend tests only
pnpm --filter @fbc/app test           # frontend tests only
pnpm --filter @fbc/backend deploy     # deploy Worker to Cloudflare
```

---

## Testing

```bash
# All tests
pnpm test

# Backend — 76 Vitest tests (overview, profit, timeseries, returns, COGS, plan)
pnpm --filter @fbc/backend test

# Frontend — 7 Vitest unit tests (formatting helpers)
pnpm --filter @fbc/app test

# Watch mode (reruns on file change)
pnpm --filter @fbc/backend test:watch
```

> Playwright E2E specs in `app/tests/` are currently `test.skip`'d — `@playwright/test` is not yet a dependency. Wiring it up is a tracked follow-up.

### Smoke checks before any deploy

```bash
pnpm typecheck                          # strict TypeScript — all 3 workspaces
pnpm test                               # all tests passing
pnpm --filter @fbc/app build            # Vite production build
pnpm --filter @fbc/backend build        # wrangler dry-run (tsc + bundle check)
```

---

## Deploying

The app has two independently deployed services:

| Service | Platform | URL |
|---|---|---|
| Backend | Cloudflare Workers | `https://firstbridge-analytics-api.firstbridgeconsulting.workers.dev` |
| Frontend | Cloudflare Pages | `https://firstbridge-analytics.pages.dev` |

> **Shortcut:** run `/deploy` inside Claude Code to execute all steps automatically.

### 1. Run tests (abort on failure)

```bash
pnpm test
```

### 2. Deploy the backend Worker

```bash
cd backend
./node_modules/.bin/wrangler deploy
```

### 3. Build the frontend

The Shopify API key (`client_id` in `shopify.app.toml`) is a public identifier — it must be
embedded at build time. `VITE_BACKEND_URL` is already set in `app/.env.production`.

```bash
VITE_SHOPIFY_API_KEY=da5013ca68c07cace1f4bb8570b20af0 pnpm --filter @fbc/app build
```

### 4. Deploy the frontend to Cloudflare Pages

```bash
cd backend
./node_modules/.bin/wrangler pages deploy ../app/dist \
  --project-name firstbridge-analytics \
  --branch main
```

`--branch main` targets the production deployment (canonical URL). Omitting it creates a
preview-only deployment at a temporary subdomain.

### 5. Sync Shopify app config

Pushes `shopify.app.toml` (scopes, redirect URLs, webhook subscriptions, app URL) to the
Partner dashboard. Required whenever `shopify.app.toml` changes; safe to run on every
deploy (idempotent).

```bash
shopify app deploy --allow-updates
```

`--allow-updates` is non-interactive and will not remove anything. Add `--allow-deletes`
only if you intentionally removed scopes or webhooks.

### 6. Smoke check

```bash
curl -s -o /dev/null -w "%{http_code}" https://firstbridge-analytics-api.firstbridgeconsulting.workers.dev/health
curl -s -o /dev/null -w "%{http_code}" https://firstbridge-analytics.pages.dev
```

Both should return `200`.

---

## Storage philosophy

This app uses no database. All configuration, COGS entries, and metric snapshots live in
shop metafields under namespace `firstbridge_analytics`. Plan is derived from Shopify's
Billing API (`currentAppInstallation.activeSubscriptions`) with a 30-second Workers KV
cache; the metafield is a denormalized display cache only.

See [CLAUDE.md](./CLAUDE.md) for the full architecture rationale.

---

## Simulating Pro plan locally

Because the Billing API is the source of truth, the `plan` metafield alone doesn't grant Pro.
For a quick local test (valid for ~30 seconds before the KV cache expires):

```graphql
# Run in GraphiQL on your dev store (Admin → Apps → GraphiQL)
mutation {
  metafieldsSet(metafields: [{
    ownerId: "gid://shopify/Shop/<your-shop-id>",
    namespace: "firstbridge_analytics",
    key: "plan",
    type: "single_line_text_field",
    value: "pro"
  }]) {
    metafields { id }
    userErrors { field message }
  }
}
```

For sustained Pro testing, create a test-mode subscription via `appSubscriptionCreate`
and approve it in the dev store admin.
