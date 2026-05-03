# FirstBridge Analytics — PRD v2
**Date:** 2026-05-03
**Competitive reference:** Report Pundit (5.0★, 1,848 reviews, $9–35/mo, 150+ reports)
**Model:** Free + Pro only. Monthly billing. No per-order pricing.

---

## Strategic Context

Report Pundit is the dominant Shopify reporting app. Its strengths: enormous report breadth (150+ prebuilt), data export to Google Sheets, scheduled email delivery, and a team that custom-builds reports for merchants on request.

Its weaknesses — and FirstBridge's opportunity:

| Report Pundit weakness | FirstBridge response |
|---|---|
| Separate web app (app.reportpundit.com) — not embedded in Shopify admin | Truly embedded: App Bridge, Polaris, native nav |
| Trial syncs only **3 days** of data | Live Shopify API — no sync lag, no stale data |
| Free tier capped at **<1,000 lifetime orders** (tiny stores only) | Free tier works for real active merchants |
| Table dumps — raw rows, no interpretation | Insight-first: visual dashboards, delta badges, actionable callouts |
| 150+ reports to navigate = cognitive overload | Curated views grouped by merchant job-to-be-done |
| Pricing scales to $35/mo; Better Reports hits $299/mo | $19–29/mo Pro, predictable forever |
| No COGS/profit built in (separate COGS Report only) | Profit-aware from day one, free |

**The positioning:** Report Pundit is an analyst's tool — powerful for someone who knows what report they want. FirstBridge is a merchant's tool — tells you what matters without requiring a data background.

---

## What Is Already Shipped

| Feature | Notes |
|---|---|
| Overview dashboard — revenue, orders, AOV, unique customers, prev-period delta | ✅ |
| Date range picker (7d / 30d / 90d presets) | ✅ |
| Profit & P&L — gross revenue, COGS, margin %, top profitable products | ✅ |
| COGS entry per variant (20-SKU Free cap), store-wide default margin % | ✅ |
| Returns analytics — by product, reasons, resolution, net-revenue at risk | ✅ |
| Revenue + orders time-series, DoW chart, margin trend, return rate trend | ✅ |
| Marketing — discount code performance | ✅ |
| Customers — geography tab (country/state heat map) | ✅ |
| CSV export per panel | ✅ |
| Expenses & gateway rates in Settings | ✅ |
| 90-day Free history clamp, 2,500-order budget with partial-results banner | ✅ |
| Billing — Free/Pro via Shopify Managed Pricing | ✅ |

---

## Report Pundit — Full Report Catalog (from trial)

Organized as seen in their app. Greyed-out = locked behind higher plan.

### Inventory
Inventory on Hand · Inventory Sale Value · Inventory Cost · Out of Stock Product ·
Inventory Level Indicator · Inventory by Location · Inventory by Product Type ·
Low Stock Product · Inventory Re-Order Point · Inventory Status · ABC Analysis ·
*(locked)* Inventory Transfers · Inventory Shipments

### Fulfillment
Unfulfilled Orders · Orders Paid But Not Fulfilled · Orders Fulfilled In Last 30 Days ·
Orders Pending Fulfilment · Shipping Report · Partially Shipped ·
*(locked)* Shipping Label Cost Report

### Sales & Orders
Last 24 Hours Orders · Last 30 Days Sales Summary · Order Report · Finance Summary ·
Sales by Product · Sales by Variant · Sales by Vendor · Sales by POS · Sales by Discount Code ·
Sales by Channel · Sales by Customer · Refund Report · Commission Report ·
Completed Draft Order · Order Tags and Line Item Properties · Sales Over Time ·
Sales by Billing Location · Sales by Checkout Currency · Sales by Device ID ·
Weekly Sales Pattern · Detailed Sales Report · Order vs Return (Monthly) ·
Sales by Fulfillment Location · Retail sales by staff (3 variants) · Payment outstanding ·
Payment Term · Payment Due on · COGS Report · Deleted products in Order · Orders over time ·
*(locked)* Cash Tracking · Bundle Item vs Non-bundle Item sales

### Customer Journey
UTM Report · Customer Journey · Sales by Referring Site · Sales by UTM Source ·
Sales by UTM Medium · Sales by UTM Campaign

