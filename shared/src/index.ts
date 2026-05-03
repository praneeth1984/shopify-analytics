/**
 * Shared types between the embedded app and the backend.
 * Keep this surface small — types here are part of the wire contract.
 */

export type Money = {
  amount: string;
  currency_code: string;
};

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "month_to_date"
  | "year_to_date"
  | "custom";

export type DateRange = {
  preset: DateRangePreset;
  start: string; // ISO date (UTC)
  end: string; // ISO date (UTC), exclusive
};

export type ComparisonMode = "previous_period" | "previous_year" | "none";

export type MetricValue<T> = {
  current: T;
  previous: T | null;
  delta_pct: number | null;
};

export type PendingReturns = {
  count: number;
  value: Money | null;
};

/**
 * Time-series chart support.
 *
 * Granularity flips from daily to weekly buckets when the requested range
 * exceeds 90 days, so the dashboard charts stay readable on long ranges.
 *
 * `value` semantics depend on the series:
 *   - revenue / refund value: minor currency units (integer; safe up to ~9e15)
 *   - orders / units: raw counts
 *   - rates (return rate, margin): basis points (1 = 0.01%, 10000 = 100%)
 *   - `null` means "no data in that bucket" so charts can avoid drawing through
 *     gaps (Recharts with `connectNulls={false}`).
 */
export type Granularity = "day" | "week";

export type TimeSeriesPoint = {
  date: string; // ISO date "YYYY-MM-DD" (UTC; week buckets use the Monday)
  value: number | null;
};

export type DowPoint = {
  dow: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  label: "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
  revenue_minor: number;
  orders: number;
};

export type OverviewMetrics = {
  range: DateRange;
  comparison: ComparisonMode;
  revenue: MetricValue<Money>;
  orders: MetricValue<number>;
  average_order_value: MetricValue<Money>;
  unique_customers: MetricValue<number>;
  conversion_rate_pct: MetricValue<number> | null; // null if shop has no online_store sales channel
  pending_returns: PendingReturns;
  granularity: Granularity;
  revenue_series: TimeSeriesPoint[];
  orders_series: TimeSeriesPoint[];
  revenue_by_dow: DowPoint[];
  return_rate_series: TimeSeriesPoint[]; // basis points; null when 0 orders in bucket
  revenue_series_previous?: TimeSeriesPoint[];
  orders_series_previous?: TimeSeriesPoint[];
  // F37: new vs returning customer split. Counts orders in the range whose
  // customer.numberOfOrders === 1 (first-time) vs > 1 (returning).
  // Orders with no customer (e.g. guest with no email) are not counted in either bucket.
  new_customers: number;
  returning_customers: number;
  new_customer_revenue: Money;
  returning_customer_revenue: Money;
  new_customer_aov: Money;
  returning_customer_aov: Money;
};

// ---- F42: Live Metrics (last 24 hours) ----

export type LiveMetrics = {
  orders: number;
  gross_revenue: Money;
  aov: Money;
  as_of: string; // ISO timestamp at which metrics were computed
  window_start: string; // ISO timestamp — start of the 24-hour window
  window_end: string;   // ISO timestamp — end of the 24-hour window (= as_of)
};

export type ReturnedVariant = {
  variant_id: string;
  sku: string | null;
  ordered_units: number;
  returned_units: number;
  return_rate: number;
};

export type ReturnedProduct = {
  product_id: string;
  title: string;
  ordered_units: number;
  returned_units: number;
  return_rate: number;
  refunded_value: Money;
  variants?: ReturnedVariant[];
};

export type ReturnsByProductResponse = {
  range: DateRange;
  products: ReturnedProduct[];
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
  excluded_low_volume_count: number;
};

export type ReturnReasonCode =
  | "COLOR"
  | "DEFECTIVE"
  | "NOT_AS_DESCRIBED"
  | "OTHER"
  | "SIZE_TOO_LARGE"
  | "SIZE_TOO_SMALL"
  | "STYLE"
  | "UNKNOWN"
  | "UNWANTED"
  | "WRONG_ITEM";

export type ReturnReasonVariantBreakdown = {
  variant_id: string;
  product_title: string;
  units: number;
};

export type ReturnReasonRow = {
  code: ReturnReasonCode | "UNKNOWN";
  label: string;
  count: number;
  units: number;
  pct_of_returns: number;
  variants?: ReturnReasonVariantBreakdown[];
};

export type ReturnReasonsResponse = {
  range: DateRange;
  reasons: ReturnReasonRow[];
  total_returned_units: number;
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
};

