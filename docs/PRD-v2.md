# FirstBridge Analytics — PRD v2
**Date:** 2026-05-03
**Competitive reference:** Report Pundit (5.0★, 1,848 reviews, $9–35/mo, 150+ prebuilt reports)
**Model:** Free + Pro only. Monthly billing. No per-order pricing.
**Architecture constraints:** Stateless Cloudflare Workers, no external database, Shopify as source of truth, Cloudflare D1 for aggregate caching (see D1 architecture note).

---

## Strategic Context

Report Pundit is the dominant Shopify reporting app. 150+ prebuilt reports, Google Sheets sync, scheduled delivery, and a team that custom-builds reports on request.

**Its weaknesses — and FirstBridge's opportunity:**

| Report Pundit weakness | FirstBridge response |
|---|---|
| Separate web app (app.reportpundit.com) — not embedded | Truly embedded: App Bridge, Polaris, native Shopify nav |
| Trial syncs only **3 days** of data | Live Shopify API — zero sync lag |
| Free tier capped at **<1,000 lifetime orders** | Free tier works for real active merchants |
| Table dumps — 150 reports, no interpretation | Insight-first: dashboards, delta badges, actionable callouts |
| Navigate 150 reports to find one thing | Curated views by merchant job-to-be-done |
| $35/mo Advanced; Better Reports hits $299/mo | $19–29/mo Pro, predictable forever |
| COGS/profit is a separate report, no free | Profit-aware from day one, free |

**The positioning:** Report Pundit is an analyst's tool. FirstBridge is a merchant's tool — tells you what matters without a data background.

---

## D1 Architecture Note

Cloudflare D1 (SQLite at the edge, zero operational overhead, native Workers binding) is approved for use as an aggregate cache. It does **not** replace Shopify as the source of truth.

**What goes in D1:**
- `shop_daily` — pre-computed daily roll-ups (revenue, tax, orders, new/returning customers) per shop
- `order_utm` — parsed UTM params per order for traffic attribution
- `order_tax` — tax lines per order for state/country breakdown
- `digest_schedule` — which shops have email digests configured and when they last ran

**What stays in Shopify metafields:**
- COGS per variant (`cogs.index` / `cogs.shard.*`)
- User preferences, saved views, gateway rates (`config.preferences`)
- Plan cache (`plan:*` in KV, 30s TTL)

**Shop-level isolation:** `ShopD1Client` wrapper (constructed from the verified JWT `shopDomain`, never user input) enforces `WHERE shop_domain = ?` on every query. No raw D1 binding is exposed to route handlers.

---

## What Is Already Shipped

| Feature | Status |
|---|---|
| Overview — revenue, orders, AOV, unique customers, prev-period delta | ✅ |
| Date range picker (7d / 30d / 90d presets) | ✅ |
| Profit & P&L — gross revenue, COGS, margin %, top profitable products | ✅ |
| COGS entry per variant (20-SKU Free cap), store-wide default margin % | ✅ |
| Returns analytics — by product, reasons, resolution, net revenue at risk | ✅ |
| Revenue + orders time-series, DoW chart, margin trend, return rate trend | ✅ |
| Marketing — discount code performance | ✅ |
| Customers — geography tab (country/state) | ✅ |
| CSV export per panel | ✅ |
| Expenses & gateway rates in Settings | ✅ |
| 90-day Free history clamp, 2,500-order budget, partial-results banner | ✅ |
| Billing — Free/Pro via Shopify Managed Pricing | ✅ |

---

## Report Pundit — Full Catalog (from trial, 2026-05-03)

Greyed-out items are locked on their trial plan.

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
Sales Attributed to Each Product Tag · Sales Attributed to Each Customer Tag ·
Sales Attributed to Each Order Tag

### Collections *(locked on trial)*
Sales by Collections · Best Selling Collections · Product by Collections ·
Sales Attributed to Marketing · Inventory by Collections · Sales by Collection Group ·
Sales Attributed to Each Custom Collections · Sales Attributed to Each Smart Collections

### Abandoned Cart *(locked on trial)*
Abandoned Checkout Report · Daily checkout summary

### Customer
Customer Information · Most Valuable Customers · Returning Customers ·
First Time Order Customers · Outstanding Customer Payments ·
First Time vs Returning Customers sales · Customers by Location ·
Customer Store Credit · Store Credit Transactions

### Custom Property
Line item properties · Note Attributes (Additional Information) ·
Sales and Product Metafields · Sales and Order Metafields · Sales and Customer Metafields ·
All Product Metafields · All Variant Metafields · All Customer Metafields

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

### Integrations (all external — out of scope)
ShipStation (3) · Stocky (2) · TikTok Stats · Google Ads (2) · PayPal (2) · Stripe (2) ·
Xero (2) · QuickBooks (3) · Disputes (3, locked) · GA4 (5) · Return Prime (2) ·
Loop Returns (4) · Authorize.net · Amazon Ads · Pinterest · Klarna · Square ·
Workmate (2) · Facebook Spends · Instagram Insights

---

## Gap Analysis

### Will build — pure Shopify data, fits architecture