### Tag Reports
Sales by Product Tag Group · Sales by Customer Tag Group · Sales by Order Tag Group ·
Sales Attributed to Each Product Tag · Customer Tag · Order Tag

### Collections *(locked on trial)*
Sales by Collections · Best Selling Collections · Product by Collections ·
Sales Attributed to Marketing · Inventory by Collections · Sales by Collection Group ·
Sales Attributed to Each Custom/Smart Collections

### Abandoned Cart *(locked on trial)*
Abandoned Checkout Report · Daily checkout summary

### Customer
Customer Information · Most Valuable Customers · Returning Customers ·
First Time Order Customers · Outstanding Customer Payments ·
First Time vs Returning Customers sales · Customers by Location ·
Customer Store Credit · Store Credit Transactions

### Custom Property
Line item properties · Note Attributes · Sales and Product/Order/Customer Metafields ·
All Product/Variant/Customer Metafields

### Product & Variant SKU
Best Selling Products · Total Products Sold · Never Sold Products · All Product ·
Products by Vendor · Products by Product Type · Sales by Product (existing) ·
Sales by Product Variant (existing SKUs) · Shopify Market - Product Variants ·
Product Return Rate · Product Combination · Products by Tags · Deleted product list ·
*(locked)* Order Lifecycle Report · Shopify Bundle Products

### Tax
Tax Report · Monthly Tax Summary · Product Tax Report · Tax by State · Tax by Country ·
Canadian Tax Report · USA Tax Collected (Shopify) · United States Sales Tax ·
Tax report without cancelled orders · IOSS Tax Report

### Transaction & Billing
Successful Transactions · Failed Transactions · Pending Transactions ·
PayPal Details and Reconciliation · Stripe Details and Reconciliation ·
Payment Gateway Report · Total Transaction Value by Gateway · Gift Card Transactions

### Gift Cards
Expired or Unused Gift Cards · Gift Card Issuance and Activation ·
Gift Card Redemption by Customer · Gift Card Report Overview

### Payout Reconciliation *(locked)*
Shopify Payout Report

### Integrations (external app data)
**Shipping:** ShipStation (3 reports)
**Inventory:** Stocky (2 reports)
**Marketing:** TikTok Stats · Google Ads Conversions & Spend
**Payment:** PayPal Summary & Lineitem · Stripe Transactions (2 reports)
**Accounting imports:** Xero Inventory/Sales · QuickBooks Product/Customer/Invoices
**Disputes:** Chargeback Won/Lost/Overview *(locked)*
**GA4:** Attribution Metrics · Daily Visitor Metrics · Product Conversion · Campaign & Channel Performance
**Returns apps:** Return Prime (2) · Loop Returns (4)
**Other:** Authorize.net · Amazon Ads · Pinterest · Klarna · Square · Workmate (2) · Facebook Spends · Instagram Insights

---

## Gap Analysis: Report Pundit vs FirstBridge

### Gaps FirstBridge should close (Shopify-native, fits our architecture)

| Gap | RP report(s) | Merchant impact | Effort |
|---|---|---|---|
| **Tax reports** | Monthly Tax Summary, Tax by State/Country, USA/Canada/IOSS | Critical for accountants; every merchant files taxes | M |
| **Inventory health** | Low Stock, Out of Stock, Inventory Level Indicator, Re-Order Point | Prevent stockouts; huge operational pain | M |
| **ABC analysis** | ABC Analysis | Identify which 20% of SKUs drive 80% of revenue | S |
| **Fulfillment operations** | Unfulfilled Orders, Paid But Not Fulfilled, Pending | Operational must-have; detect stuck orders | S |
| **Sales attribution** | Sales by Vendor, by Channel, by Product Type, by Collection | Understand which part of catalogue drives revenue | M |
| **UTM / traffic source** | UTM Report, Sales by Referring Site, by UTM Source/Medium/Campaign | Marketing attribution without GA4 dependency | M |
| **First-time vs returning split** | First Time vs Returning Customers sales | Acquisition vs retention health check | S |
| **Customer LTV ranking** | Most Valuable Customers | Identify VIPs; pair with repeat purchase rate | S |
| **Weekly sales pattern** | Weekly Sales Pattern | Already have DoW chart — expose as dedicated view | XS |
| **Scheduled report delivery** | (via Schedules tab) | Saves daily manual check-in | L |
| **Abandoned cart** | Abandoned Checkout Report | Recovery opportunity; needs `read_checkouts` scope | L |
| **Payout reconciliation** | Shopify Payout Report | Accounting accuracy; `read_reports` scope | M |

