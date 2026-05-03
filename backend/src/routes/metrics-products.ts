import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { fetchOrdersForRange } from "../metrics/orders-fetch.js";
import { computeProductsPerformance } from "../metrics/products-performance.js";
import { computeAffinity } from "../metrics/affinity.js";
import { computeBundles } from "../metrics/bundles.js";
import { computePriceAnalysis } from "../metrics/price-analysis.js";
import { computeInventory } from "../metrics/inventory.js";
import { computeVariantSales } from "../metrics/variant-sales.js";
import { computeCatalog } from "../metrics/catalog.js";
import { clampRangeForPlan } from "../metrics/history-clamp.js";
import { getPlanCached } from "../plan/get-plan.js";
import { readCogsState } from "../cogs/store.js";
import { buildLookup } from "../cogs/lookup.js";
import {
  ORDERS_VARIANT_QUERY,
  PRODUCTS_CATALOG_QUERY,
  type CatalogProductNode,
  type VariantOrderNode,
} from "../metrics/queries.js";
import { BadRequest } from "../lib/errors.js";
import type { CatalogView, DateRangePreset } from "@fbc/shared";

const VALID_PRESETS: DateRangePreset[] = [
  "today", "yesterday", "last_7_days", "last_30_days",
  "last_90_days", "month_to_date", "year_to_date", "custom",
];

const SHOP_CURRENCY_QUERY = /* GraphQL */ `query { shop { currencyCode } }`;

const VALID_CATALOG_VIEWS: CatalogView[] = ["never_sold", "all", "by_tag"];

const PAGE_SIZE = 250;
const MAX_PAGES = 10;
const PRODUCTS_MAX_PAGES = 4; // 1,000-product budget for catalog walks

export function metricsProductsRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/performance", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const [{ orders, truncated }, shopResp] = await Promise.all([
      fetchOrdersForRange(graphql, range),
      graphql<{ shop: { currencyCode: string } }>(SHOP_CURRENCY_QUERY),
    ]);
    const currency = shopResp.data.shop.currencyCode;
    const [cogs, prefs] = await Promise.all([
      readCogsState(graphql, currency),
      import("./preferences.js").then((m) => m.readPreferences(graphql)),
    ]);
    const lookup = buildLookup(cogs.meta, cogs.entries);
    const gatewayRates = prefs.gatewayRates ?? [];

    const result = computeProductsPerformance(orders, lookup, currency, plan, range, truncated, gatewayRates);
    if (historyClampedTo) result.history_clamped_to = historyClampedTo;
    return c.json(result);
  });

  app.get("/inventory", async (c) => {
    const plan = await getPlanCached(c);
    const graphql = c.get("graphql");
    const result = await computeInventory(graphql, plan);
    return c.json(result);
  });

  app.get("/affinity", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const { orders, truncated } = await fetchOrdersForRange(graphql, range);

    const result = computeAffinity(orders, plan, range, truncated, historyClampedTo);
    return c.json(result);
  });

  app.get("/bundles", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const { orders, truncated } = await fetchOrdersForRange(graphql, range);

    const result = computeBundles(orders, plan, range, truncated, historyClampedTo);
    return c.json(result);
  });

  app.get("/price-analysis", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const [{ orders, truncated }, shopResp] = await Promise.all([
      fetchOrdersForRange(graphql, range),
      graphql<{ shop: { currencyCode: string } }>(SHOP_CURRENCY_QUERY),
    ]);
    const currency = shopResp.data.shop.currencyCode;
    const cogs = await readCogsState(graphql, currency);
    const lookup = buildLookup(cogs.meta, cogs.entries);

    const result = computePriceAnalysis(orders, lookup, currency, range, truncated, historyClampedTo);
    return c.json(result);
  });

  app.get("/variants", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    type OrdersResp = {
      orders: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: VariantOrderNode[];
      };
    };
    const orders: VariantOrderNode[] = [];
    let after: string | null = null;
    let pages = 0;
    let truncated = false;
    while (pages < MAX_PAGES) {
      const { data } = (await graphql<OrdersResp>(ORDERS_VARIANT_QUERY, {
        query: `processed_at:>='${range.start}' processed_at:<'${range.end}'`,
        first: PAGE_SIZE,
        after,
      })) as { data: OrdersResp };
      orders.push(...data.orders.nodes);
      pages += 1;
      if (!data.orders.pageInfo.hasNextPage) break;
      after = data.orders.pageInfo.endCursor;
      if (!after) break;
    }
    if (pages === MAX_PAGES) truncated = true;

    const result = computeVariantSales(orders, plan, range, truncated, historyClampedTo);
    return c.json(result);
  });

  app.get("/catalog", async (c) => {
    const view = (c.req.query("view") ?? "all") as CatalogView;
    if (!VALID_CATALOG_VIEWS.includes(view)) throw BadRequest("invalid view");
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range, historyClampedTo } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");

    // Fetch product catalog (paginated)
    type ProductsResp = {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: CatalogProductNode[];
      };
    };
    const products: CatalogProductNode[] = [];
    let pAfter: string | null = null;
    let pPages = 0;
    let pTruncated = false;
    while (pPages < PRODUCTS_MAX_PAGES) {
      const { data } = (await graphql<ProductsResp>(PRODUCTS_CATALOG_QUERY, {
        first: PAGE_SIZE,
        after: pAfter,
      })) as { data: ProductsResp };
      products.push(...data.products.nodes);
      pPages += 1;
      if (!data.products.pageInfo.hasNextPage) break;
      pAfter = data.products.pageInfo.endCursor;
      if (!pAfter) break;
    }
    if (pPages === PRODUCTS_MAX_PAGES) pTruncated = true;

    // Fetch the orders for sales overlay (uses overview shape because we need
    // per-product units + revenue + refunds in the same range).
    const { orders, truncated: oTruncated } = await fetchOrdersForRange(graphql, range);

    const result = computeCatalog({
      view,
      products,
      orders,
      plan,
      range,
      truncated: pTruncated || oTruncated,
      historyClampedTo,
    });
    return c.json(result);
  });

  return app;
}