| RP Category | Missing from PRD-v2 | Feature # |
|---|---|---|
| Sales & Orders | Last 24 Hours live view | F42 |
| Sales & Orders | Raw order table (Order Report / Detailed Sales) | F43 |
| Sales & Orders | Sales by Variant | F44 |
| Sales & Orders | Refund Report (financial) | F45 |
| Sales & Orders | Sales by Billing Location & Checkout Currency | F46 |
| Sales & Orders | Order vs Return (Monthly) | F47 |
| Sales & Orders | Orders Fulfilled In Last 30 Days, Partially Shipped, Shipping Report | F48 |
| Tag Reports | Sales by Product / Customer / Order Tag (all 6 variants) | F49 |
| Collection Reports | Sales by Collection, Best Selling Collections, Product by Collection, Inventory by Collection, Sales Attributed to Each Collection | F50 |
| Product & Variant SKU | Never Sold Products, All Products catalog, Products by Tags, Deleted product list | F51 |
| Product & Variant SKU | Sales by Variant (variant-level performance) | F44 |
| Customer | Customer Information (full list with metrics) | F52 |
| Customer | Outstanding Customer Payments | F53 |
| Custom Property | Line item properties, Note Attributes, Metafield reports | F54 |
| Transaction & Billing | Successful / Failed / Pending Transactions | F55 |
| Gift Cards | All 4 gift card reports | F56 |
| Tax | Canadian Tax detail, IOSS detail | F30 (extend) |
| Abandoned Cart | Daily checkout summary | F35 (extend) |

### Will NOT build — out of scope

| RP feature | Reason |
|---|---|
| All third-party integrations (ShipStation, GA4, TikTok Ads, Google Ads, Facebook, PayPal API, Stripe API, QuickBooks, Xero, etc.) | External OAuth refresh tokens — violates stateless Workers constraint |
| Commission Report | Requires custom staff/commission configuration |
| POS staff reports (3 variants) | Brick-and-mortar vertical; Phase 1–3 is horizontal |
| Customer Store Credit / Store Credit Transactions | POS/loyalty vertical |
| Payment Term / Payment Due on | B2B net-terms, very niche |
| Sales by Device ID | Low merchant value |
| Dispute / chargeback reports | Rare; Shopify admin handles it |
| Custom report builder (drag-and-drop) | F49 tag/metafield reports cover 80% of the use case |
| Multi-store rollup | Phase 4+ |
| Retail sales by staff at register | POS vertical |
| Bundle Item vs Non-bundle Item sales | Shopify Bundles API still maturing |

---

## Feature Roadmap

### Phase 1.5 — Close the most painful gaps

All features in this phase pull from Shopify GraphQL via the existing auth stack. No new scopes required unless noted.

---

#### F30 — Tax Reports

**Why:** Tax filing is unavoidable. Every merchant needs this monthly. RP has 10 tax variants; we own the 4 that matter for 95% of stores.

**Reports:**
1. **Monthly Tax Summary** — Month / Gross Revenue / Taxable Revenue / Total Tax Collected / by Jurisdiction. Toggle: include / exclude cancelled orders.
2. **Tax by Geography** — Country / State/Province / Tax Collected / Orders / % of Total Tax. Sortable, CSV export.
3. **Product Tax Report** (Pro) — which product types carry the most tax exposure.
4. **IOSS / International Tax** (Pro) — EU VAT flag, Canadian GST/PST split, Australian GST.

**Shopify API:** `orders.taxLines { title, rate, priceSet }`, `orders.totalTax`, `orders.shippingAddress.countryCode`, `orders.shippingAddress.province`, `orders.cancelledAt`.

**D1 cache:** `order_tax` rows written on order-create webhook and nightly backfill. Tax reports read from D1 — zero Shopify API calls at report time, enabling full history without order pagination limit.

**Free/Pro:** Free: last 2 months, country + state summary. Pro: unlimited history, product/IOSS breakdown.

**Nav:** Reports → Tax

**Disclaimer (always shown):** "Tax collected as recorded by Shopify. Consult your accountant for filing."

---

#### F31 — Fulfillment Operations

**Why:** Stuck orders (paid but not shipped) create chargebacks and 1-star reviews. Merchants check this daily.

**Reports:**
1. **Unfulfilled Orders** — order-level table: Order # / Customer / Date placed / Items / Days waiting / Value. Sorted oldest first. Alert badge if any order >3 days.
2. **Paid But Not Fulfilled** — subset of above filtered to `financialStatus: PAID`. The critical list.
3. **Orders Fulfilled in Last 30 Days** — closed view: when orders were fulfilled, median fulfillment time.
4. **Partially Shipped** — orders where some line items are fulfilled and others are not.
5. **Fulfillment Performance** — KPIs: median fulfillment time, % fulfilled within 1/3/7 days, trend chart.

**Shopify API:** `orders.fulfillmentStatus`, `orders.financialStatus`, `orders.createdAt`, `orders.fulfillments.createdAt`, `orders.fulfillments.status`.

**Free/Pro:** Free: live unfulfilled list + last 30d performance. Pro: trend, CSV, unlimited history.

**Nav:** New "Operations" tab on the Overview page (alongside the existing summary).

---

#### F32 — Inventory Health

**Why:** RP has 12 inventory reports. We consolidate into one smart panel with three tabs.

**Tab 1 — Stock Alerts:**
- Variant / SKU / Current stock / 30d sell rate / Est. days remaining / Status badge
- Status: Healthy (>60d) · Watch (30–60d) · At Risk (15–30d) · Critical (<15d) · Out of Stock (0)
- Default sort: most critical first. Merchant configures lead time in Settings (default 14d).

**Tab 2 — ABC Analysis:**
- A-class = top 20% of revenue, B = next 30%, C = bottom 50%
- Columns: Product / ABC class / Revenue % / Cumulative % / Units sold / Stock on hand / Stock coverage (days) / Reorder flag
- Insight callout: "Your A-class [N products] drives [X]% of revenue. Prioritise reorders here."