### Gaps FirstBridge will NOT close (out of scope)

| Gap | Reason |
|---|---|
| All external integrations (ShipStation, Stocky, GA4, TikTok/Google/Facebook Ads APIs, Xero, QuickBooks, PayPal API, Stripe API, etc.) | Require stored OAuth refresh tokens — violates stateless Workers constraint and no-database rule |
| Commission tracking | Requires custom configuration per staff member; vertical (agencies/reps) |
| POS staff reports | Brick-and-mortar vertical; horizontal first |
| Gift card reports | Niche; Shopify's native admin handles it adequately |
| Dispute / chargeback reports | Rare edge case; not worth scope complexity |
| Customer store credit | POS/loyalty-specific |
| Custom report builder (drag-and-drop fields) | Open-ended; F24 tag/metafield filtering covers 80% of use cases |
| Multi-store rollup | Phase 4+ |

---

## Feature Roadmap

### Phase 1.5 — Close the most painful gaps (quick wins)

All pull directly from Shopify GraphQL using existing auth infrastructure. No new metafield schemas.

---

#### F30 — Tax Reports

**Why:** Tax filing is unavoidable. Every merchant needs this monthly. Report Pundit has 10 tax report variants. We should own the simplest, most useful ones.

**Reports to build:**
1. **Monthly Tax Summary** — table: Month / Gross Revenue / Taxable Revenue / Total Tax Collected / Tax by Jurisdiction. Shows current year by default.
2. **Tax by Geography** — table: Country / State/Province / Tax Collected / Orders / % of Total Tax. Sortable. CSV export.
3. **Tax by Product** (Pro) — which product types/collections carry the most tax exposure.

**Shopify API:** `orders.taxLines { title, rate, price }`, `orders.totalTax`, `orders.shippingAddress.countryCode`, `orders.shippingAddress.province`, `orders.createdAt`.

**Free/Pro split:**
- Free: current calendar month + previous month, country-level and state-level summary, CSV export
- Pro: unlimited history, product-level tax breakdown, IOSS flag for EU VAT orders

**Nav:** Reports → Tax (new tab)

**Notes:**
- Never compute tax owed — only tax collected (what Shopify recorded). Disclaim: "For reference only — consult your accountant for filing."
- Cancelled orders: show two views — including and excluding cancelled orders (Report Pundit offers this as a separate report; we offer a toggle)

---

#### F31 — Fulfillment Operations

**Why:** Unfulfilled orders cause customer service tickets and chargebacks. Merchants check this daily. It's pure operational data Shopify already has.

**Reports to build:**
1. **Unfulfilled Orders** — table of all open orders not yet fulfilled: Order # / Customer / Date / Items / Days since order / Value. Sorted by oldest first.
2. **Paid But Not Fulfilled** — subset of above: paid (not pending) but fulfillment not started. Highlights stuck orders.
3. **Fulfillment Performance** — aggregate stats: median fulfillment time (days from paid to fulfilled), % fulfilled within 1/3/7 days, trend over time.

**Shopify API:** `orders(query: "fulfillment_status:unfulfilled")`, `orders.fulfillmentStatus`, `orders.financialStatus`, `orders.createdAt`, `orders.fulfillments.createdAt`.

**Free/Pro split:**
- Free: current open unfulfilled orders (no date range limit — this is operational, not historical), fulfillment performance for last 30 days
- Pro: fulfillment performance for unlimited history, export, trend chart

**Nav:** New top-level "Operations" section in nav, or tab within existing Orders/Overview. Recommend: tab within Overview dashboard ("Fulfillment" tab alongside the existing summary).

---

#### F32 — Inventory Health Dashboard

**Why:** "I've lost thousands in sales because I ran out of my top SKU" is the most common merchant complaint about inventory. Report Pundit has 12 inventory reports. We should consolidate them into one smart panel.