export type ResolutionBucket = "cash_refund" | "store_credit" | "exchange" | "other";

export type ResolutionRow = {
  bucket: ResolutionBucket;
  count: number;
  value: Money;
  pct: number;
};

export type ReturnResolutionResponse = {
  range: DateRange;
  resolutions: ResolutionRow[];
  exchange_detection: "enabled" | "degraded";
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
};

export type TopProduct = {
  product_id: string;
  title: string;
  units_sold: number;
  revenue: Money;
};

export type TopProductsResponse = {
  range: DateRange;
  products: TopProduct[];
};

export type Plan = "free" | "pro" | "insights";

/**
 * Per-plan limits shared between client and server.
 * R1 only defines free + pro; "insights" is reserved for Phase 3.
 */
export type PlanLimits = {
  cogsCap: number; // Number.POSITIVE_INFINITY for unlimited
  historyDays: number; // Number.POSITIVE_INFINITY for unlimited
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { cogsCap: 20, historyDays: 90 },
  pro: { cogsCap: Number.POSITIVE_INFINITY, historyDays: Number.POSITIVE_INFINITY },
  insights: { cogsCap: Number.POSITIVE_INFINITY, historyDays: Number.POSITIVE_INFINITY },
};

export type ShopConfig = {
  plan: Plan;
  preferences: {
    default_range: DateRangePreset;
    comparison: ComparisonMode;
  };
};

/**
 * COGS — per-variant cost of goods sold entries.
 * Stored as a single blob on Free (`cogs.index`) or 50 shards of <=200 entries
 * each on Pro (`cogs.shard.{n}`). Always read `cogs.meta` first.
 */
export type CogsEntry = {
  variantId: string; // Shopify GID, e.g. gid://shopify/ProductVariant/123
  sku: string | null;
  productId: string;
  title: string; // "Product Title — Variant Title"
  cost: Money;
  updatedAt: string; // UTC ISO
};

export type CogsIndex = {
  version: 1;
  count: number;
  updatedAt: string; // UTC ISO
  entries: CogsEntry[];
};

export type CogsMeta = {
  schemaVersion: 1;
  totalCount: number;
  shardCount: number; // 0 when using single index blob
  defaultMarginPct: number; // 0..1, e.g. 0.45 means default cost = price * 0.55
  lastWriteAt: string; // UTC ISO — used for compare-and-swap on writes
  currency_code: string;
};

export type CogsCapInfo = {
  cap: number;
  used: number;
  plan: Plan;
};

/**
 * Profit metrics returned by GET /api/metrics/profit.
 */
export type CogsCoverage = {
  lineItemsTotal: number;
  lineItemsWithExplicitCogs: number;
  lineItemsUsingDefaultMargin: number;
  lineItemsWithoutAnyCost: number;
};

export type TopProfitableProduct = {
  product_id: string;
  title: string;
  gross_profit: Money;
  gross_margin: number; // 0..1
  units_sold: number;
};

export type ProfitDelta = {
  gross_revenue: number | null; // pct
  gross_profit: number | null; // pct
  gross_margin: number | null; // absolute delta in margin points (e.g. 0.05 = +5pt)
  profit_per_order: number | null; // pct
};

export type HistoryClamp = {
  fromIso: string;
  toIso: string;
  reason: "free_plan_history_cap";
};

export type ProfitMetrics = {
  range: DateRange;
  comparison: ComparisonMode;
  gross_revenue: Money;
  gross_profit: Money;
  gross_margin: number; // 0..1
  profit_per_order: Money;
  orders_counted: number;
  cogs_coverage: CogsCoverage;
  top_profitable_products: TopProfitableProduct[]; // top 10, PRODUCT-level
  comparison_delta: ProfitDelta;
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
  default_margin_pct: number;
  has_any_cogs: boolean;
  granularity: Granularity;
  margin_series: TimeSeriesPoint[]; // basis points; null when 0 revenue in bucket
  // F06/F07: shipping + fees
  shipping_charged: Money;
  est_payment_fees: Money;
  rates_configured: boolean;
  // Returns breakdown for P&L
  gross_revenue_before_returns: Money; // sum of (unit price × original qty) for all line items
  refunded_revenue: Money;             // gross_revenue_before_returns − gross_revenue
};

/**
 * Wire-level error code for COGS cap violations on POST /api/cogs/upsert.
 * The body is `{ error: "COGS_CAP_EXCEEDED", message, cap, used, plan }`.
 */