**Tab 3 — Inventory Value:**
- Total inventory value at cost (units × COGS) and at retail (units × price)
- Breakdown by vendor and by product type
- Requires COGS config; shows setup banner if absent

**Shopify API:** `productVariants.inventoryItem.inventoryLevels.available`, `productVariants.price`, `productVariants.sku`, `orders.lineItems.variant.id`, `orders.lineItems.quantity`.

**Free/Pro:** Free: Stock Alerts top 20 at-risk; ABC top 20; Inventory Value summary total. Pro: full lists, all tabs, multi-location, CSV export.

**Nav:** Products → Inventory

---

#### F33 — Sales Attribution

**Why:** "Sales by Vendor," "by Channel," "by Product Type," "by Collection" are RP's most-used reports. They answer "which part of my catalogue is working?"

**Tab 1 — By Vendor:** Vendor / Orders / Revenue / Units / Avg margin % / Return rate %

**Tab 2 — By Product Type:** Product Type / Orders / Revenue / Units / Margin %

**Tab 3 — By Channel:** Channel (Online Store, POS, Draft, Wholesale, etc.) / Orders / Revenue / AOV / Return rate %

**Tab 4 — By Collection** (Pro): Collection / Orders / Revenue / Units / Top product in collection

**Tab 5 — By POS Location** (Pro): Location name / Orders / Revenue / AOV — for merchants with physical stores

**Shopify API:** `orders.lineItems.product.vendor`, `orders.lineItems.product.productType`, `orders.channelInformation.channelName`, `orders.sourceChannel`, `orders.physicalLocation.name`.

**Free/Pro:** Free: Tabs 1–3, 90-day window. Pro: Tabs 4–5, unlimited history, CSV.

**Nav:** Products → Attribution

---

#### F34 — UTM & Traffic Source Report

**Why:** "Where do my orders come from?" is a top-5 question. RP has 6 separate UTM reports; we build one consolidated view.

**Panel layout:** Filter tabs — All / Organic / Paid / Direct / Email / Social

**Summary cards:** Top source by revenue · Top campaign by orders · Direct % of total

**Table:** Source / Medium / Campaign / Orders / Revenue / AOV / Share %

**Parsing logic (server-side):**
- Parse `?utm_source`, `?utm_medium`, `?utm_campaign` from `orders.landingPage`
- No UTM + referrer present → referral (extract root domain)
- No UTM + no referrer → direct
- `utm_medium` = "cpc" / "paid" / "ppc" → paid
- `utm_medium` = "email" → email
- Referring domain matches known social list → social

**D1 cache:** `order_utm` rows written on order webhook. Report reads from D1 — enables full history without pagination.

**Free/Pro:** Free: source + medium, top 10 rows, 90d. Pro: campaign level, full list, trend, unlimited history.

**Nav:** Marketing → Traffic Sources

**Limitation banner (always shown):** "First-touch attribution from order landing page. Multi-touch requires a pixel."

---

#### F35 — Abandoned Cart Analytics

**Why:** RP's abandoned cart reports are locked on their paid plan. Recovery rate is one of the highest-impact metrics for e-commerce.

**Requires:** `read_checkouts` scope added to `shopify.app.toml` (triggers merchant re-auth — batch with other Phase 2 scopes).

**Reports:**
1. **Abandonment Summary** — KPI cards: Checkouts initiated / Completed / Abandoned / Abandonment rate % / Est. lost revenue
2. **Daily Checkout Summary** — time-series of abandonment rate and lost revenue by day
3. **Top Abandoned Products** — which products appear most in abandoned carts but not completed orders
4. **Cart-to-Purchase Time** — distribution: 0–1h / 1–24h / 1–7d / 7d+ for converted checkouts

**Shopify API:** `checkouts` connection, `checkouts.lineItems`, `checkouts.totalPrice`, `checkouts.createdAt`, `checkouts.completedAt`.

**Free/Pro:** Free: summary KPIs, last 30 days. Pro: trend chart, top products, cart-to-purchase time, unlimited history.

**Privacy:** Customer email masked in all views. Never logged server-side.

**Nav:** Marketing → Abandoned Cart

---

#### F36 — Scheduled Report Delivery

**Why:** RP's "Schedules" tab is their stickiest differentiator. Merchants want the week's numbers in their inbox without logging in.

**Settings card:** Recipient email(s) / Schedule (Daily or Weekly — pick day + time) / Content toggle (which panels)

**Email content:** Revenue / Orders / Gross Profit / Top 3 movers vs prior period / Inventory alerts (Critical or Out of Stock) / Repeat purchase rate

**Infrastructure:** Resend API (Workers-native, $0 on free tier ≤3,000 emails/mo) + Worker Cron Trigger (hourly check).

**Free/Pro:** Free: weekly, 1 recipient, fixed content. Pro: daily, 5 recipients, branded, content selector.

**Nav:** Settings → Notifications

---

#### F37 — New vs Returning Customer Split

**Why:** RP's "First Time vs Returning Customers Sales" report. Answers: "Is my growth acquisition or retention?"

**New cards on Overview dashboard:**
- New customers this period / % of all customers
- Returning customers this period / % of all customers
- Revenue from new vs returning (bar comparison)
- New customer AOV vs returning customer AOV

**Trend chart (Pro):** Stacked bar — new vs returning per week over selected range.

**Shopify API:** `orders.customer.numberOfOrders` — if 1, first-time; >1, returning. Already in our order query payload.

**Free/Pro:** Free: KPI cards, 90-day. Pro: trend chart, channel breakdown, unlimited history.