**Reports to build (unified panel with tabs):**

**Tab 1: Stock Alerts**
- Table: Variant / SKU / Current stock / 30-day sell rate / Est. days remaining / Status
- Status badges: Healthy (>60d) · Watch (30–60d) · At Risk (15–30d) · Critical (<15d) · Out of Stock
- Default sort: most critical first
- Merchant sets lead time in Settings (default 14 days); At Risk threshold = lead time × 1.5

**Tab 2: ABC Analysis**
- Classify every product into A (top 20% of revenue), B (next 30%), C (remaining 50%)
- Table: Product / Rank / Revenue contribution % / Cumulative % / ABC class / Units sold / Stock on hand / Stock coverage (days)
- Insight callout: "X% of your revenue comes from just Y products (A-class)"
- Useful for: focus reorder budget on A-class; discontinue C-class dead stock

**Tab 3: Inventory Value**
- Total inventory value at cost (units × COGS) and at retail (units × price)
- By product type, by vendor
- Requires COGS to be configured; shows banner if not

**Shopify API:** `productVariants.inventoryItem.inventoryLevels.available`, `productVariants.price`, `orders.lineItems.variant.id`, `orders.lineItems.quantity`.

**Free/Pro split:**
- Free: Stock Alerts top 20 at-risk variants; ABC Analysis top 20 products; Inventory Value summary total only
- Pro: Full lists, all tabs, unlimited history for sell rate calculation, CSV export, multi-location breakdown

**Nav:** Products → Inventory (existing tab; expand it)

---

#### F33 — Sales Attribution Breakdown

**Why:** "Sales by Vendor," "Sales by Channel," "Sales by Product Type," and "Sales by Collection" are four of Report Pundit's most-used reports. They answer "which part of my catalogue is working?"

**Reports to build (tabbed panel):**

**Tab 1: By Vendor**
- Table: Vendor / Orders / Revenue / Units sold / Avg margin % / Return rate %
- Useful for: multi-brand stores, wholesale buying decisions

**Tab 2: By Product Type**
- Table: Product Type / Orders / Revenue / Units / Margin %
- Useful for: category analysis, which product category to invest in

**Tab 3: By Channel**
- Table: Sales Channel / Orders / Revenue / AOV / Return rate %
- Channels: Online Store, POS, Draft Orders, Wholesale, etc. from `order.sourceChannel`

**Tab 4: By Collection** (Pro)
- Requires `collections` query to map products to their collections, then attribute orders
- Table: Collection / Orders / Revenue / Units / Top product

**Shopify API:** `orders.lineItems.product.vendor`, `orders.lineItems.product.productType`, `orders.channelInformation.channelName`, `orders.sourceChannel`.

**Free/Pro split:**
- Free: Vendor, Product Type, Channel tabs (90-day window)
- Pro: Collection tab, unlimited history, all columns, CSV export

**Nav:** Products → Attribution (new tab)

---

#### F34 — UTM & Traffic Source Report

**Why:** "Where do my orders come from?" is a top-5 merchant question. Report Pundit wraps it in 6 separate UTM reports. We consolidate into one.

**What Shopify provides natively:**
- `orders.referringSite` — the referring URL
- `orders.landingPageDisplayText` — the first-touch landing page
- `orders.clientDetails.browserIp` — not useful for attribution
- UTM parameters are embedded in `landingPage` URL as query params — parse them server-side

**Reports to build:**

**Single panel with filter tabs: All / Organic / Paid / Direct / Email / Social**

Table columns: Source / Medium / Campaign / Orders / Revenue / AOV / Conv. share %

Summary cards at top: Top source by revenue · Top campaign by orders · Direct % of total

**Parsing logic:**
- Parse `?utm_source`, `?utm_medium`, `?utm_campaign` from `landingPage` URL
- No UTM params + referringSite present → referral (extract domain)
- No UTM + no referrer → direct
- UTM medium contains "cpc" / "paid" → paid
- UTM medium contains "email" → email
- referringSite is a known social domain (facebook.com, instagram.com, tiktok.com, pinterest.com) → social

**Free/Pro split:**
- Free: source and medium breakdown, top 10 sources, 90-day window
- Pro: campaign-level breakdown, full list, trend over time, comparison to prior period, unlimited history

