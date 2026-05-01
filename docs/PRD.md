# FirstBridge Analytics — Product Requirements Document

**Version:** 1.1  
**Date:** 2026-05-02  
**Model:** Freemium (Free + Pro). Free tier delivers real value alone; Pro unlocks depth, history, and automation.  
**Benchmarked against:** Better Reports ($19.90–299/mo), TrueProfit ($35–200/mo), Map My Customers ($9–49/mo)

---

## App Navigation Structure

All pages live in the Shopify embedded admin sidebar (`NavMenu`). Features are grouped by merchant job-to-be-done, not by implementation domain.

```
FirstBridge Analytics
│
├── Overview               ← existing dashboard (revenue, orders, AOV, charts)
│
├── Profit                 ← F09, F10, F11, F12, F14
│   ├── Dashboard          gross profit → net profit cards
│   ├── P&L Report         full line-item statement (F12)
│   └── Break-Even         calculator (F14)
│
├── Products               ← F08, F13, F15, F16, F17, F27
│   ├── Performance        net revenue + margin per product (F08, F13)
│   ├── Inventory          at-risk stock + velocity (F15)
│   ├── Affinity           frequently bought together + bundles (F16, F27)
│   └── Price Analysis     revenue by price band (F17)
│
├── Customers              ← F05, F06, F20, F21, F22, F23
│   ├── Overview           top customers + repeat rate (F05, F06)
│   └── Retention          cohort grid · LTV by cohort · RFM segments (F20, F21, F22)
│
├── Geography              ← F29 (new)
│   ├── Map                heat map of orders / revenue (Leaflet + OpenStreetMap)
│   └── Regions            table — country / state / city breakdown
│
├── Marketing              ← F04, F07
│   ├── Discounts          code performance (F07)
│   └── Payments           gateway mix + fee estimation (F04)
│
├── Reports                ← F01, F02, F03, F18, F19, F24, F25
│   ├── Export             CSV download for any panel (F01)
│   ├── Scheduled Digest   email automation (F18)
│   ├── Saved Views        bookmarked filter combinations (F19)
│   ├── Filters            tag + metafield filtering (F24)
│   └── Google Sheets      live sync (F25)
│
└── Settings               ← existing + F04 rates, F09 expenses, F11 shipping config
    ├── COGS               variant cost entry (existing)
    ├── Expenses           monthly ad spend + fixed costs (F09)
    ├── Shipping           cost estimation method (F11)
    ├── Gateways           payment fee rates (F04)
    └── Preferences        digest schedule, saved views, price bands, lead time
```

**Polaris implementation notes**
- Use `NavMenu` with `NavigationSection` groupings matching the tree above.
- Each leaf node is a separate React route (`/profit/pl`, `/customers/retention`, etc.).
- Phase 1.5 routes are wired immediately; Phase 2/3 routes are added as features ship — never show a nav item for an unbuilt page.
- Mobile: App Bridge handles the collapsed sidebar automatically; no custom mobile nav needed.

---

## Hard Constraints (from CLAUDE.md — never violate)

- No database. All config and snapshots live in Shopify metafields under `firstbridge_analytics`.
- Stateless Cloudflare Workers backend. No persistent server state.
- Free tier must deliver real value alone. Never gate headline numbers — gate history depth, automation, and multi-store.
- Built for Shopify compliance from day one.
- Horizontal only in Phase 1/2. No vertical-specific features.

---

## What Is Already Built (Baseline)

| Feature | Status |
|---|---|
| Overview metrics (revenue, orders, AOV, unique customers) with previous-period comparison | ✅ Shipped |
| Date range picker (7d, 30d, 90d presets) | ✅ Shipped |
| Gross profit, margin %, profit-per-order, top profitable products | ✅ Shipped |
| COGS entry per variant (20 SKU cap on Free), store-wide default margin % | ✅ Shipped |
| CSV export/import for COGS | ✅ Shipped |
| Returns analytics — by product, reasons, resolution, net-revenue at risk | ✅ Shipped |
| Revenue + orders time-series chart, DoW chart, margin trend, return rate trend | ✅ Shipped |
| 90-day history clamp on Free, partial-results banner above 2,500-order cap | ✅ Shipped |
| Plan resolution via Billing API → KV cache → metafield write-back | ✅ Shipped |

---

## Feature Index

| # | Feature | Nav Section | Phase | Tier |
|---|---|---|---|---|
| **Geography** | | | | |
| F01 | Geographic Analytics & Customer Map | Geography → Map + Regions | 1.5 | Free (country-level) / Pro (city-level heat map) |
| **Overview** | | | | |
| F02 | Year-over-Year Comparison | Overview | 1.5 | Free (90-day windows) / Pro (unlimited) |
| F03 | Custom Date Range Comparison | Overview | 1.5 | Free (≤90d) / Pro (unlimited) |
| F04 | CSV Export — All Dashboard Panels | Reports → Export | 1.5 | Free (90d, watermark) / Pro (unlimited, ZIP) |
| **Profit** | | | | |
| F05 | Net Profit with Manual Ad Spend & Custom Costs | Profit → Dashboard | 2 | Free (current + prev month) / Pro (full history) |
| F06 | Transaction Fee Auto-Calculation | Profit → Dashboard | 2 | Free |
| F07 | Shipping Cost Tracking | Profit → Dashboard | 2 | Free |
| F08 | Full P&L Report | Profit → P&L Report | 2 | Free (summary) / Pro (line-item drill-down, PDF) |
| F09 | Break-Even Order Volume Calculator | Profit → Break-Even | 2 | Free |
| **Products** | | | | |
| F10 | Net Revenue per Product (after refunds + COGS) | Products → Performance | 1.5 | Free (top 10) / Pro (all products) |
| F11 | Discount Code Performance | Marketing → Discounts | 1.5 | Free (top 10) / Pro (all codes) |
| F12 | Product-Level Net Profit Analytics | Products → Performance | 2 | Free (top 10) / Pro (all products) |
| F13 | Inventory Velocity & At-Risk Stock | Products → Inventory | 2 | Free (top 20 at-risk) / Pro (full list) |
| F14 | Product Affinity (Frequently Bought Together) | Products → Affinity | 2 | Free (top 20 pairs) / Pro (all pairs) |
| F15 | Price Point Analysis | Products → Price Analysis | 2 | Free |
| F16 | Bundling Insights | Products → Affinity | 3 | Pro |
| **Customers** | | | | |
| F17 | Top Customers by LTV | Customers → Overview | 1.5 | Free (top 10) / Pro (full list) |
| F18 | Repeat Purchase Rate & Time-to-Second-Order | Customers → Overview | 1.5 | Free |
| F19 | Cohort Retention Table | Customers → Retention | 3 | Free (headline % only) / Pro (full grid) |
| F20 | Customer LTV by Acquisition Month | Customers → Retention | 3 | Pro |
| F21 | RFM Customer Segmentation | Customers → Retention | 3 | Pro |
| F22 | Repeat Purchase Rate by First Product | Customers → Retention | 3 | Pro |
| **Marketing** | | | | |
| F23 | Payment Method Mix & Fee Estimation | Marketing → Payments | 1.5 | Free |
| **Reports** | | | | |
| F24 | Scheduled Email Digest | Reports → Scheduled Digest | 2 | Free (weekly, 1 recipient) / Pro (daily, 5 recipients) |
| F25 | Saved Report Views | Reports → Saved Views | 2 | Free (3 max) / Pro (unlimited) |
| F26 | Tag & Metafield Filtering | Reports → Filters | 3 | Free (tag only) / Pro (metafields) |
| F27 | Google Sheets Live Sync | Reports → Google Sheets | 3 | Pro |
| F28 | Multi-Currency Revenue Normalization | Overview / Settings | 3 | Pro |
| F29 | Weight-Based Shipping Cost Allocation | Settings → Shipping | 3 | Pro |