**Nav:** Customers → Overview (add to existing panel)

---

#### F38 — Shopify Payout Report

**Why:** RP's payout reconciliation is locked on their trial. Merchants reconcile payouts manually — painful.

**Reports:**
1. **Payout List** — Payout date / Payout ID / Amount / Orders included / Fees deducted / Status (paid / in\_transit / failed)
2. **Payout Drill-down** — click a payout → list of orders + individual transaction fees
3. **Reconciliation Check** — sum of (order revenue − fees) vs payout amount; flag discrepancies

**Requires:** `read_shopify_payments_payouts` scope (Shopify Payments merchants only).

**Free/Pro:** Free: last 3 payouts. Pro: unlimited history, CSV, discrepancy flagging.

**Graceful degradation:** If not on Shopify Payments → "Payout reports are only available for Shopify Payments merchants."

**Nav:** Reports → Payouts

---

#### F42 — Last 24 Hours Live View

**Why:** RP's "Last 24 Hours Orders" is an operational quick-check. Merchants want a real-time snapshot without navigating report settings.

**What to build:**
- Persistent banner/card on the Overview dashboard (above the main date-range content): "Today so far" → Revenue / Orders / AOV / last updated timestamp
- Refreshes on page load (no websocket — pull on visit)
- Clicking "View orders" navigates to F43 (Order Report) filtered to last 24h

**Shopify API:** `orders(query: "created_at:>'${yesterday}'")` — lightweight query, first page only (250 orders max).

**Free/Pro:** Free (no history gating — this is always the current day).

**Nav:** Overview dashboard header card.

---

#### F43 — Order Report (Raw Order Table)

**Why:** RP's "Order Report" and "Detailed Sales Report" give merchants a row-per-order view they can filter, sort, and export. This is the most-requested "raw data" view.

**Table columns:** Order # / Date / Customer / Channel / Payment status / Fulfillment status / Items / Gross revenue / Discounts / Shipping charged / Tax / Net revenue / Gateway / Tags

**Features:**
- Sortable by any column
- Filter by: date range, payment status, fulfillment status, channel, tag
- Search by order number
- Click order → Shopify admin order detail (deep link, new tab)
- Pagination: 250 rows/page

**Shopify API:** `orders` with all relevant fields. Reuses existing order pagination.

**Free/Pro:** Free: last 90 days, 1,000 rows max, CSV with watermark. Pro: unlimited history, full export, no row cap.

**Nav:** Reports → Orders

---

#### F44 — Sales by Variant

**Why:** RP has "Sales by Variant (existing SKUs)" — merchants need variant-level performance (size S vs L, color red vs blue) not just product-level.

**Table columns:** Product / Variant / SKU / Units sold / Revenue / Refunded units / Return rate % / Avg selling price / Inventory remaining

**Features:**
- Search/filter by product name or SKU
- Sort by any column
- Group by parent product (expandable rows)

**Shopify API:** `orders.lineItems.variant.id`, `orders.lineItems.variant.title`, `orders.lineItems.sku`, `orders.lineItems.quantity`, `orders.lineItems.originalTotalPriceSet`.

**Free/Pro:** Free: top 20 variants by revenue, 90-day. Pro: all variants, unlimited history.

**Nav:** Products → Performance → Variant tab (alongside existing product-level tab)

---

#### F45 — Refund Report

**Why:** RP's "Refund Report" is a standalone financial view of all refunds. Our returns analytics shows returns by product; this shows the financial dimension — when money went back, how much, which orders.

**Table columns:** Refund date / Order # / Customer / Refunded amount / Reason / Restocked items / Refund method (to original payment / store credit / manual)

**KPI cards above table:** Total refunded this period / % of gross revenue / Avg refund value / Refunds by reason (pie)

**Shopify API:** `orders.refunds { createdAt, totalRefundedSet, refundLineItems { quantity, restockType }, note }`.

**Free/Pro:** Free: 90-day window, top-line KPIs + table. Pro: unlimited history, trend chart, refund method breakdown.

**Nav:** Reports → Refunds (new tab)

---

#### F46 — Sales by Billing Location & Checkout Currency

**Why:** RP has "Sales by Billing Location" and "Sales by Checkout Currency" as separate reports. For international merchants, billing location differs from shipping and checkout currency reveals FX patterns.

**Two sub-reports on one page:**

**Tab 1 — By Billing Location:** Country / State / Orders / Revenue / AOV (from `orders.billingAddress` — not shipping address)

**Tab 2 — By Checkout Currency:** Currency / Orders / Revenue in presentment currency / Revenue in shop currency / FX rate range

**Shopify API:** `orders.billingAddress.countryCode`, `orders.billingAddress.province`, `orders.presentmentCurrencyCode`, `orders.totalPriceSet.presentmentMoney`, `orders.presentmentCurrencyRate`.

**Free/Pro:** Free: country-level only, 90-day. Pro: state-level, currency detail, unlimited history.

**Nav:** Reports → Geography tab (extend existing geography section) or Reports → Currency

---

#### F47 — Order vs Return (Monthly)

**Why:** RP's "Order vs Return (Monthly)" gives a month-by-month comparison of orders placed vs orders returned. Merchants want to see if their return rate is trending up.

**What to build:** Monthly bar chart — Orders placed (blue) / Orders with at least one return (red) / Net return rate % (line overlay)

**Table below chart:** Month / Orders / Returned orders / Return rate % / Gross revenue / Refunded / Net revenue

**Shopify API:** `orders.createdAt`, `orders.refunds` (already in our order payload).