**Nav:** Marketing → Traffic Sources (new tab, alongside existing Discounts tab)

**Limitation callout (always shown):** "Attribution is first-touch based on the order's landing page. Multi-touch attribution requires a pixel — see our docs for GA4 setup."

---

### Phase 2 — Deeper merchant intelligence

---

#### F35 — Abandoned Cart Analytics

**Why:** Report Pundit's Abandoned Cart is locked behind their paid plan — but merchants desperately want it. Recovery rate and lost revenue are high-stakes numbers.

**Scope needed:** Add `read_checkouts` to `shopify.app.toml` scopes.

**Reports to build:**
1. **Abandonment summary** — KPI cards: Checkouts initiated / Completed / Abandoned / Abandonment rate % / Lost revenue (abandoned cart value)
2. **Abandonment trend** — time-series of abandonment rate over selected period
3. **Top abandoned products** — which products appear most in abandoned carts but not in completed orders
4. **Cart-to-purchase time** — distribution: how long between checkout creation and order completion for those that converted

**Shopify API:** `checkouts` connection (requires `read_checkouts` scope), `checkouts.abandonedCheckoutUrl`, `checkouts.lineItems`, `checkouts.totalPrice`, `checkouts.createdAt`, `checkouts.completedAt`.

**Free/Pro split:**
- Free: summary KPIs (abandonment rate, lost revenue) for last 30 days
- Pro: trend chart, top abandoned products, unlimited history, CSV export of abandoned cart details (no customer PII in the export — item + value only)

**Nav:** Overview dashboard → new "Abandonment" metric card; Marketing → Abandoned Carts (detailed view)

**Privacy note:** Abandoned cart details contain customer email. Mask email in all UI and exports (first 2 chars + *** + domain). Never log raw email server-side.

---

#### F36 — Scheduled Report Delivery

**Why:** This is Report Pundit's "Schedules" tab — their standout differentiator. Merchants want the week's numbers in their inbox Monday morning without logging in.

**What to build:**
- Settings card: recipient email(s), schedule (Daily / Weekly — pick day + time), content selector (which panels to include)
- Email contains: Revenue / Orders / Gross Profit / Top 3 movers vs prior period / Inventory alerts (if any Critical/Out of Stock) / Repeat purchase rate
- HTML email, plain-text fallback, Polaris-inspired styling, unsubscribe link in every email
- Worker cron: hourly check, sends when due
- Skip logic: don't send if store has fewer than 14 days of order history

**Infrastructure:** Transactional email via Resend (Workers-native, generous free tier). One Resend API key as a Worker secret.

**Free/Pro split:**
- Free: weekly only, 1 recipient, fixed content (overview + profit summary)
- Pro: daily option, up to 5 recipients, content selector (pick which panels), branded with store name

**Nav:** Settings → Notifications (new tab)

---

#### F37 — Customer Segments (First-Time vs Returning)

**Why:** Report Pundit's "First Time vs Returning Customers Sales" is one of their most-used customer reports. It answers: "Is my business growing through acquisition or retention?"

**What to build (extends existing Customers section):**

**Summary cards (new row on dashboard):**
- New customers this period / % of all customers
- Returning customers this period / % of all customers  
- Revenue from new customers / Revenue from returning customers
- Repeat purchase rate (already planned)

**Trend chart:** Stacked bar — new vs returning customers per week/month over selected range

**Cohort split:** Average order value — new customer AOV vs returning customer AOV (higher returning AOV = loyalty payoff)

**Shopify API:** `orders.customer.numberOfOrders` — if 1, first-time; if >1, returning. Already in our order query.

**Free/Pro split:**
- Free: summary KPI cards, 90-day window
- Pro: trend chart, AOV comparison, unlimited history, breakdown by acquisition channel

**Nav:** Customers → Overview (add to existing panel)

---

#### F38 — Shopify Payout Report

**Why:** Report Pundit's Payout Reconciliation is locked on their trial (greyed out). Merchants reconcile payouts manually — painful.

**What to build:**
- Table: Payout date / Payout ID / Amount / Orders included / Fees deducted / Status
- Drill-down: click a payout → list of orders included + their individual transaction fees
- Reconciliation check: sum of (order revenue − fees) should equal payout amount. Flag discrepancies.

