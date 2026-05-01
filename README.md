# FirstBridge Analytics

A freemium Shopify analytics app by [FirstBridge Consulting](https://firstbridgeconsulting.com).

> Most Shopify stores have no dedicated analytics app. Triple Whale and friends are powerful
> but expensive. FirstBridge Analytics fills the gap with a useful free tier and predictable
> pricing.

See [CLAUDE.md](./CLAUDE.md) for the full product brief, architecture, and conventions.

## Workspaces

- `app/` — Embedded admin UI (React + Vite + App Bridge + Polaris).
- `backend/` — Stateless API (Cloudflare Workers + Hono).
- `shared/` — TypeScript types shared between app and backend.

## What ships today

| Feature | Status | Endpoints |
|---|---|---|
| Headline overview (revenue, orders, AOV, customers) + range picker | ✅ | `GET /api/metrics/overview` |
| **Interactive charts** (revenue/orders over time, day-of-week, margin trend, return rate) | ✅ | included in overview + profit responses |
| **Profit dashboard** (gross profit, margin %, profit/order, top products, coverage) | ✅ R1 | `GET /api/metrics/profit` |
| **Manual COGS entry** (20-SKU cap on Free, default margin %, variant search) | ✅ R1 | `GET/POST/DELETE/PATCH /api/cogs` |
| **CSV export/import for COGS** | ✅ R1.2 | `GET /api/cogs/export`, `POST /api/cogs/import` |
| **Plan resolution from Billing API + 30s KV cache** | ✅ R1.1 | invalidated by `app_subscriptions/update` webhook |
| **Returns analytics** (top returned products, net revenue, return reasons, resolution mix) | ✅ | `GET /api/metrics/returns/*` |
| Cohort + LTV (R2) | ⏳ next | |
| Live "today" pulse (R3) | ⏳ | |
| Inventory at risk (R4) | ⏳ | |
| Pinned tiles (R5) | ⏳ | |

## Storage philosophy

This app does not use a database. Configuration, COGS entries, and metric snapshots live
in shop metafields under namespace `firstbridge_analytics`. Plan is derived from
Shopify's Billing API (`currentAppInstallation.activeSubscriptions`) with a 30-second
Workers KV cache; the metafield is a denormalized display cache only.

See [CLAUDE.md](./CLAUDE.md) for why and how.

## Local development

```bash
pnpm install
pnpm dev
```

The backend runs on `wrangler dev` (port 8787). The embedded app runs on Vite (port 5173).
Use the Shopify CLI to tunnel and serve the embedded app inside a development store.

### One-time setup before first `wrangler dev`

```bash
# Create the KV namespace used for plan cache + bulk-op cursors
wrangler kv namespace create BULK_OPS_KV
wrangler kv namespace create BULK_OPS_KV --preview
# Paste the returned IDs into backend/wrangler.toml in place of the TBD- placeholders
```

You'll also need these secrets set in `wrangler` for `wrangler dev` to work end-to-end
against Shopify:

```bash
wrangler secret put SHOPIFY_API_KEY
wrangler secret put SHOPIFY_API_SECRET
```

## Testing

### Automated tests

```bash
# All workspaces
pnpm -r typecheck
pnpm -r test

# Just backend (76 Vitest tests covering overview, profit, timeseries, returns-*, COGS, plan)
pnpm --filter @fbc/backend test

# Just app (7 Vitest unit tests for formatting helpers)
pnpm --filter @fbc/app test
```

Playwright E2E specs in `app/tests/` are currently `test.skip`'d — `@playwright/test`
isn't a dep yet. Wiring it up is a tracked follow-up.

### Manual testing of R1 + R1.1 + R1.2 in a dev store

These steps assume you have a Shopify Partner dev store. Substitute your own store URL
and tunnel host throughout.

**Step 1 — Boot dev servers and tunnel.**

```bash
pnpm dev                                  # backend on :8787, app on :5173
shopify app dev --store=<your-dev-store>  # tunnels and installs the app embedded
```

**Step 2 — Verify the dashboard loads (existing overview).**

Open the embedded app from your dev store admin. You should see Polaris cards for
revenue, orders, AOV, and customers, plus a date-range picker. With no orders, all
cards render `$0` / `0` and an empty-state. Add a few test orders via Shopify admin
("Draft order" → "Mark as paid") and refresh — the cards should update.

**Step 3 — Test COGS entry (R1).**

1. Click **Settings** in the App Bridge nav (top of the embedded admin).
2. Use the variant search to find a product. Enter a cost in the cost cell.
   - The status badge should flip from "Not set" to "Set".
   - Watch the network tab: `POST /api/cogs/upsert` should return 200 with the new
     index summary.
3. Set a default margin % (top of the page). The field debounces; the network tab
   should show `PATCH /api/cogs/default-margin`.
4. Return to **Dashboard**. Profit cards should now show non-zero numbers if there are
   orders for the variants you entered. The COGS coverage banner shows "explicit cost
   for X% of order value, default margin for Y%" if both are in play.

**Step 4 — Test the 20-SKU Free cap (R1).**

Enter costs for 20 different variants. On the 21st:
- The save call returns `409 COGS_CAP_EXCEEDED` with `{ cap: 20, used: 20, plan: "free" }`.
- The Settings page renders an inline `Banner` (not a modal) explaining that Pro
  removes the cap.
- Existing entries remain editable; only *new* variantIds are blocked.

To simulate Pro for testing without going through Billing, write the metafield
manually via GraphiQL on your dev store:

```graphql
mutation {
  metafieldsSet(metafields: [{
    ownerId: "gid://shopify/Shop/<your-shop-id>",
    namespace: "firstbridge_analytics",
    key: "plan",
    type: "single_line_text_field",
    value: "pro"
  }]) { metafields { id } userErrors { field message } }
}
```

**Important:** because R1.1 makes Billing API the source of truth, this metafield
override only works for **30 seconds** before the KV cache expires and the resolver
re-queries Billing API. To do real Pro testing, create a real (test-mode) subscription
via `appSubscriptionCreate`. For most local testing, 30 seconds is enough to verify the
Pro path renders correctly.

**Step 5 — Test the 90-day Free history clamp (R1).**

In the date-range picker, choose a range older than 90 days (e.g. "Last 12 months" if
that preset exists, or pass a longer range via URL params if you've added them). The
profit response includes `historyClampedTo: { fromIso, toIso, reason: "free_plan_history_cap" }`,
and the Dashboard renders an inline banner explaining the cap.

**Step 6 — Test CSV export/import (R1.2).**

1. On Settings, click **Export to CSV** in the "Backup & restore" card.
   - File downloads as `firstbridge-cogs-<shop>-<YYYY-MM-DD>.csv`.
   - Open it: columns are `variant_id, sku, product_id, title, cost_amount, cost_currency, updated_at`.
2. Delete a few entries via the table.
3. Click **Import from CSV** → upload the file you just exported.
   - Toast shows "Imported N entries, skipped 0".
   - Table refreshes via `useCogs` and re-shows the deleted entries.
   - Run the import again — same final state (idempotent).
4. **Currency mismatch test:** edit the CSV to change `cost_currency` on one row to
   something other than your shop currency. Re-import. Toast should report that row as
   skipped with reason `currency_mismatch`.
5. **Free cap test (only meaningful on Free):** craft a CSV with >20 new variants.
   Import succeeds with partial-success: first 20 admitted, rest reported as `free_cap`
   skips. The response is `200`, not `409`.

**Step 7 — Test plan resolution (R1.1).**

Trigger Billing-API-driven Pro:

1. Use Shopify's Billing API in test mode to create a subscription
   (`appSubscriptionCreate` with `test: true`).
2. Approve the test charge in admin.
3. Shopify fires `app_subscriptions/update` to your tunnel's
   `/webhooks/app_subscriptions/update`. Watch backend logs for
   `webhook.app_subscriptions_update_cached`.
4. Reload the Settings page. The 20-SKU cap should now allow new entries; the cap
   banner should disappear.

Tamper test: write a fake `plan: "pro"` metafield manually (GraphiQL, see Step 4). Wait
30+ seconds, reload. The KV cache expires, the resolver queries Billing API, sees no
active subscription, and you're back to Free. The metafield's value is irrelevant —
the Billing API decides.

Uninstall test: uninstall the app from the dev store. Backend receives
`app/uninstalled`, HMAC-verifies, clears all `plan:{shop}` and `bulk:{shop}:*` KV keys.
Reinstall. Expect:
- Plan resolves to Free (default; no active subscription).
- All COGS data is gone (Shopify removes app-data metafields on uninstall — this is
  why R1.2 ships).
- The dismissible "back up your costs" banner re-appears once you re-enter COGS.

### Smoke checks before any deploy

```bash
pnpm -r typecheck   # all 3 workspaces
pnpm -r test        # 44 backend + 7 app, all passing
pnpm --filter @fbc/app build       # Vite production build
pnpm --filter @fbc/backend build   # tsc --noEmit on Workers entry
```