**Free/Pro:** Free: last 6 months. Pro: unlimited history.

**Nav:** Reports → Returns → Monthly tab (extend existing returns section)

---

#### F48 — Fulfillment Extensions

**Why:** RP has Shipping Report and Partially Shipped as separate reports not covered in F31.

**New additions to F31 (Fulfillment Operations):**

**Tab: Shipping Report** — shipping revenue collected vs est. carrier cost per order. Columns: Order # / Shipping charged / Carrier / Service / Est. cost / Shipping P&L.

**Tab: Partially Shipped** — orders where `fulfillmentStatus: PARTIAL`. Columns: Order # / Fulfilled items / Unfulfilled items / Days since partial ship / Customer.

**Shopify API:** `orders.shippingLines { title, carrierIdentifier, discountedPriceSet, source }`, `orders.fulfillmentStatus`.

**Free/Pro:** Both tabs Free (operational data, not historical analytics).

**Nav:** Overview → Operations → new tabs

---

#### F49 — Tag Attribution Reports

**Why:** RP's entire "Tag Reports" section (6 reports) is missing from PRD-v2. Tag-based reporting is one of RP's most-used features — merchants tag orders for campaigns, wholesale vs retail, B2B, etc.

**Reports to build (single page, tabbed):**

**Tab 1 — By Order Tag:** Tag / Orders / Revenue / AOV / Return rate %. Example: tag "wholesale" vs "retail" vs "influencer-promo".

**Tab 2 — By Product Tag:** Tag / Products / Units sold / Revenue / Margin %. Example: "summer-collection", "clearance", "bundle".

**Tab 3 — By Customer Tag:** Tag / Customers / Orders / Revenue / Avg LTV. Example: "vip", "wholesale-account", "loyalty-member".

**Detail view:** Click any tag → see the individual orders/products/customers with that tag.

**Shopify API:** `orders.tags`, `orders.lineItems.product.tags`, `orders.customer.tags`, `orders.totalPriceSet`.

**Free/Pro:** Free: Order tags + Product tags, top 10 tags each, 90-day. Pro: Customer tags, full list, unlimited history, per-tag trend.

**Nav:** Reports → Tags (new section)

---

#### F50 — Collection Reports

**Why:** RP's entire "Collections" section (8 reports, locked on trial) is missing. Collection-level performance is how merchants understand their catalogue architecture — are the groupings they've created actually driving revenue?

**Reports to build (single page, tabbed):**

**Tab 1 — Sales by Collection:** Collection / Orders / Revenue / Units / AOV / Return rate %

**Tab 2 — Best Selling Collections:** Ranked list by revenue with period-over-period delta

**Tab 3 — Products in Collection:** Collection filter → product list ranked by revenue within that collection

**Tab 4 — Inventory by Collection** (Pro): Collection / Total SKUs / In stock / Out of stock / Est. days of stock at current sell rate

**Shopify API:** Requires two-step: first fetch `collections` to build a product→collection mapping, then attribute orders. Use `collections(first: 250)` + `collection.products`. Cache product→collection map in D1.

**Free/Pro:** Free: Tabs 1–2, top 10 collections, 90-day. Pro: All tabs, full list, unlimited history, CSV.

**Nav:** Products → Collections (new tab)

---

#### F51 — Product Catalog Reports

**Why:** RP has "Never Sold Products," "All Product," "Products by Tags," and "Deleted product list" — each answers a distinct catalogue health question.

**Reports to build (four sub-reports, one page):**

**Tab 1 — Never Sold:** Products with zero units sold in the selected period. Columns: Product / SKU / Vendor / Price / Inventory / Days since created. Useful for identifying dead stock.

**Tab 2 — Full Product Catalog:** All products with sales data overlay. Columns: Product / Vendor / Type / Tags / Variants / Price range / Units sold / Revenue / Return rate. Filterable by vendor, type, tag.

**Tab 3 — Products by Tag:** Tag → ranked product list within that tag. Different from F49 (which is tag → order/revenue aggregates); this is tag → product breakdown.

**Tab 4 — Deleted Products in Orders** (Pro): Products that have since been deleted from Shopify but still appear in historical orders. Important for accurate revenue attribution.

**Shopify API:** `products(first: 250)` for catalog; `orders.lineItems.product.id` cross-referenced against current product list for deleted detection.

**Free/Pro:** Free: Tabs 1–3, 90-day sales data. Pro: Tab 4, full history, CSV.

**Nav:** Products → Catalog (new tab)

---

#### F52 — Customer Information Report

**Why:** RP's "Customer Information" report is a filterable, exportable customer list with key metrics. CRM-lite for merchants who don't have a separate CRM.

**Table columns:** Customer ID / Name (masked) / Email (masked) / Location / Total orders / Total spend / AOV / First order date / Last order date / Avg days between orders / Tags

**Features:**
- Filter by: order count range, spend range, location, customer tag, date of first order
- Sort by any column
- Search by customer ID or partial masked email

**Shopify API:** `customers { id, firstName, lastName, email, ordersCount, totalSpentV2, createdAt, tags, addresses { city, countryCode } }` with pagination.

**Privacy:** `firstName` shown as first letter + "***". Email shown as `al***@example.com`. Never log full name or email server-side.

**Free/Pro:** Free: top 100 customers by spend, 90-day filter. Pro: full customer list, all filters, unlimited history, CSV export.

**Nav:** Customers → All Customers (new tab)

---

#### F53 — Outstanding Customer Payments