**Shopify API:** Shopify Payments payouts via `shopifyPaymentsAccount.payouts` (requires `read_shopify_payments_payouts` scope — add to toml). Only available for Shopify Payments merchants.

**Free/Pro split:**
- Free: last 3 payouts
- Pro: unlimited history, CSV export, discrepancy flagging

**Graceful degradation:** If merchant doesn't use Shopify Payments, show "Payout reports are only available for Shopify Payments merchants" with a link to Shopify's Finance section.

**Nav:** Reports → Payouts (new tab)

---

### Phase 3 — Power features

---

#### F39 — Google Sheets Live Sync

**Why:** Report Pundit's "Integrations" tab lets merchants push reports to Google Sheets. This is a sticky Pro retention feature — once your team lives in a Sheet, you don't churn.

**What to build:**
- Settings card: connect Google account (OAuth, Sheets write scope only), enter target Sheet ID
- Worker cron syncs daily (Pro: hourly option)
- Creates named sheets: Overview · Profit · Products · Customers · Returns · Tax
- Each sheet: header row + one row per day in history window
- Sync failure banner in dashboard with "Reconnect" button + last successful sync timestamp

**Infrastructure exception:** Google OAuth refresh token stored encrypted in KV (`gsheets:{shop_domain}`). This is the only exception to the stateless backend constraint — document in CLAUDE.md.

**Free/Pro split:** Pro only.

---

#### F40 — Cohort Retention Table

**Why:** Cohort retention is the gold standard for subscription/DTC business health. Report Pundit doesn't have this — it's a FirstBridge Pro differentiator.

**What to build:**
- Grid: rows = acquisition month (first-order month), columns = M+1 through M+12
- Cell = % of cohort who purchased again within that month
- Color scale: deeper green = higher retention
- LTV tab: same grid but cumulative revenue per customer rather than retention %
- Minimum cohort size: 10 customers (flag smaller cohorts with *)

**Shopify API:** `customer.orders` walk — expensive query, requires bulk-ops path for stores with >5,000 customers.

**Free/Pro split:** Free shows headline 90-day repeat rate (F37). Pro unlocks full cohort grid.

---

#### F41 — RFM Customer Segmentation

**Why:** Knowing which customers are at risk of churning is the highest-value CRM insight. No other free-tier Shopify analytics app offers it.

**Segments:** Champions · Loyal · Potential Loyalists · At Risk · Hibernating · Lost

**What to build:**
- Dashboard card per segment: count, % of customers, avg LTV, trend
- Drill-down: masked customer list per segment, CSV export
- Segment definitions are fixed (not customizable in Phase 3)

**Shopify API:** Same customer walk as F40.

**Free/Pro split:** Pro only.

---

## Updated Navigation Structure

```
FirstBridge Analytics (Shopify NavMenu)
│
├── Overview          Revenue · Orders · AOV · Repeat Rate · Abandonment rate (F35)
│                     New vs Returning split (F37) · Fulfillment alert banner (F31)
│
├── Profit            Gross profit · Net profit · P&L · Break-even
│                     (existing + Payout reconciliation link)
│
├── Products          Performance · Inventory Health (F32) · Attribution (F33) · Affinity
│
├── Customers         Overview (F37) · Geography · Retention/Cohorts (F40) · Segments (F41)
│
├── Marketing         Discounts · Traffic Sources (F34) · Abandoned Cart (F35)
│
├── Reports           Tax (F30) · Payouts (F38) · Export · Google Sheets (F39)
│
└── Settings          COGS · Expenses · Gateway Rates · Notifications (F36) · Preferences
```

---

## Free vs Pro Split — Full Picture