export type CogsCapExceededError = {
  error: "COGS_CAP_EXCEEDED";
  message: string;
} & CogsCapInfo;

export const ERROR_CODES = {
  COGS_CAP_EXCEEDED: "COGS_CAP_EXCEEDED",
  COGS_VERSION_CONFLICT: "COGS_VERSION_CONFLICT",
  COGS_CURRENCY_MISMATCH: "COGS_CURRENCY_MISMATCH",
} as const;

export const METAFIELD_NAMESPACE = "firstbridge_analytics";

export const METAFIELD_KEYS = {
  config: "config",
  plan: "plan",
  snapshotDailyPrefix: "snapshot_daily_", // suffix: YYYY-MM
  aiLastSummary: "ai_last_summary",
  cogsMeta: "cogs_meta",
  cogsIndex: "cogs_index",
  cogsShardPrefix: "cogs_shard_", // suffix: numeric shard id
  expensesPrefix: "expenses_", // suffix: YYYY-MM
} as const;

export const COGS_SHARD_MAX_ENTRIES = 200;
export const COGS_MAX_SHARDS = 50;

// ---- F05: Monthly Expenses ----

export type MonthlyExpenses = {
  meta_ads: number; // major currency units
  google_ads: number;
  tiktok_ads: number;
  other_marketing: number;
  other: Array<{ label: string; amount: number }>;
};

export type ExpensesResponse = {
  month: string; // "YYYY-MM"
  expenses: MonthlyExpenses;
};

// ---- Phase 1.5 Feature Types ----

// F10: Products Performance
export type ProductPerformanceRow = {
  product_id: string;
  title: string;
  units_sold: number;
  units_refunded: number;
  gross_revenue: Money;
  refunded_amount: Money;
  net_revenue: Money;
  cogs: Money | null;
  gross_profit: Money | null;
  gross_margin: number | null;
  return_rate: number;
  // F12: allocated shipping + fees → net profit
  est_fees_allocated: Money | null;
  est_net_profit: Money | null;
};

export type ProductPerformanceResponse = {
  range: DateRange;
  rows: ProductPerformanceRow[];
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
  has_any_cogs: boolean;
  total_count: number;
  plan_capped_to: number | null;
};

// F11: Discount Codes
export type DiscountCodeRow = {
  code: string;
  orders: number;
  revenue: Money;
  avg_discount_pct: number;
  avg_order_value: Money;
  repeat_customer_rate: number | null;
};

export type DiscountCodesResponse = {
  range: DateRange;
  codes: DiscountCodeRow[];
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
  total_count: number;
  plan_capped_to: number | null;
};

// F17: Top Customers
export type TopCustomerRow = {
  rank: number;
  masked_email: string;
  total_revenue: Money;
  orders: number;
  aov: Money;
  last_order_date: string;
  days_since_last: number;
};

export type TopCustomersResponse = {
  range: DateRange;
  customers: TopCustomerRow[];
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
  total_count: number;
  plan_capped_to: number | null;
  insufficient_data: boolean;
};

// F18: Repeat Rate
export type RepeatRateMetrics = {
  range: DateRange;
  repeat_rate: number | null;
  revenue_from_repeat_pct: number;
  first_time_customers_in_range: number;
  repeat_rate_delta_pct: number | null;
  insufficient_data: boolean;
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
};

// F23: Payment Mix
export type GatewayRate = {
  gateway: string;
  pct: number;
  fixed_minor: number;
};

export type PaymentMixRow = {
  gateway: string;
  display_name: string;
  orders: number;
  revenue: Money;
  est_fees: Money;
  est_net: Money;
  pct_of_revenue: number;
};

export type PaymentMixResponse = {
  range: DateRange;
  rows: PaymentMixRow[];
  rates_configured: boolean;
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
};

// F13: Inventory Velocity
export type InventoryStatus = "healthy" | "watch" | "at_risk" | "critical" | "out_of_stock";

export type InventoryRow = {
  variant_id: string;
  product_id: string;
  product_title: string;
  variant_title: string;
  sku: string | null;
  stock: number;
  units_sold_30d: number;
  daily_sell_rate: number;
  days_remaining: number | null; // null when sell rate = 0
  status: InventoryStatus;
};

export type InventoryResponse = {
  rows: InventoryRow[];
  computed_at: string; // ISO timestamp
  total_count: number;
  plan_capped_to: number | null;
};