**Why:** RP's "Outstanding Customer Payments" tracks orders where payment is not yet complete — draft orders, net-terms B2B, partial payments. Merchants using draft orders for wholesale need this.

**What to build:**
- Table: Order # / Customer / Order date / Due date (if set) / Amount outstanding / Status (pending / authorized / partially paid)
- Total outstanding amount KPI card at top
- Filter by financial status

**Shopify API:** `orders(query: "financial_status:pending OR financial_status:authorized OR financial_status:partially_paid")`, `orders.totalOutstandingSet`.

**Free/Pro:** Free. No history gating — this is a live operational view.

**Nav:** Reports → Outstanding Payments (or Operations tab)

---

#### F54 — Custom Property Reports (Line Items, Note Attributes, Metafields)

**Why:** RP's entire "Custom Property Reports" section (8 reports) is missing. This is one of RP's most powerful differentiators — merchants use line item properties for custom engraving, gift messages, product customization. Metafield reports let them query custom data they've added to products/orders/customers.

**Reports to build:**

**Tab 1 — Line Item Properties:** All distinct property keys found in `lineItems.properties` across orders. Select a key → see value distribution + revenue breakdown per value. Example: "gift_message" (yes/no), "engraving_text" (free text → group by has/doesn't have).

**Tab 2 — Note Attributes (Order):** Same pattern for `order.noteAttributes`. Shows custom checkout fields (e.g. "How did you hear about us?", "PO number").

**Tab 3 — Product Metafields:** Select a product metafield namespace + key → see all distinct values + units sold / revenue per value. Example: `custom.material` = "cotton" vs "polyester" → which sells better.

**Tab 4 — Order Metafields** (Pro): Same for order-level metafields.

**Tab 5 — Customer Metafields** (Pro): Same for customer-level metafields.

**Shopify API:**
- `orders.lineItems.properties { name, value }`
- `orders.noteAttributes { name, value }`
- `products.metafields(namespace: $ns, key: $key)`
- `orders.metafields(namespace: $ns, key: $key)` (Pro)
- `customers.metafields(namespace: $ns, key: $key)` (Pro)

**UX:** Key discovery — on first load, scan last 30 days of orders and surface all distinct property/attribute/metafield keys found. Merchant picks which key to report on. Keys are cached in `config.preferences.customPropKeys`.

**Free/Pro:** Free: Tabs 1–3 (line item props + note attributes + product metafields), top 50 distinct values. Pro: Tabs 4–5, unlimited values, trend over time.

**Nav:** Reports → Custom Data (new section)

---

#### F55 — Transaction Status Reports

**Why:** RP's Transaction & Billing section has Successful / Failed / Pending Transactions — useful for detecting payment failures and understanding gateway reliability.

**Reports to build (tabbed):**

**Tab 1 — All Transactions:** Transaction date / Order # / Gateway / Amount / Status / Failure reason (if failed)

**Tab 2 — Failed Transactions:** Filtered to `status: failure`. Table shows failure reason. KPI: failure rate % by gateway. Useful for spotting a gateway issue.

**Tab 3 — Transaction Value by Gateway:** Gateway / Transaction count / Total value / Success rate % / Avg transaction value

**Shopify API:** `orders.transactions { gateway, status, amount, errorCode, processedAt }`.

**Free/Pro:** Free: Tab 3 (gateway summary), last 30 days. Pro: Tabs 1–2 (full transaction list), unlimited history.

**Nav:** Reports → Transactions (new tab)

---

#### F56 — Gift Card Reports

**Why:** RP has 4 gift card reports. Merchants selling gift cards need to track outstanding liability, redemption rates, and expiry.

**Reports to build (single page, tabbed):**

**Tab 1 — Gift Card Overview:** KPI cards: Total issued (last period) / Total redeemed / Total outstanding liability / Expiring in next 30 days

**Tab 2 — Expired or Unused:** Gift cards with balance remaining that have expired or have never been used.

**Tab 3 — Issuance & Activation:** Table of issued gift cards with: Issue date / Initial value / Balance remaining / Expiry date / First used date.

**Tab 4 — Redemption by Customer:** Which customers have redeemed gift cards; how much. Useful for loyalty analysis.

**Shopify API:** `giftCards { id, initialValue, balance, expiresOn, createdAt, lastCharacters, customer { id } }`, `giftCards.usage`.

**Requires:** `read_gift_cards` scope (add to toml with Phase 2 scope batch).

**Free/Pro:** Free: Tab 1 (Overview KPIs only). Pro: All tabs, full history, CSV.

**Nav:** Reports → Gift Cards

---

### Phase 2 — Deeper merchant intelligence

---

#### F39 — Google Sheets Live Sync

**Why:** RP's "Integrations" tab lets merchants push reports to Google Sheets on a schedule. This is a sticky Pro retention feature — once a team's workflow depends on a Sheet, they don't churn.

**What to build:**
- Settings card: Connect Google (OAuth, Sheets write scope only) → enter target Sheet ID
- Worker cron: daily sync (Pro: hourly option)
- Creates named sheets: Overview · Profit · Products · Customers · Returns · Tax
- Each sheet: header row + one data row per day in history window
- Failure: dashboard banner "Google Sheets sync failed — reconnect" + last successful sync timestamp

**Infrastructure exception:** Google OAuth refresh token stored encrypted in KV (`gsheets:{shop_domain}`). Only exception to stateless backend constraint — documented.

**Free/Pro:** Pro only.

---

#### F40 — Cohort Retention Table

**Why:** Gold standard for subscription/DTC health. RP doesn't have this — FirstBridge Pro differentiator.

**Grid:** Rows = acquisition month, columns = M+1 through M+12. Cell = % of cohort who re-purchased.

**LTV tab:** Same structure but cumulative revenue per customer at each month interval.

**Shopify API:** Full `customer.orders` walk — expensive. Requires D1 pre-computation via nightly cron.

**Free/Pro:** Free: headline 90-day repeat rate (F37). Pro: full cohort grid.

---

#### F41 — RFM Customer Segmentation

**Why:** Knowing which customers are at churn risk is the highest-value CRM insight. No free-tier Shopify analytics app offers it.

**Segments:** Champions · Loyal · Potential Loyalists · At Risk · Hibernating · Lost

**What to build:** Dashboard card per segment: count, % of customers, avg LTV, trend. Drill-down: masked customer list + CSV.

**Free/Pro:** Pro only.

---

### Phase 3 — Power features

#### F57 — Multi-Currency Revenue Normalization
Report all revenue in a single reporting currency using `orders.presentmentCurrencyRate` (rate locked at order time — no external FX API).
**Free/Pro:** Pro only.

#### F58 — Weight-Based Shipping Cost Allocation
Allocate per-order shipping cost to line items by weight rather than revenue share. Uses `orders.lineItems.variant.weight`.
**Free/Pro:** Pro only.

#### F59 — Product Affinity (Frequently Bought Together)
Which product pairs co-occur most in the same order. Top 20 pairs free; all pairs Pro.

#### F60 — Customer LTV by Acquisition Cohort
Cumulative revenue per customer, broken out by acquisition month. Pro only. D1-backed.

#### F61 — RFM + Acquisition Channel Overlay
Combine RFM segmentation (F41) with UTM source attribution (F34) — which acquisition channel produces the best long-term customers. Pro only.

---

## Updated Navigation Structure

```
FirstBridge Analytics (Shopify NavMenu)
│
├── Overview
│   ├── "Today so far" card (F42)
│   ├── Date-range metrics grid (existing)
│   ├── New vs Returning cards (F37)
│   └── Operations tab — Fulfillment (F31, F48)
│
├── Profit
│   ├── Dashboard — gross profit, net profit, gateway fees, shipping P&L
│   └── P&L Report — full line-item statement
│
├── Products
│   ├── Performance — product + variant (F44)
│   ├── Inventory — Stock alerts + ABC + Value (F32)
│   ├── Attribution — By vendor / type / channel / collection (F33)
│   ├── Collections (F50)
│   └── Catalog — Never sold / All products / By tag (F51)
│
├── Customers
│   ├── Overview — new vs returning (F37), top customers
│   ├── All Customers — full list (F52)
│   ├── Geography — country/state heat map
│   └── Retention — cohort grid + LTV + RFM (F40, F41) [Pro]
│
├── Marketing
│   ├── Discounts — discount code performance
│   ├── Traffic Sources — UTM attribution (F34)
│   └── Abandoned Cart (F35)
│
├── Reports
│   ├── Orders — raw order table (F43)
│   ├── Refunds — financial refund view (F45)
│   ├── Returns — monthly trend (F47)
│   ├── Tax (F30)
│   ├── Transactions (F55)
│   ├── Payouts (F38)
│   ├── Gift Cards (F56)
│   ├── Tags (F49)
│   ├── Custom Data — line item props, note attrs, metafields (F54)
│   ├── Currency & Location (F46)
│   └── Outstanding Payments (F53)
│
└── Settings
    ├── COGS — variant cost entry
    ├── Expenses — monthly ad spend + fixed costs
    ├── Gateway Rates — payment fee config
    ├── Notifications — email digest schedule (F36)
    ├── Google Sheets — sync config (F39) [Pro]
    └── Preferences — saved views, lead time, price bands
```

---

## Free vs Pro — Complete Split

| Feature | Free | Pro |
|---|---|---|
| Overview metrics | ✅ All, 90-day | ✅ Unlimited |
| Today so far (F42) | ✅ | ✅ |
| New vs returning (F37) | ✅ KPI cards | ✅ + trend, unlimited |
| Profit / P&L | ✅ Summary | ✅ + PDF, unlimited |
| Products performance | ✅ Top 10, product-level | ✅ All products |
| Sales by Variant (F44) | ✅ Top 20 variants | ✅ All variants |
| Inventory Health (F32) | ✅ Top 20 at-risk, ABC top 20 | ✅ Full lists, multi-location |
| Sales Attribution (F33) | ✅ Vendor / Type / Channel | ✅ + Collection, POS, unlimited |
| Collection Reports (F50) | ✅ Top 10 collections | ✅ All tabs, inventory by collection |
| Product Catalog (F51) | ✅ Never sold, full catalog, by tag | ✅ + Deleted products history |
| UTM / Traffic Sources (F34) | ✅ Top 10 sources, 90-day | ✅ Campaign level, unlimited |
| Tag Reports (F49) | ✅ Order + product tags, top 10 | ✅ Customer tags, full list |
| Tax Reports (F30) | ✅ Last 2 months, country/state | ✅ Full history, product/IOSS |
| Fulfillment Operations (F31, F48) | ✅ Live unfulfilled, shipping, partial | ✅ + trend, unlimited |
| Order Report (F43) | ✅ 90-day, 1,000 rows | ✅ Unlimited, full export |
| Refund Report (F45) | ✅ 90-day | ✅ Unlimited, trend |
| Order vs Return Monthly (F47) | ✅ Last 6 months | ✅ Unlimited |
| Sales by Location/Currency (F46) | ✅ Country-level | ✅ State-level, currency detail |
| Customer List (F52) | ✅ Top 100 by spend | ✅ Full list, all filters |
| Outstanding Payments (F53) | ✅ (live operational) | ✅ |
| Custom Property Reports (F54) | ✅ Line items + note attrs + product metafields | ✅ + Order/customer metafields |
| Transaction Reports (F55) | ✅ Gateway summary | ✅ Full transaction list |
| Gift Card Reports (F56) | ✅ KPI overview | ✅ All tabs |
| Payout Reconciliation (F38) | ✅ Last 3 payouts | ✅ Unlimited |
| Abandoned Cart (F35) | ✅ Rate + lost revenue, 30d | ✅ Trend, products, unlimited |
| Scheduled email digest (F36) | ✅ Weekly, 1 recipient | ✅ Daily, 5 recipients, branded |
| Discount code performance | ✅ Top 10 | ✅ All codes |
| Geography | ✅ Country + state | ✅ City-level |
| CSV export | ✅ 90-day, watermarked | ✅ Unlimited, no watermark, ZIP |
| Cohort retention (F40) | Headline repeat rate only | ✅ Full cohort grid |
| RFM Segments (F41) | ✗ | ✅ |
| Google Sheets sync (F39) | ✗ | ✅ |
| COGS entry | ✅ 20 SKU cap | ✅ Unlimited |
| Saved views | ✅ 3 max | ✅ Unlimited |

---

## Scope Changes Required

### New Shopify scopes (batch additions — minimize re-auth events)

| Scope | Required for | Batch |
|---|---|---|
| `read_checkouts` | F35 Abandoned Cart | Batch 1 (Phase 2 launch) |
| `read_gift_cards` | F56 Gift Cards | Batch 1 |
| `read_shopify_payments_payouts` | F38 Payout Reconciliation | Batch 1 |

> Strategy: add all three scopes in a single release so merchants re-authorize once, not three times.

### New Cloudflare infrastructure

| Addition | Required for | Notes |
|---|---|---|
| D1 database binding (`ANALYTICS_DB`) | F30 Tax, F34 UTM, F40 Cohorts, F50 Collections | Free tier covers us for a long time |
| Resend API key secret | F36 Email Digest | $0 ≤3,000 emails/mo |
| Worker Cron Trigger | F36 Digest, F39 Sheets, D1 nightly backfill | Add `[triggers]` section in wrangler.toml |
| KV key `gsheets:{shop}` | F39 Google Sheets | Only exception to stateless constraint |

---

## Build Sequence

**Sprint 1** (Phase 1.5 — 2 weeks)
1. F42 — Last 24 Hours (XS — quick win, uses existing query)
2. F37 — New vs Returning (S — `numberOfOrders` already in payload)
3. F47 — Order vs Return Monthly (S — existing order + refund data)
4. F43 — Order Report table (M — new UI, reuses existing paginator)
5. F45 — Refund Report (S — `orders.refunds` already fetched)

**Sprint 2** (Phase 1.5 — 2 weeks)
6. F31 + F48 — Fulfillment Operations + extensions (M)
7. F33 — Sales Attribution (M — vendor/type/channel from existing lineItems)
8. F44 — Sales by Variant (S — extend F33 with variant grouping)
9. F49 — Tag Reports (M — `orders.tags` already in query)

**Sprint 3** (Phase 1.5 — 2–3 weeks)
10. F30 — Tax Reports (M — needs D1 setup first)
11. F50 — Collection Reports (M — needs product→collection mapping in D1)
12. F51 — Product Catalog Reports (M — new product query)
13. F34 — UTM / Traffic Sources (M — needs D1 `order_utm` table)

**Sprint 4** (Phase 1.5 / early Phase 2 — 2–3 weeks)
14. F32 — Inventory Health (M — new `productVariants` query)
15. F52 — Customer Information (M — new `customers` query)
16. F53 — Outstanding Payments (S)
17. F54 — Custom Property Reports (L — key discovery UX)
18. F55 — Transaction Reports (S — `orders.transactions`)
19. F56 — Gift Cards (M — new scope + new `giftCards` query)

**Sprint 5** (Phase 2 — 3 weeks)
20. F36 — Scheduled Email Digest (L — Resend + cron)
21. F35 — Abandoned Cart (L — new `read_checkouts` scope + re-auth)
22. F38 — Payout Reconciliation (M)
23. F46 — Sales by Billing Location / Currency (S)

**Sprint 6+** (Phase 3)
24. F39 — Google Sheets sync
25. F40 — Cohort retention
26. F41 — RFM segmentation
27. F57–F61 — Power features

---

## Open Questions

1. **D1 backfill strategy on install:** How far back do we backfill for new installs? 90 days on Free, 1 year on Pro? Bulk operations needed for large stores.
2. **Scope re-auth UX:** What in-app notice do we show before Batch 1 scope addition? Banner → "We're adding new features that need re-authorization."
3. **Resend vs alternatives:** Confirm budget before committing. Resend free tier is 3,000 emails/mo; at 1,000 Pro merchants each with weekly digests = 4,000 emails/mo → $20/mo on Resend.
4. **Tax disclaimer review:** Get legal sign-off on "for reference only" language before shipping F30.
5. **Customer masking standard:** Lock down the masking algorithm now so it's consistent across F52, F37, existing top-customers panel. Proposal: `Al***` + `***@example.com` — never full name or full email.
6. **Pro price point:** $19, $24, or $29/mo? With this expanded feature set, $24 is defensible.