| Feature | Free | Pro |
|---|---|---|
| Overview metrics | ✅ All, 90-day | ✅ Unlimited history |
| Profit / P&L | ✅ Summary | ✅ + PDF, unlimited |
| Products performance | ✅ Top 10 | ✅ All products |
| Inventory Health (F32) | ✅ Top 20 at-risk, ABC top 20 | ✅ Full list, multi-location |
| Sales Attribution (F33) | ✅ Vendor / Type / Channel | ✅ + Collection, unlimited |
| UTM / Traffic Sources (F34) | ✅ Top 10 sources, 90-day | ✅ Campaign level, unlimited |
| Tax Reports (F30) | ✅ Last 2 months, country+state | ✅ Full history, product-level |
| Fulfillment Operations (F31) | ✅ Live unfulfilled orders | ✅ + Performance trend |
| New vs Returning (F37) | ✅ KPI cards, 90-day | ✅ Trend chart, unlimited |
| Abandoned Cart (F35) | ✅ Rate + lost revenue (30d) | ✅ Trend, top products, unlimited |
| Discount code performance | ✅ Top 10 | ✅ All codes |
| Geography | ✅ Country + state | ✅ City-level |
| CSV export | ✅ 90-day, watermarked | ✅ Unlimited, no watermark, ZIP |
| Scheduled email digest (F36) | ✅ Weekly, 1 recipient | ✅ Daily, 5 recipients, branded |
| Cohort retention (F40) | Headline repeat rate only | ✅ Full cohort grid |
| RFM Segments (F41) | ✗ | ✅ |
| Google Sheets sync (F39) | ✗ | ✅ |
| Payout reconciliation (F38) | ✅ Last 3 payouts | ✅ Unlimited |
| Saved views | ✅ 3 max | ✅ Unlimited |
| COGS entry | ✅ 20 SKU cap | ✅ Unlimited |

---

## Scope Changes Required

### New Shopify scopes to add (staged, not all at once)

| Scope | Required for | When to add |
|---|---|---|
| `read_checkouts` | F35 Abandoned Cart | Phase 2 |
| `read_shopify_payments_payouts` | F38 Payout Reconciliation | Phase 3 |

> Note: Adding scopes triggers a re-authorization prompt for existing merchants. Batch scope additions into as few releases as possible — do not add one scope per feature.

### New Cloudflare Worker infra

| Addition | Required for | Notes |
|---|---|---|
| Resend API key (secret) | F36 Scheduled Digest | $0 on free tier up to 3,000 emails/mo |
| Worker Cron Trigger | F36, F39 | Already supported in wrangler.toml; add `[triggers]` section |
| KV key: `gsheets:{shop}` | F39 Google Sheets | Only exception to stateless constraint |

---

## Build Sequence (recommended)

**Sprint 1 (Phase 1.5 — 2–3 weeks)**
1. F31 — Fulfillment Operations (simplest, pure `fulfillmentStatus` filter)
2. F37 — New vs Returning Customer split (uses `numberOfOrders` already in query)
3. F33 — Sales Attribution by Vendor / Type / Channel (parse existing lineItems)
4. F30 — Tax Reports (parse `taxLines` from existing order payload)

**Sprint 2 (Phase 1.5 — 2–3 weeks)**
5. F32 — Inventory Health / ABC Analysis (new `productVariants` query)
6. F34 — UTM / Traffic Source Report (parse `landingPage` URL params)

**Sprint 3 (Phase 2 — 3–4 weeks)**
7. F36 — Scheduled Email Digest (requires Resend + Worker cron)
8. F35 — Abandoned Cart (requires `read_checkouts` scope + re-auth flow)
9. F38 — Payout Reconciliation (requires `read_shopify_payments_payouts` + scope re-auth, Shopify Payments only)

**Sprint 4+ (Phase 3)**
10. F39 — Google Sheets sync
11. F40 — Cohort retention
12. F41 — RFM segments

---

## Open Questions

1. **Scope re-auth UX:** When we add `read_checkouts` (Phase 2), Shopify will prompt existing merchants to re-authorize. Plan the migration notice — in-app banner, email from Shopify, or both?
2. **Resend vs Postmark vs SES for F36:** Resend is Workers-native with a clean API. Confirm budget for transactional email at scale before committing.
3. **Tax disclaimer copy:** Legal review needed on the tax reports disclaimer. "For reference only — consult your accountant" needs to be prominent enough to avoid liability.
4. **ABC Analysis thresholds:** Standard Pareto is 20/30/50. Confirm if these are configurable or fixed. Fixed is simpler and covers 95% of stores.
5. **UTM attribution model:** First-touch only (what Shopify's `landingPage` gives us). Document the limitation clearly — merchants who run retargeting ads will see distorted attribution.
