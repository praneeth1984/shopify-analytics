Deploy the FirstBridge Analytics app to production.

## What this does

Runs the full production deployment in order:
1. Full test suite (abort on failure)
2. D1 migrations — apply any pending migrations to `firstbridge-db` (remote)
3. Backend — Cloudflare Worker (`firstbridge-analytics-api`)
4. Frontend — Vite production build + Cloudflare Pages (`firstbridge-analytics`)
5. Shopify app config — syncs `shopify.app.toml` to the Partner dashboard

## Infrastructure

| Service  | URL                                                                 |
|----------|---------------------------------------------------------------------|
| Backend  | https://firstbridge-analytics-api.firstbridgeconsulting.workers.dev |
| Frontend | https://firstbridge-analytics.pages.dev                             |

Secrets are already set in the Worker via `wrangler secret put`. `wrangler` is local to
`backend/node_modules/.bin/wrangler`.

## Steps to execute

Run all of these from the repo root (`/home/praneeth/personal-projects/fbc-shopify`).

### 1. Tests — abort if any fail

```bash
pnpm test
```

### 2. D1 migrations — apply before deploying the Worker

Migrations must land before the new Worker code does, so the tables exist when the first
request hits the new code. This command is idempotent — already-applied migrations are
skipped automatically.

```bash
cd backend && ./node_modules/.bin/wrangler d1 migrations apply firstbridge-db --remote
```

If this fails, **abort the deploy** — the new Worker code may reference tables that don't
exist yet.

### 3. Deploy backend

```bash
cd backend && ./node_modules/.bin/wrangler deploy
```

Verify the response shows `Deployed firstbridge-analytics-api` and a version ID.

### 4. Build frontend

The Shopify API key (`client_id` in `shopify.app.toml`) is a public identifier — embed it at
build time. The `VITE_BACKEND_URL` is already in `app/.env.production`.

```bash
VITE_SHOPIFY_API_KEY=da5013ca68c07cace1f4bb8570b20af0 pnpm --filter @fbc/app build
```

This runs `tsc -b && vite build` and writes output to `app/dist/`.

### 5. Deploy frontend to Cloudflare Pages (production branch)

```bash
cd backend && ./node_modules/.bin/wrangler pages deploy ../app/dist \
  --project-name firstbridge-analytics \
  --branch main
```

`--branch main` targets the production deployment (canonical URL). Without it wrangler
creates a preview-only deployment.

### 6. Sync Shopify app config

Pushes `shopify.app.toml` (scopes, redirect URLs, webhook subscriptions, app URL) to the
Partner dashboard. Required whenever `shopify.app.toml` changes; safe to run on every
deploy (idempotent).

```bash
shopify app deploy --allow-updates
```

`--allow-updates` makes it non-interactive (adds/updates config without prompting).
It will NOT remove anything — use `--allow-deletes` only if you intentionally removed
scopes or webhooks and want Shopify to reflect that.

### 6. Smoke check

```bash
curl -s -o /dev/null -w "%{http_code}" https://firstbridge-analytics-api.firstbridgeconsulting.workers.dev/health
curl -s -o /dev/null -w "%{http_code}" https://firstbridge-analytics.pages.dev
```

Both must return `200`. Report the Worker version ID, Pages deployment URL, and whether
the Shopify config deploy succeeded to the user.
