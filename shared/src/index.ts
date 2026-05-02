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
} as const;

export const COGS_SHARD_MAX_ENTRIES = 200;
export const COGS_MAX_SHARDS = 50;

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