---

## Detailed Requirements

> **F01 — Geographic Analytics is the first feature to implement** (listed first below).  
> All remaining section headings use the Feature Index numbers from the table above for cross-reference.

---

### F01 — Geographic Analytics & Customer Map

**Goal:** A merchant sees where their orders and revenue come from on an interactive map and a sortable region table — for free, with no paid map API.

**User story:** "Map My Customers charges me $9/mo just to see a dot map of where my orders go. I need to see my top markets, find untapped regions, and decide where to run geo-targeted ads."

**Why this is free to build**
- **Leaflet.js** (MIT license) renders the map — zero cost, no API key needed.
- **OpenStreetMap tiles** (`tile.openstreetmap.org`) are free for reasonable usage under OSM's tile usage policy. For high-traffic stores, self-hosting tiles or switching to a free Stadia Maps / Carto tile URL requires no code change.
- **Shopify already returns coordinates:** `orders.shippingAddress.latitude` and `orders.shippingAddress.longitude` are native fields on the Admin GraphQL API — no geocoding API needed.
- **Country/state choropleth:** TopoJSON world and US-states datasets are public domain. D3.js (MIT) renders filled region maps client-side with no external calls.

**Acceptance criteria**

*Map view (Leaflet heat map)*
- Interactive world map rendered with Leaflet.js and `leaflet.heat` plugin (both MIT).
- Each order is a heat-map point at `(shippingAddress.latitude, shippingAddress.longitude)`. Heat intensity = order count at that coordinate cluster.
- Toggle: order count heat map ↔ revenue heat map (intensity weighted by `totalPriceSet.amount`).
- Zoom: world → country → state/province. Leaflet handles zoom natively.
- Click a cluster → popover showing: location name, order count, total revenue, AOV for that cluster.
- Date range picker at the top (same presets as dashboard). Map re-renders on range change.
- Free plan: country-level clustering only (points snapped to country centroid). Pro plan: full lat/lng precision + city-level clustering.

*Regions table (below the map)*
- Sortable table: Country / State/Province / City / Orders / Revenue / AOV / % of Total Revenue / Unique Customers.
- Country rows expand to show state breakdown; state rows expand to show city breakdown.
- Free plan: country and state rows. Pro plan: city-level rows.
- Search/filter: type a country or city name to filter the table.
- CSV export (F04 applies — free watermarked, Pro clean).

*Data sourcing*
- All geographic data comes from `orders.shippingAddress` — no billing address, no IP geolocation.
- Orders with no shipping address (digital products, in-store POS) are counted in a separate "No location" row at the bottom of the table — never silently dropped.
- Coordinates: use `shippingAddress.latitude` / `shippingAddress.longitude` when available. When null (common for manually entered addresses), fall back to country centroid only (no external API — use a bundled static centroid table for the ~250 ISO country codes).

*Performance*
- Coordinate data is aggregated server-side before returning to the frontend. The API returns a pre-clustered GeoJSON FeatureCollection, not raw order-level coordinates.
- Free plan: max 2,500 orders (existing order cap). Pro plan: bulk operations path for larger ranges.
- Leaflet map bundle is code-split into its own Vite chunk (`manualChunks: { 'leaflet': ['leaflet', 'leaflet.heat'] }`) — not loaded until the Geography page is visited.

*Privacy*
- Coordinates are aggregated to a minimum cluster radius before leaving the server — individual order addresses are never returned as raw lat/lng to the browser.
- Clustering radius: Free = country centroid; Pro = 0.1° grid (~11km). No individual home address is ever reconstructable from the data.

**Shopify API sources**
`orders.shippingAddress.city`, `orders.shippingAddress.province`, `orders.shippingAddress.countryCode`, `orders.shippingAddress.latitude`, `orders.shippingAddress.longitude`, `orders.totalPriceSet`, `orders.customer.id`.

**Dependencies (all free, no API key)**
- `leaflet` — MIT, ~42KB gzipped
- `leaflet.heat` — MIT, ~3KB gzipped
- `@types/leaflet` — dev only
- Static bundled file: ISO 3166 country centroid table (~15KB JSON, public domain)
- TopoJSON world dataset (for choropleth, optional enhancement) — public domain

**Tier:** Free (country + state table, country-level map clustering) / Pro (city-level table, full heat map precision, revenue heat map toggle)