// F14: Product Affinity
export type AffinityPair = {
  product_a_id: string;
  product_a_title: string;
  product_b_id: string;
  product_b_title: string;
  co_purchase_count: number;
  pct_of_a_orders: number; // 0..1 — share of product A orders that include B
};

export type AffinityResponse = {
  range: DateRange;
  pairs: AffinityPair[];
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
  total_count: number;
  plan_capped_to: number | null;
};

// F16: Bundling Insights
export type BundlePair = {
  product_a_id: string;
  product_a_title: string;
  product_b_id: string;
  product_b_title: string;
  co_purchase_count: number;
  pct_of_either_orders: number; // co_purchases / min(ordersA, ordersB)
};

export type BundleInsightsResponse = {
  range: DateRange;
  bundles: BundlePair[];
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
  total_count: number;
  plan_capped_to: number | null;
};

// F15: Price Point Analysis
export type PriceBand = {
  label: string; // e.g. "$0–$25"
  min: number; // inclusive, in major units
  max: number | null; // null = open-ended upper bound
};

export type PriceBandRow = {
  band: PriceBand;
  products: number; // distinct product count
  units_sold: number;
  revenue: Money;
  avg_margin_pct: number | null; // null when no COGS configured
  return_rate: number; // 0..1
};

export type PriceAnalysisResponse = {
  range: DateRange;
  bands: PriceBandRow[];
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
};

// F04: CSV Export panel id
export type ExportPanel =
  | "overview"
  | "profit"
  | "products"
  | "discounts"
  | "customers"
  | "payments"
  | "returns";

// ---- F19: Cohort Retention ----

export type CohortRetentionPoint = {
  m0: number; // 100 always (baseline)
  m1: number | null;
  m2: number | null;
  m3: number | null;
  m6: number | null;
  m12: number | null;
};

export type CohortRow = {
  cohort_month: string; // "YYYY-MM"
  new_customers: number;
  retention: CohortRetentionPoint;
};

export type CohortRetentionResponse = {
  rows: CohortRow[];
  overall_m1_retention: number | null; // weighted avg across all cohorts
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
  plan_capped_to: number | null; // max cohort months shown on Free
};

// ---- F20: LTV by Acquisition Month ----

export type LtvCohortPoint = {
  m0: Money;
  m1: Money | null;
  m2: Money | null;
  m3: Money | null;
  m6: Money | null;
  m12: Money | null;
};

export type LtvCohortRow = {
  cohort_month: string; // "YYYY-MM"
  customers: number;
  avg_ltv: LtvCohortPoint; // cumulative avg LTV per customer at each interval
};

export type LtvByCohortResponse = {
  range: DateRange;
  rows: LtvCohortRow[];
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
};

// ---- F21: RFM Segmentation ----

export type RfmSegmentLabel =
  | "champions"
  | "loyal"
  | "potential_loyalist"
  | "at_risk"
  | "cant_lose"
  | "hibernating"
  | "lost";

export type RfmSegmentRow = {
  segment: RfmSegmentLabel;
  count: number;
  pct_of_customers: number; // 0..1
  avg_orders: number;
  avg_revenue: Money;
  avg_days_since_last: number;
};

export type RfmResponse = {
  range: DateRange;
  segments: RfmSegmentRow[];
  total_customers: number;
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
};

// ---- F01 Geographic Analytics ----

/**
 * A pre-clustered heat-map point returned by the geography endpoint.
 * On Free: one point per country (centroid). On Pro: one point per 0.1° grid cell.
 */
export type GeoCluster = {
  lat: number;
  lng: number;
  orders: number;
  revenue_minor: number; // integer minor currency units (same currency across whole response)
  currency_code: string;
};

/**
 * One row in the sortable regions table.
 * Country-level rows have province/city = undefined.
 * State-level rows have city = undefined.
 */
export type RegionRow = {
  country_code: string; // ISO 3166-1 alpha-2
  country_name: string;
  province: string | null; // null = this is a country-level summary row
  city: string | null; // null = not city-level detail (Free plan or country/state row)
  orders: number;
  revenue: Money;
  aov: Money;
  revenue_pct: number; // share of total period revenue, 0..1
  unique_customers: number;
};

export type GeographyClusterPrecision = "country" | "grid_0.1deg";

export type GeographyResponse = {
  range: DateRange;
  clusters: GeoCluster[];
  regions: RegionRow[];
  no_location_count: number; // orders with null shippingAddress
  no_location_revenue: Money | null; // null when no_location_count === 0
  truncated: boolean;
  history_clamped_to: HistoryClamp | null;
  cluster_precision: GeographyClusterPrecision;
};