**Out of scope**
- Live customer tracking or real-time order pings.
- Store locator or storefront embedding (different product).
- Routing or territory management (Map My Customers' CRM features — different app category).
- IP-based geolocation (shipping address only).
- Google Maps or Mapbox (paid APIs — deliberately excluded).

---

### F04 (Index) — CSV Export for All Dashboard Panels

**Goal:** A merchant can download the raw data behind any dashboard panel as a CSV at the current date range with one click.

**User story:** "I want to pull Shopify data into my own spreadsheet without paying $150/mo for Better Reports."

**Acceptance criteria**
- Every dashboard panel (overview, profit, returns, top products, repeat purchase, discount codes) exposes a Download CSV button in the panel header (Polaris `Button` with download icon, no modal).
- Backend route: `GET /api/metrics/{panel}/export?from=&to=&format=csv` returning `Content-Type: text/csv`.
- Filename: `firstbridge-{panel}-{shop}-{YYYY-MM-DD}.csv`.
- Money columns: two columns per money value — `amount` and `currency_code`. Never bare numbers.
- If the result was truncated (over 2,500-order cap), include a final commented row: `# partial results — capped at 2500 orders. Upgrade to Pro for full history.`
- Free plan: last 90 days max, CSV footer watermark `Generated by FirstBridge Analytics`.
- Pro plan: unlimited date range, no watermark, plus a "Download all panels as ZIP" button.
- Empty panel: download returns a CSV with headers only and a single comment row `# no data for this range`.

**Shopify API sources**
- Reuses existing order pagination (`fetchOrdersForRange`). No new GraphQL queries needed.

**Tier:** Free (90-day, watermarked) / Pro (unlimited, no watermark, ZIP)

**Out of scope:** XLSX or PDF export. Custom column selection. FTP/Drive delivery (that is F25).

---

### F02 — Year-over-Year Comparison

**Goal:** A merchant can compare any metric for a selected period against the same period in the prior year.

**User story:** "My business is seasonal. Comparing this November to last October is meaningless — I need November vs. November."

**Acceptance criteria**
- Date range picker adds a "Compare to" dropdown alongside the existing "vs. previous period" option. Options: Previous period (existing), Same period last year (new), Custom (F03).
- When "Same period last year" is selected, all metric cards show the YoY delta badge instead of period-over-period.
- Backend: existing comparison logic in `overview.ts` already supports arbitrary `comparisonFrom/comparisonTo` — the frontend just needs to pass `comparisonFrom = from − 365d`, `comparisonTo = to − 365d`.
- Charts: time-series chart overlays the prior-year line in a muted color when YoY is active.
- Free plan: YoY is available but clamped to 90-day windows on both current and comparison period.
- Pro plan: unlimited window for both periods.
- If the comparison period has no orders (new store), render a "No data for this period" placeholder — not a 0% badge.

**Shopify API sources:** Same as overview — second pass of `fetchOrdersForRange` for the YoY window.

**Tier:** Free (90-day windows) / Pro (unlimited)

**Out of scope:** More than two periods simultaneously. Rolling multi-year trend (that is a chart feature, separate PR).

---

### F03 — Custom Date Range Comparison

**Goal:** A merchant can compare any two arbitrary date ranges side-by-side.

**User story:** "How did the week after we launched our new product line compare to the week before?"

**Acceptance criteria**
- "Compare to" dropdown (from F02) includes a "Custom range" option that opens a second Polaris DatePicker.
- Both ranges are validated: end date must be after start date; ranges must not overlap; max 365-day span per range on Free.
- URL state: both ranges reflected in query params so the view is shareable.
- All metric cards and charts update to show custom range vs. custom comparison.
- Pro plan: no span limit.

**Shopify API sources:** Two calls to `fetchOrdersForRange`.

**Tier:** Free (≤90-day spans per range) / Pro (unlimited)

**Out of scope:** Three-way comparison. Named/saved comparisons (that is F19).

---

### F04 — Payment Method Mix & Fee Estimation

**Goal:** A merchant sees what percentage of revenue came through each payment gateway and an estimated processing fee total for the period.

**User story:** "I have no idea how much I'm paying PayPal vs Shopify Payments every month. I need to see it in one place."

**Acceptance criteria**
- New panel "Payment breakdown" showing a donut chart of order count and revenue % by gateway (`Shopify Payments`, `PayPal`, `Manual`, etc. — derived from `orders.paymentGatewayNames`).
- Below the donut: a table with columns — Gateway / Orders / Revenue / Est. Fees / Est. Net.
- Fee estimation: merchant configures their gateway rates on the Settings page. Defaults pre-filled: Shopify Payments 2.9% + $0.30 (Basic plan rate), PayPal 3.49% + $0.49. Merchant can override any rate.
- Fee rates stored in `config.preferences` metafield under `gatewayRates`.
- Estimated fees are clearly labelled as estimates with a tooltip: "Based on your configured rates. Actual fees may differ."
- No attempt to read real transaction fees from Shopify API (the `fees` field is not reliably populated across all gateways).
- Empty state: if merchant has only one gateway, render a single row table (no donut) with a note "Add a second payment method to see breakdown."

**Shopify API sources:** `orders.paymentGatewayNames`, `orders.totalPriceSet`.

**Tier:** Free

**Out of scope:** Actual fee reconciliation against real charges. Stripe-specific breakdown. Shopify Payments payout timing.

---

### F05 — Top Customers by LTV

**Goal:** A merchant sees their highest-value customers ranked by lifetime revenue, with order count and last order date.

**User story:** "I want to know who my best customers are so I can reach out personally or send them a VIP offer."

**Acceptance criteria**
- New panel "Top customers" showing a ranked table: Rank / Customer (masked email — first 2 chars + *** + domain) / Total revenue / Orders / AOV / Last order / Days since last order.
- Computed from the existing order pagination — no new API call.
- Free plan: top 10 customers for the selected 90-day window. Pro: full list, unlimited window, sortable by any column.
- No PII logged server-side. Email masking applied before returning from API.
- Export (F01) exports the masked email column — never the raw email.
- Empty state: fewer than 5 customers in range → "Not enough customers in this period to rank. Try a wider date range."

**Shopify API sources:** `orders.customer.id`, `orders.customer.email`, `orders.totalPriceSet`, `orders.createdAt`.

**Tier:** Free (top 10, 90-day) / Pro (full list, unlimited)

**Out of scope:** Customer contact/email-out functionality. Integration with Klaviyo or any ESP. Customer name display (masked email only for privacy).

---

### F06 — Repeat Purchase Rate & Time-to-Second-Order

**Goal:** A merchant sees what percentage of customers place a second order, and how long it typically takes.

**User story:** "Shopify's returning customer rate is broken and I need to know if my loyalty efforts are actually working."

**Acceptance criteria**
- New panel below the existing overview grid with three KPI cards:
  - **Repeat rate (90d):** % of first-time customers in the period who placed a 2nd order within 90 days.
  - **Median days to 2nd order:** median elapsed time between order 1 and order 2 for customers with ≥2 orders.
  - **Revenue from repeat customers:** % of period revenue from customers with ≥2 lifetime orders.
- Computed server-side by walking `customer.orders` for each customer whose first order falls in the selected range.
- Previous-period delta badge on the repeat rate KPI.
- Minimum data guard: if fewer than 20 first-time customers in range, render a notice "Need at least 20 first-time customers to compute a reliable rate" — no number shown.
- Pro plan additionally shows: a histogram of days-to-second-order (binned 0-7, 8-30, 31-60, 61-90, 90+) and the repeat rate broken down by acquisition channel (requires F24 for full channel depth, but `order.referringSite` is available without tags).

**Shopify API sources:** `orders.customer.id`, `orders.customer.createdAt`, `orders.createdAt`, `orders.referringSite`. Walks customer order history via `customer.orders` connection.

**Tier:** Free (headline KPIs) / Pro (histogram + channel breakdown)

**Out of scope:** Cohort retention grid (that is F20). Per-product repeat affinity (that is F23). Predictive LTV.

---

### F07 — Discount Code Performance

**Goal:** A merchant sees which discount codes drove orders, at what revenue, and whether those customers came back.

**User story:** "I run 20%-off promo codes constantly but I have no idea if they're attracting loyal customers or one-time discount hunters."

**Acceptance criteria**
- New panel "Discount performance" with a table: Code / Orders / Revenue / Avg discount % / Avg order value / Repeat customer rate for code users.
- Repeat customer rate per code: % of customers who used the code and placed at least one more order in the full dataset (not just the selected range). This requires walking `customer.orders` — compute alongside F06 if both are enabled.
- Computed from `orders.discountCodes` — an array per order.
- Orders with multiple codes: each code gets credit (not split). Note in UI: "Orders with multiple codes are counted once per code."
- Free plan: top 10 codes by order count, 90-day window. Pro: all codes, unlimited window, sortable, CSV export.
- Empty state: "No discount codes used in this period."
- Zero-code orders are excluded from this panel (they are not an error).

**Shopify API sources:** `orders.discountCodes`, `orders.customer.id`, `orders.totalPriceSet`, `orders.createdAt`.

**Tier:** Free (top 10, 90-day) / Pro (all codes, unlimited, sortable)

**Out of scope:** Discount code creation or management. Attribution across devices. Referral program tracking.

---

### F08 — Net Revenue per Product (After Refunds + COGS)

**Goal:** A merchant sees each product's true contribution — revenue minus refunds minus cost of goods — in a single view.

**User story:** "My best-selling product has a 30% return rate and thin margins. I need to see which products are actually making me money."

**Acceptance criteria**
- Extends the existing "Top profitable products" panel to include a column for net revenue (after refunds) alongside gross profit.
- Net revenue per product = sum(`lineItem.originalTotalPriceSet`) − sum(refunded amount attributed to that line item).
- Refund attribution: walk `order.refunds[].refundLineItems` and match by `lineItemId`. Partial refunds are pro-rated by units refunded.
- Gross profit per product = net revenue − (units sold × variant COGS). Reuses existing `profit.ts` logic.
- New sort options: sort by net revenue, gross profit, margin %, return rate %, units sold.
- Return rate % column per product: refunded units / total units sold.
- Free: top 10 products. Pro: all products, unlimited window.
- Empty COGS state: gross profit column shows "—" with a tooltip "Add COGS in Settings to see profit" — never shows $0 as if COGS = 0.

**Shopify API sources:** `orders.lineItems`, `orders.refunds.refundLineItems`, existing COGS from `cogs.index` / `cogs.shard.*` metafields.

**Tier:** Free (top 10) / Pro (all products, unlimited)

**Out of scope:** Variant-level ranking on Free (Pro-only). Ad spend attribution per product (that is F13). Shipping cost per product (that is F13).

---

### F09 — Net Profit with Manual Ad Spend & Custom Costs

**Goal:** A merchant enters monthly marketing spend and fixed costs; the dashboard shows net profit (gross profit − all expenses) and net margin %.

**User story:** "I know my gross margin but I have no idea what my actual take-home is after I pay for ads, apps, and shipping labels."

**Acceptance criteria**
- Settings page adds a "Costs & expenses" card. Monthly grid with rows: Meta Ads, Google Ads, TikTok Ads, Other Marketing, and a free-text "Other expenses" line (e.g. Shopify plan, apps, rent). One column per month displayed.
- Storage: one metafield per month, `firstbridge_analytics.expenses.YYYY-MM`, JSON `{ meta: number, google: number, tiktok: number, otherMarketing: number, other: { label: string, amount: number }[] }`. Mirrors `cogs.shard.*` pattern. Idempotent upsert.
- Dashboard: two new KPI cards next to existing Gross Profit / Margin %: **Net Profit** and **Net Margin %**, both with previous-period delta badge.
- Net profit = gross profit − expenses for the period. Expenses are pro-rated to the day if the selected range is a partial month.
- Empty expenses state: cards render with a Polaris Banner "Add your ad spend to see net profit" linking to Settings. Never shows $0 silently.
- Time series: the existing margin trend chart gains a toggle to overlay net margin when expenses cover the full selected range.
- Validation: reject non-numeric input; currency must match shop's `currency_code` from `cogs.meta`.
- CSV import/export for monthly expenses (same format as COGS CSV, separate download).
- Free plan: entry and display for the current month + the previous month only.
- Pro plan: unlimited month history, full CSV import/export, net margin time-series overlay, previous-period comparison on net profit.

**Shopify API sources:** Extends existing `profit.ts`. No new Shopify API calls — expense data comes from metafields.

**Tier:** Free (current + previous month) / Pro (unlimited history, CSV, time-series)

**Out of scope:** Live ad platform API sync (requires stored OAuth tokens — violates stateless constraint). Per-campaign attribution. Multi-currency expense entry.

---

### F10 — Transaction Fee Auto-Calculation

**Goal:** The dashboard automatically deducts estimated payment processing fees from gross revenue when computing profit, based on the merchant's configured gateway rates.

**User story:** "TrueProfit showed me I was losing 3.2% to payment fees I'd never accounted for. I need this calculated automatically."

**Acceptance criteria**
- Once the merchant configures gateway rates in F04 Settings, all profit calculations (gross profit, net profit) deduct estimated transaction fees automatically.
- Fee calculation: per-order, look up the gateway from `orders.paymentGatewayNames`, apply the configured rate (% + fixed per transaction), sum across all orders in range.
- A new line item appears in the P&L panel (F12): "Payment processing fees (est.) — $X".
- If gateway rates are not configured, the fee line shows "— Not configured" with a link to Settings. Profit figures are computed without fee deduction in this state — clearly labelled "excl. payment fees".
- Shopify Payments merchants: Shopify's `orders.transactions.fees` field is populated for Shopify Payments — prefer the actual fee over the estimate when available, and label it "Actual" rather than "Est."

**Shopify API sources:** `orders.paymentGatewayNames`, `orders.transactions.fees` (Shopify Payments only), `orders.totalPriceSet`. Gateway rates from `config.preferences` metafield.

**Tier:** Free

**Out of scope:** Reconciling against actual Shopify Payouts. Tax calculation. Currency conversion for multi-currency shops.

---

### F11 — Shipping Cost Tracking

**Goal:** A merchant sees how much they spent on outbound shipping versus how much they charged customers, and the net shipping P&L.

**User story:** "I offer free shipping over $50 but I have no idea if I'm losing money on it. I need to see shipping revenue vs. shipping cost."

**Acceptance criteria**
- New "Shipping" section in the P&L panel (F12) with three figures:
  - **Shipping charged:** total shipping revenue collected from customers (`orders.totalShippingPriceSet`).
  - **Shipping cost (est.):** if merchant uses Shopify Shipping, pull `orders.shippingLines.discountedPriceSet` where `source == "shopify"` as the actual carrier cost. If not using Shopify Shipping, merchant enters a per-order flat rate or a % of order value in Settings as an estimate.
  - **Shipping P&L:** charged − cost. Positive = profitable shipping; negative = subsidising shipping.
- Shopify Shipping merchants: shipping cost is pulled directly from `shippingLines` — no manual entry needed. Show "Actual" label.
- Non-Shopify Shipping merchants: Settings card "Shipping cost estimation" — enter flat rate per order or % of order revenue. Stored in `config.preferences`.
- Weight-based allocation (F28) is a Phase 3 enhancement — this feature uses flat/percentage estimates only.
- Shipping P&L line included in the net profit calculation (F09) when configured.

**Shopify API sources:** `orders.totalShippingPriceSet`, `orders.shippingLines.discountedPriceSet`, `orders.shippingLines.source`.

**Tier:** Free

**Out of scope:** Per-carrier breakdown. Weight-based cost allocation (F28). Return shipping costs (treated as part of returns analytics, F08).

---

### F12 — Full P&L Report

**Goal:** A merchant can see a complete profit and loss statement for any period in one view.

**User story:** "I want to hand something to my accountant that shows gross revenue down to net profit with every cost line. TrueProfit does this for $100/mo."

**Acceptance criteria**
- New top-level page "P&L Report" accessible from the Polaris NavMenu.
- Structure (rows):
  ```
  Gross Revenue
    − Returns & Refunds
  = Net Revenue
    − Cost of Goods Sold (COGS)
  = Gross Profit                [Gross Margin %]
    − Shipping Costs (est.)
    − Payment Processing Fees (est.)
    − Marketing & Ad Spend
    − Other Operating Expenses
  = Net Profit                  [Net Margin %]
  ```
- Each line links to its source panel (click "Returns & Refunds" → returns panel).
- Lines with missing data (e.g. COGS not configured) show "— Not configured" with a contextual link to Settings — never $0.
- Date range picker at the top; supports all comparison modes from F02/F03.
- PDF export: render the P&L as a printable HTML page (browser `window.print()` — no server-side PDF generation needed). Pro-only.
- CSV export: flat file of all line items. Free (watermarked) / Pro (no watermark).
- Free plan: current + previous period comparison, last 90 days max.
- Pro plan: unlimited history, PDF export, YoY comparison.

**Shopify API sources:** Aggregates data already computed by `overview.ts`, `profit.ts`, returns endpoints, plus expense metafields (F09) and gateway rates (F04).

**Tier:** Free (summary, 90-day) / Pro (full drill-down, unlimited, PDF export)

**Out of scope:** Accrual accounting. Tax line. Multi-currency P&L (F26). Connecting to Xero/QuickBooks.

---

### F13 — Product-Level Net Profit Analytics

**Goal:** A merchant sees each product's full cost picture — revenue, COGS, allocated shipping, allocated payment fees, ad spend — down to net profit per unit.

**User story:** "TrueProfit shows me net profit per product after all costs. It's the only number that tells me whether to keep running ads on a product or kill it."

**Acceptance criteria**
- Extends F08 (Net Revenue per Product) with additional cost columns:
  - Allocated shipping cost: pro-rated from total shipping cost by revenue share (or weight-share if F28 is enabled).
  - Allocated payment fees: pro-rated from total payment fees by revenue share.
  - Ad spend allocated: if merchant tags orders by product campaign in the "other marketing" notes field OR if they enter per-product ad spend in Settings, show it. Otherwise "— Not configured."
  - Net profit per product = gross profit − allocated shipping − allocated payment fees − allocated ad spend.
  - Net profit per unit = net profit / units sold.
- Table columns: Product / Units sold / Revenue / Returns / Net Revenue / COGS / Gross Profit / Allocated Shipping / Allocated Fees / Net Profit / Net Margin % / Net Profit/Unit.
- Free: top 10 products by revenue, 90-day window. Pro: all products, unlimited, sortable by any column.
- All allocation methods labelled "est." with a tooltip explaining the pro-ration method.

**Shopify API sources:** `orders.lineItems`, `orders.refunds.refundLineItems`, `orders.totalShippingPriceSet`, `orders.paymentGatewayNames`. COGS from metafields.

**Tier:** Free (top 10, 90-day) / Pro (all products, unlimited, sortable)

**Out of scope:** Per-variant net profit on Free (Pro only). Live ad attribution per product.

---

### F14 — Break-Even Order Volume Calculator

**Goal:** A merchant can see exactly how many orders per month they need at their current AOV and margin to cover fixed costs.

**User story:** "I have $8,000/mo in fixed costs. How many orders do I need to break even? I work this out in a spreadsheet every month."

**Acceptance criteria**
- New card in the P&L page (F12) titled "Break-even analysis."
- Inputs (pulled automatically from existing data):
  - Average selling price (AOV from overview).
  - Average COGS per order (total COGS / orders from profit endpoint).
  - Average variable costs per order: shipping cost/order + payment fee/order (from F10, F11).
  - Total monthly fixed costs: sum of ad spend + other expenses from F09.
- Formula: `Break-even orders = Fixed costs / (AOV − variable cost per order)`.
- Output: "You need X orders/month to break even at your current AOV and cost structure."
- Secondary output: "At your current order rate of Y orders/month, you are Z orders above/below break-even."
- All inputs are editable inline (merchant can run "what-if" scenarios). Changes are not saved — this is a calculator, not a settings form.
- If any required input is missing (COGS not configured, expenses not entered), show the card in a "Configure costs to unlock" state with links to the relevant settings.

**Shopify API sources:** Derived from existing overview and profit endpoint responses. No new API calls.

**Tier:** Free

**Out of scope:** Saving scenarios. Multi-product break-even (contribution margin by SKU). Tax in the calculation.

---

### F15 — Inventory Velocity & At-Risk Stock

**Goal:** A merchant sees which variants will stock out within 30 days at their current sell rate, so they can reorder before going out of stock.

**User story:** "I've lost thousands in sales because I ran out of my top SKU and didn't see it coming. Shopify shows me stock counts but not sell rate."

**Acceptance criteria**
- New panel "Inventory health" showing a table: Product / Variant / Current stock / Units sold (last 30d) / Daily sell rate / Est. days remaining / Status badge.
- Status badges: `Healthy` (>60d), `Watch` (30-60d), `At Risk` (15-30d, amber), `Critical` (<15d, red), `Out of Stock` (0).
- Daily sell rate = units sold in last 30 days / 30. Applied to current inventory count from Shopify.
- Inventory count sourced from `inventoryLevel.available` via `InventoryLevel` connection on `productVariants`.
- Sort default: ascending by days remaining (most at-risk first).
- Merchant can set a custom lead time (in days) in Settings, stored in `config.preferences.leadTimeDays`. The "At Risk" threshold shifts to lead time × 1.5. Default: 14 days.
- Free: top 20 at-risk variants only. Pro: full inventory list, unlimited.
- Empty state: if all items have >60 days remaining, show "All inventory looks healthy" with the date it was last computed.
- Refresh: data is live (computed on page load, not cached snapshot). Phase 1.5 bulk-ops path applies if >2,500 orders in the 30-day window.

**Shopify API sources:** `productVariants.inventoryItem.inventoryLevels.available`, `orders.lineItems.quantity`, `orders.lineItems.variant.id`.

**Tier:** Free (top 20 at-risk) / Pro (full list)

**Out of scope:** Multi-location inventory. Reorder automation or PO creation. Demand forecasting beyond linear sell rate.

---

### F16 — Product Affinity (Frequently Bought Together)

**Goal:** A merchant sees which products are most often purchased together in the same order.

**User story:** "I want to know what to bundle, what to cross-sell on the cart page, and what products complement each other — without paying for a separate recommendation app."

**Acceptance criteria**
- New panel "Product affinity" showing a ranked list of product pairs: Product A / Product B / Co-purchase count / % of Product A orders that include Product B.
- Computed by iterating order line items and building a co-occurrence count for each product pair (by `product.id`, not variant).
- Ranked by co-purchase count descending.
- Filter: merchant can search for a specific product and see all products most frequently bought with it.
- Free: top 20 pairs, 90-day window. Pro: all pairs, unlimited window.
- Minimum threshold: pairs with fewer than 3 co-purchases are omitted to avoid noise.
- Performance note: this is O(n × k²) where k = avg line items per order. For stores with very large orders, cap at top 50 line items per order before pairing.

**Shopify API sources:** `orders.lineItems.product.id`, `orders.lineItems.product.title`.

**Tier:** Free (top 20 pairs, 90-day) / Pro (all pairs, unlimited)

**Out of scope:** Variant-level affinity. Cart abandonment data. Storefront recommendation widget.

---

### F17 — Price Point Analysis

**Goal:** A merchant sees how sales volume and margin distribute across price tiers to understand where their revenue sweet spot is.

**User story:** "I'm thinking about repricing my catalogue but I don't know if my $30-40 products convert better than my $60-70 ones."

**Acceptance criteria**
- New panel "Price analysis" with a bar chart: X-axis = price bands (configurable, default $0-25, $25-50, $50-100, $100-200, $200+), Y-axis = units sold per band, with a secondary line for average margin % per band.
- Bands are configurable: merchant can change the breakpoints in Settings. Stored in `config.preferences.priceBands`.
- Table below the chart: Price band / Products / Units sold / Revenue / Avg margin % / Return rate %.
- Computed from `orders.lineItems.originalUnitPriceSet` grouped into bands.
- Drill-down: click a band to see the top 10 products in that band by units sold.
- No minimum data guard required (price bands are always computable if orders exist).

**Shopify API sources:** `orders.lineItems.originalUnitPriceSet`, `orders.lineItems.product.id`, `orders.lineItems.quantity`.

**Tier:** Free

**Out of scope:** Dynamic repricing suggestions. A/B test tracking. Price change history.

---

### F18 — Scheduled Email Digest

**Goal:** A merchant receives an automated email summary of their store's key metrics on a schedule they choose.

**User story:** "I want to open my inbox on Monday morning and know how last week went without opening another app."

**Acceptance criteria**
- Settings card "Email digest" with: recipient email (default: shop owner), schedule selector (Daily / Weekly — day of week + time), toggle to enable/disable.
- Settings stored in `config.preferences.digest`.
- Cloudflare Worker cron runs hourly; checks each opted-in shop's preferred send time and sends if due.
- Email contents (fixed, not configurable in Phase 2): last period revenue, orders, AOV, gross profit, margin %, net profit (if F09 configured), top 3 revenue movers vs prior period, repeat purchase rate (if F06 data exists).
- HTML email with plain-text fallback. Polaris-inspired styling (no images — inbox-safe).
- Unsubscribe link in every email; one-click suppression via a public `GET /digest/unsubscribe?token=` endpoint (signed token, no auth required). Stored as `config.preferences.digest.unsubscribed: true`.
- Skip logic: do not send if fewer than 14 days of orders exist. Log `skipped: insufficient data`.
- No PII logged server-side. Email addresses are only used for delivery, never stored in logs.
- Free: weekly only, 1 recipient.
- Pro: daily option, up to 5 recipients, branded digest with store logo.

**Shopify API sources:** Reuses `/api/metrics/overview` and `/api/metrics/profit` responses. Worker cron re-fetches on send.

**External dependency:** Transactional email provider (Resend recommended — simple API, generous free tier, Workers-native). Decision deferred to user (see Open Questions).

**Tier:** Free (weekly, 1 recipient) / Pro (daily, 5 recipients, branded)

**Out of scope:** Slack/Teams delivery. Custom report content in the digest. Per-recipient metric filters.

---

### F19 — Saved Report Views

**Goal:** A merchant can save a specific combination of date range, comparison mode, and filters as a named view and return to it with one click.

**User story:** "Every Monday I check the same 3 views. I want to bookmark them inside the app instead of reconstructing them each time."

**Acceptance criteria**
- "Save this view" button in the dashboard header (Polaris `Button`, secondary variant). Opens a small modal: name input + save.
- Saved views appear in a "Saved views" dropdown in the nav. Clicking a view restores the full URL state (date range, comparison mode, any active filters).
- Stored in `config.preferences.savedViews` as an array of `{ name, url }` objects.
- Free: maximum 3 saved views. On hitting the cap, the save button shows an inline "Upgrade to Pro for unlimited saved views" message — not a modal.
- Pro: unlimited saved views.
- Delete: trash icon next to each saved view in the dropdown.
- View names are validated: non-empty, max 40 characters, no duplicates.

**Shopify API sources:** None — saved views are URL state only.

**Tier:** Free (3 max) / Pro (unlimited)

**Out of scope:** Sharing saved views with other team members. Permission scoping by view.

---

### F20 — Cohort Retention Table

**Goal:** A merchant can see, for each month they acquired customers, what percentage returned to purchase again at 1, 2, 3, 6, and 12 months.

**User story:** "I need to know which acquisition cohorts have the best long-term retention so I know which channels and offers are actually building my business, not just inflating month-one revenue."

**Acceptance criteria**
- New top-level page "Retention" in NavMenu (Pro only; Free sees a preview card on the dashboard with the headline 90-day repeat rate from F06 and a "See full cohort table on Pro" link).
- Cohort grid: rows = acquisition month (first-order month, earliest 12 months back on Pro); columns = M+0 (cohort size), M+1, M+2, M+3, M+6, M+12 (% and absolute count on hover).
- Cohort definition: a customer's acquisition month = the calendar month of their first-ever order.
- Cell value: `customers with ≥N+1 orders where order N+1 occurred within the Mth month window / cohort size`. Rendered as a percentage; raw count shown in a Polaris Tooltip on hover.
- Color scale: deeper green = higher retention. Empty cells (future months) rendered in muted grey.
- Minimum cohort size: rows with fewer than 10 customers are rendered but flagged with a `*` and a note "small cohort — results may not be statistically reliable."
- Empty state: fewer than 2 closed acquisition months → "Cohort retention requires at least 2 full acquisition months of data. Come back next month."
- High-volume stores: if the customer walk exceeds 5,000 customers, fall back to the Phase 1.5 bulk operations path and show the partial-results banner.
- All cohort percentages must reconcile against a `customers.count` control total for the same window — asserted in tests.
- Pro only: previous-year overlay (toggle shows a ghost row beneath each cohort row with same-cohort-month from the prior year).

**Shopify API sources:** `customers.orders` connection, `customer.createdAt`, `orders.createdAt`. High-cost query — requires GraphQL cost analysis and pagination strategy by architect before implementation.

**Tier:** Free (headline repeat rate in F06 only) / Pro (full cohort grid)

**Out of scope:** Cohort segmentation by acquisition channel, first product, or discount code (separate follow-on PRs). Predictive LTV projections (Phase 3 / AI). Revenue cohorts (vs. customer count cohorts).

---

### F21 — Customer LTV by Acquisition Month

**Goal:** A merchant sees the average cumulative revenue per customer cohort, tracked month-by-month from their first order.

**User story:** "I want to know if the customers I acquired in my Black Friday sale are worth as much as my organic customers 6 months later."

**Acceptance criteria**
- Adjacent tab on the Retention page (F20) — "LTV" tab alongside the retention grid.
- Same cohort structure as F20 (rows = acquisition month) but cell values = average cumulative revenue per customer at M+1, M+2, M+3, M+6, M+12.
- Cumulative: M+3 LTV includes all revenue from orders 1 through month 3, not just month 3 orders.
- Currency: rendered in shop's currency_code.
- Heatmap coloring: deeper color = higher LTV.
- Same minimum cohort size guard as F20 (≥10 customers).
- Payback period callout: a summary line below the grid — "Customers acquired in [best cohort month] returned their acquisition cost in [N] months based on a $X CAC" — only shown if merchant has configured ad spend in F09.

**Shopify API sources:** Same walk as F20 — no additional API calls if computed together.

**Tier:** Pro

**Out of scope:** LTV projections beyond observed data. Attribution to specific campaigns. Multi-currency LTV normalization (F26 dependency).

---

### F22 — RFM Customer Segmentation

**Goal:** A merchant can see their customer base segmented into actionable groups (Champions, Loyal, At-Risk, Lost, New) based on recency, frequency, and monetary value.

**User story:** "I need to know which customers are slipping away so I can target a win-back campaign before they're gone. Every $200/mo analytics app has this."

**Acceptance criteria**
- New "Segments" tab on the Retention page (F20).
- Segments computed from all customers with at least one order in the last 365 days (Pro unlimited):
  - **Champions:** high recency, high frequency, high spend.
  - **Loyal:** medium-high frequency, moderate recency.
  - **Potential Loyalists:** recent first or second purchase.
  - **At Risk:** once-frequent, not seen recently.
  - **Hibernating:** low recency, low frequency.
  - **Lost:** no order in 180+ days with 1-2 lifetime orders.
- RFM scores: each dimension scored 1-5 (quintile-based) relative to the merchant's own customer base. Not compared to peer benchmarks (Phase 2 feature).
- Dashboard card for each segment: name / count / % of customers / avg LTV / trend vs prior 30 days.
- Drill-down: click a segment → table of customers in that segment (masked email, order count, last order, LTV). Export as CSV.
- Merchant cannot edit segment definitions in Phase 3. Fixed definitions only.
- Segments are recomputed on page load — not cached (no snapshot metafield for customer segments yet).

**Shopify API sources:** Full customer walk — same infrastructure as F20/F21. `customer.createdAt`, `customer.orders.totalPriceSet`, `customer.orders.createdAt`.

**Tier:** Pro

**Out of scope:** Custom segment definitions. Pushing segments to Klaviyo/Mailchimp. Predictive churn scoring.

---

### F23 — Repeat Purchase Rate by First Product

**Goal:** A merchant sees which product a customer bought first predicts the highest likelihood of a second purchase.

**User story:** "I want to know which product I should run acquisition ads on — not the one that makes the most money on order 1, but the one that turns customers into repeat buyers."

**Acceptance criteria**
- New column on the product performance table: "Repeat rate as 1st product" — % of customers whose first-ever order contained this product and who subsequently placed a 2nd order.
- Computed by walking `customer.orders` — identify each customer's first order, note the product(s) in it, then check for a 2nd order.
- Minimum guard: only show the rate if ≥20 customers had this product as their first purchase. Otherwise "—".
- Sortable column. Pro only.
- Tooltip on each cell: "X of Y customers who bought this first placed a 2nd order."

**Shopify API sources:** Same customer walk as F20. `customer.orders.lineItems.product.id`.

**Tier:** Pro

**Out of scope:** Third-order prediction. Variant-level first-product analysis. Channel overlay (use F21 for that).

---

### F24 — Tag & Metafield Filtering

**Goal:** A merchant can filter any report by order tag, product tag, or a custom product metafield value.

**User story:** "I tag all wholesale orders with 'wholesale' and all retail orders with 'retail'. I need to be able to report on them separately."

**Acceptance criteria**
- Filter bar in the dashboard header: "Filter by" Polaris Select. Options: Order tag, Product tag, Product type, Vendor, and (if the store has product metafields) any metafield key under a configurable namespace.
- Filters stack: multiple filters are AND-ed together.
- Applied filters shown as Polaris Tags in the filter bar with an X to remove each.
- Backend: filters passed as query params (`tagFilter=wholesale`, `vendorFilter=Nike`). Applied server-side during order pagination by inspecting `orders.tags`, `orders.lineItems.product.tags`, `orders.lineItems.product.productType`, `orders.lineItems.product.vendor`.
- Metafield filtering: restricted to product metafields (not customer or order metafields) to keep query cost manageable.
- URL state: filters reflected in the URL so filtered views can be saved (F19).
- Free: order tag and product tag only. Pro: full metafield filtering.

**Shopify API sources:** `orders.tags`, `orders.lineItems.product.tags`, `orders.lineItems.product.productType`, `orders.lineItems.product.vendor`, `orders.lineItems.product.metafield(namespace:, key:)`.

**Tier:** Free (tag filters) / Pro (metafield filters)

**Out of scope:** Customer tag filtering. Order metafield filtering. Saved filter sets as named segments (that is F22).

---

### F25 — Google Sheets Live Sync

**Goal:** A merchant can connect their FirstBridge dashboard to a Google Sheet and have it updated on a schedule automatically.

**User story:** "My whole team lives in Google Sheets. I want the data pushed there automatically so they don't need to log into another app."

**Acceptance criteria**
- Settings card "Google Sheets integration" — merchant clicks "Connect Google Sheets," completes a minimal OAuth flow (Sheets write scope only), and pastes a Sheet ID.
- Worker cron syncs on the merchant's chosen schedule (daily by default, hourly on Pro).
- Sync creates/overwrites named sheets within the target Google Sheet: `Overview`, `Profit`, `Top Products`, `Customers`, `Returns`.
- Each sheet: header row + one data row per day in the selected history window.
- On sync failure: a Polaris Banner on the dashboard "Google Sheets sync failed — reconnect" with a reconnect button. Last successful sync timestamp shown.
- Google OAuth tokens: the refresh token is stored encrypted in a KV key `gsheets:{shop_domain}`. This is the only case where an external OAuth token is persisted — document the exception in CLAUDE.md.
- Free: not available. Pro only. (Rationale: Google OAuth token storage is the one exception to stateless backend; gating it to Pro keeps the exception surface small.)
- Disconnect: removes the KV key and revokes the Google OAuth token via Google's revocation endpoint.

**Shopify API sources:** Reuses existing metric endpoints.

**External dependency:** Google Sheets API (no SDK — raw REST calls from Workers, no Node deps). Google OAuth for the merchant's Google account.

**Tier:** Pro only

**Out of scope:** Reading from Google Sheets (write-only). Excel Online or other spreadsheet sync. Custom column mapping.

---

### F26 — Multi-Currency Revenue Normalization

**Goal:** A merchant selling in multiple currencies can see all revenue normalized to a single reporting currency.

**User story:** "I sell in GBP, EUR, and USD. Shopify shows me three separate revenue numbers and I have to add them up myself every time."

**Acceptance criteria**
- Dashboard gains a "Reporting currency" selector in Settings. Options: any currency the shop has received orders in, or the shop's primary currency (default).
- Conversion rate source: Shopify's `order.presentmentCurrencyRate` field gives the rate at order time. Use this — never a live exchange rate API (no external dependency).
- All revenue and profit figures in all panels are shown in the reporting currency when selected, with a note "Converted at order-time rates."
- Historic accuracy: because rates are captured at order time, historical comparisons are accurate (no rate-at-query-time distortion).
- Original currency column: all export CSVs include both the original `presentmentAmount` + `presentmentCurrencyCode` and the converted amount.
- Limitation banner: "Exchange rates are locked at order time. Recent rate fluctuations are not reflected."

**Shopify API sources:** `orders.presentmentCurrencyRate`, `orders.totalPriceSet.presentmentMoney`, `orders.totalPriceSet.shopMoney`.

**Tier:** Pro

**Out of scope:** Real-time rate updates. Hedging or FX analysis. Multi-store currency rollup (F multi-store is separate).

---

### F27 — Bundling Insights

**Goal:** A merchant sees which product combinations are purchased as intentional bundles (same SKU sets appearing repeatedly together) versus incidental co-purchases.

**User story:** "I think customers are self-bundling two of my products — I want to confirm it before I create an official bundle listing."

**Acceptance criteria**
- Extension of F16 (Product Affinity). A "Bundles" tab alongside the affinity panel.
- Bundle detection heuristic: a product pair (or triplet) that appears together in ≥5% of orders containing either product is flagged as a potential bundle.
- Bundle card: shows the products, co-purchase rate, average order value when bought together, and average order value when bought separately. Delta = bundle uplift.
- "Create bundle" CTA: links to the merchant's Shopify Admin product creation page (deep link, not an action we take). We do not create products.
- Minimum threshold: ≥10 orders containing the combination before surfacing it.

**Shopify API sources:** Same as F16 — `orders.lineItems.product.id`, `orders.lineItems.quantity`.

**Tier:** Pro

**Out of scope:** Automatic bundle creation. Storefront widgets. Subscription bundles.

---

### F28 — Weight-Based Shipping Cost Allocation

**Goal:** For merchants with variable-weight products, allocate per-order shipping costs to each line item proportionally by weight rather than by revenue share.

**User story:** "I sell a $5 accessory and a $200 heavy item in the same order. Allocating shipping by revenue makes the heavy item look more profitable than it is."

**Acceptance criteria**
- Extension of F11 and F13. In Settings, under "Shipping cost allocation method," merchant can choose: Revenue share (default) or Weight-based.
- Weight-based: pull `orders.lineItems.variant.weight` and `orders.lineItems.variant.weightUnit`. Convert all weights to grams. Allocate the order's shipping cost by `(line item weight × quantity) / total order weight`.
- Variant weight is sourced from Shopify — no manual entry. If any variant is missing weight data, fall back to revenue-share for that order and log it.
- A summary in Settings: "X% of your orders have complete weight data. Y% are using revenue-share fallback."
- Weight allocation method is applied to both the Shipping column in F12 P&L and to per-product shipping in F13.

**Shopify API sources:** `orders.lineItems.variant.weight`, `orders.lineItems.variant.weightUnit`, `orders.totalShippingPriceSet`.

**Tier:** Pro

**Out of scope:** Dimensional weight calculation. Carrier-specific rate tables. Actual weight-based carrier cost lookup.

---

---

## What Is Ruled Out

| Feature | Reason |
|---|---|
| Live Meta / Google / TikTok ad sync | Requires stored OAuth refresh tokens and background refresh jobs — violates stateless backend constraint. Use manual entry (F09) instead. |
| Multi-touch attribution / pixel | Requires JS injection, identity stitching, and a database. Hard constraint violation. |
| Xero / QuickBooks sync | Requires persistent OAuth tokens and complex accounting data model. Out of scope for Phase 1-3. |
| Mobile app (iOS / Android) | Different platform — separate product if ever. |
| Multi-store rollup | Phase 4+. Requires cross-shop data aggregation design. |
| POS-specific analytics | Vertical feature (brick-and-mortar only). Phase 1-3 is horizontal. |
| Custom report builder UI | Open-ended and hard to ship well. F24 (tag/metafield filtering) covers 80% of the use case. |
| Subscription analytics | Different product category; depends on Shopify Subscriptions API. |
| Heatmaps / session recording | Different product (Microsoft Clarity is free). |

---

## Open Questions

1. **Email provider (F24 — Scheduled Digest):** Resend, Postmark, or SES? This is the only paid external dependency in the Phase 2 roadmap.
2. **Pro price point:** $19, $24, or $29/mo? Affects how aggressively features are gated.
3. **Google Sheets OAuth exception (F27):** The stateless constraint has one documented exception for Google refresh token storage in KV. Confirm this is acceptable before architect designs it.
4. **F19 cohort query cost:** The `customers.orders` walk is the most expensive query in the roadmap. Needs architect sign-off on GraphQL cost budget and bulk-ops fallback before implementation starts.
5. **Build sequence confirmed:** F01 (Geography) → F02 (YoY comparison) → F10 (Net revenue per product) → F05 (Net profit with ad spend). Override if priorities differ.
