import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { fetchOrdersForRange } from "../metrics/orders-fetch.js";
import { clampRangeForPlan } from "../metrics/history-clamp.js";
import { getPlanCached } from "../plan/get-plan.js";
import { toCsv } from "../lib/csv.js";
import { BadRequest } from "../lib/errors.js";
import { computeProductsPerformance } from "../metrics/products-performance.js";
import { computeDiscountCodes } from "../metrics/discount-codes.js";
import { computeTopCustomers } from "../metrics/top-customers.js";
import { computePaymentMix } from "../metrics/payment-mix.js";
import { computeProfit } from "../metrics/profit.js";
import { computeReturnsByProduct } from "../metrics/returns-by-product.js";
import { fetchOrderReportPage } from "../metrics/orders-report.js";
import { computeRefundReport } from "../metrics/refunds.js";
import { readCogsState } from "../cogs/store.js";
import { buildLookup } from "../cogs/lookup.js";
import { readMetafield } from "../metafields/client.js";
import { moneyToMinor } from "../cogs/lookup.js";
import { METAFIELD_KEYS } from "@fbc/shared";
import type { DateRangePreset, ExportPanel, GatewayRate } from "@fbc/shared";

const VALID_PANELS: ExportPanel[] = [
  "overview", "profit", "products", "discounts", "customers", "payments", "returns",
  "orders", "refunds",
];

const VALID_PRESETS: DateRangePreset[] = [
  "today", "yesterday", "last_7_days", "last_30_days",
  "last_90_days", "month_to_date", "year_to_date", "custom",
];

const SHOP_CURRENCY_QUERY = /* GraphQL */ `query { shop { currencyCode } }`;
type Preferences = { gatewayRates?: GatewayRate[] };

export function exportsRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/:panel", async (c) => {
    const panel = c.req.param("panel") as ExportPanel;
    if (!VALID_PANELS.includes(panel)) throw BadRequest("invalid panel");

    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const requested = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const { range } = clampRangeForPlan(requested, plan);

    const graphql = c.get("graphql");
    const shopDomain = c.get("shopDomain");
    const [{ orders, truncated }, shopResp] = await Promise.all([
      fetchOrdersForRange(graphql, range),
      graphql<{ shop: { currencyCode: string } }>(SHOP_CURRENCY_QUERY),
    ]);
    const currency = shopResp.data.shop.currencyCode;

    const today = new Date().toISOString().slice(0, 10);
    const shopAlias = shopDomain.replace(".myshopify.com", "");
    const filename = `firstbridge-${panel}-${shopAlias}-${today}.csv`;

    let csv = "";

    if (panel === "products") {
      const cogs = await readCogsState(graphql, currency);
      const lookup = buildLookup(cogs.meta, cogs.entries);
      const result = computeProductsPerformance(orders, lookup, currency, plan, range, truncated);
      csv = toCsv(
        result.rows.map((r) => ({
          product_id: r.product_id,
          title: r.title,
          units_sold: r.units_sold,
          units_refunded: r.units_refunded,
          gross_revenue_amount: r.gross_revenue.amount,
          currency: r.gross_revenue.currency_code,
          refunded_amount: r.refunded_amount.amount,
          net_revenue_amount: r.net_revenue.amount,
          return_rate_pct: (r.return_rate * 100).toFixed(1),
        })),
        [
          { key: "product_id", header: "Product ID" },
          { key: "title", header: "Product" },
          { key: "units_sold", header: "Units Sold" },
          { key: "units_refunded", header: "Units Refunded" },
          { key: "gross_revenue_amount", header: "Gross Revenue" },
          { key: "currency", header: "Currency" },
          { key: "refunded_amount", header: "Refunded Amount" },
          { key: "net_revenue_amount", header: "Net Revenue" },
          { key: "return_rate_pct", header: "Return Rate %" },
        ],
      );
    } else if (panel === "discounts") {
      const result = computeDiscountCodes(orders, currency, plan, range, truncated);
      csv = toCsv(
        result.codes.map((r) => ({
          code: r.code,
          orders: r.orders,
          revenue_amount: r.revenue.amount,
          currency: r.revenue.currency_code,
          avg_discount_pct: (r.avg_discount_pct * 100).toFixed(1),
          avg_order_value: r.avg_order_value.amount,
          repeat_customer_rate_pct:
            r.repeat_customer_rate !== null ? (r.repeat_customer_rate * 100).toFixed(1) : "",
        })),
        [
          { key: "code", header: "Discount Code" },
          { key: "orders", header: "Orders" },
          { key: "revenue_amount", header: "Revenue" },
          { key: "currency", header: "Currency" },
          { key: "avg_discount_pct", header: "Avg Discount %" },
          { key: "avg_order_value", header: "Avg Order Value" },
          { key: "repeat_customer_rate_pct", header: "Repeat Customer Rate %" },
        ],
      );
    } else if (panel === "customers") {
      const result = computeTopCustomers(orders, currency, plan, range, truncated);
      csv = toCsv(
        result.customers.map((r) => ({
          rank: r.rank,
          customer: r.masked_email,
          total_revenue: r.total_revenue.amount,
          currency: r.total_revenue.currency_code,
          orders: r.orders,
          aov: r.aov.amount,
          last_order: r.last_order_date.slice(0, 10),
          days_since_last: r.days_since_last,
        })),
        [
          { key: "rank", header: "Rank" },
          { key: "customer", header: "Customer" },
          { key: "total_revenue", header: "Total Revenue" },
          { key: "currency", header: "Currency" },
          { key: "orders", header: "Orders" },
          { key: "aov", header: "AOV" },
          { key: "last_order", header: "Last Order" },
          { key: "days_since_last", header: "Days Since Last Order" },
        ],
      );
    } else if (panel === "payments") {
      const prefs = await readMetafield<Preferences>(graphql, METAFIELD_KEYS.config);
      const gatewayRates: GatewayRate[] = prefs?.gatewayRates ?? [];
      const result = computePaymentMix(orders, currency, gatewayRates, plan, range, truncated);
      csv = toCsv(
        result.rows.map((r) => ({
          gateway: r.display_name,
          orders: r.orders,
          revenue: r.revenue.amount,
          currency: r.revenue.currency_code,
          est_fees: r.est_fees.amount,
          est_net: r.est_net.amount,
          pct_of_revenue: (r.pct_of_revenue * 100).toFixed(1),
        })),
        [
          { key: "gateway", header: "Gateway" },
          { key: "orders", header: "Orders" },
          { key: "revenue", header: "Revenue" },
          { key: "currency", header: "Currency" },
          { key: "est_fees", header: "Est. Fees" },
          { key: "est_net", header: "Est. Net" },
          { key: "pct_of_revenue", header: "% of Revenue" },
        ],
      );
    } else if (panel === "overview") {
      const toMinor = (amt: string) => moneyToMinor(amt);
      const rows = orders.map((o) => {
        const grossMinor = toMinor(o.totalPriceSet.shopMoney.amount);
        const refundedMinor = toMinor(o.totalRefundedSet.shopMoney.amount);
        return {
          order_id: o.id.split("/").pop() ?? o.id,
          processed_at: o.processedAt.slice(0, 10),
          gross_revenue: (Number(grossMinor) / 100).toFixed(2),
          refunded: (Number(refundedMinor) / 100).toFixed(2),
          net_revenue: (Number(grossMinor - refundedMinor) / 100).toFixed(2),
          currency,
          customer_id: o.customer?.id?.split("/").pop() ?? "",
        };
      });
      csv = toCsv(rows, [
        { key: "order_id", header: "Order ID" },
        { key: "processed_at", header: "Date" },
        { key: "gross_revenue", header: "Gross Revenue" },
        { key: "refunded", header: "Refunded" },
        { key: "net_revenue", header: "Net Revenue" },
        { key: "currency", header: "Currency" },
        { key: "customer_id", header: "Customer ID" },
      ]);
    } else if (panel === "profit") {
      const cogs = await readCogsState(graphql, currency);
      const lookup = buildLookup(cogs.meta, cogs.entries);
      const result = await computeProfit(graphql, { range, comparison: "none" });
      csv = toCsv(
        [
          {
            metric: "Gross Revenue (before returns)",
            amount: result.gross_revenue_before_returns.amount,
            currency,
          },
          { metric: "Returns & Refunds", amount: `-${result.refunded_revenue.amount}`, currency },
          { metric: "Shipping Revenue", amount: result.shipping_charged.amount, currency },
          { metric: "Gross Revenue (net)", amount: result.gross_revenue.amount, currency },
          { metric: "Cost of Goods Sold", amount: `-${(parseFloat(result.gross_revenue.amount) - parseFloat(result.gross_profit.amount)).toFixed(2)}`, currency },
          { metric: "Gross Profit", amount: result.gross_profit.amount, currency },
          { metric: "Gross Margin %", amount: `${(result.gross_margin * 100).toFixed(1)}%`, currency: "" },
          { metric: "Est. Payment Fees", amount: result.rates_configured ? `-${result.est_payment_fees.amount}` : "N/A", currency: result.rates_configured ? currency : "" },
        ],
        [
          { key: "metric", header: "Metric" },
          { key: "amount", header: "Amount" },
          { key: "currency", header: "Currency" },
        ],
      );
      void lookup; // imported for potential future per-product P&L
    } else if (panel === "returns") {
      const result = computeReturnsByProduct(orders, plan);
      csv = toCsv(
        result.products.map((r) => ({
          product_id: r.product_id.split("/").pop() ?? r.product_id,
          title: r.title,
          ordered_units: r.ordered_units,
          returned_units: r.returned_units,
          return_rate_pct: (r.return_rate * 100).toFixed(1),
          refunded_value: r.refunded_value.amount,
          currency: r.refunded_value.currency_code,
        })),
        [
          { key: "product_id", header: "Product ID" },
          { key: "title", header: "Product" },
          { key: "ordered_units", header: "Units Ordered" },
          { key: "returned_units", header: "Units Returned" },
          { key: "return_rate_pct", header: "Return Rate %" },
          { key: "refunded_value", header: "Refunded Value" },
          { key: "currency", header: "Currency" },
        ],
      );
    } else if (panel === "orders") {
      // F43 — paginate through the order report and stream rows to CSV.
      const allRows = [];
      let cursor: string | null = null;
      let pages = 0;
      const MAX_PAGES = 10;
      while (pages < MAX_PAGES) {
        const page = await fetchOrderReportPage(graphql, {
          start: range.start,
          end: range.end,
          status: "all",
          fulfillment: "all",
          cursor,
        });
        allRows.push(...page.orders);
        if (!page.cursor) break;
        cursor = page.cursor;
        pages += 1;
      }
      csv = toCsv(
        allRows.map((r) => ({
          order_name: r.name,
          order_id: r.id,
          created_at: r.created_at.slice(0, 10),
          channel: r.channel ?? "",
          payment_status: r.payment_status ?? "",
          fulfillment_status: r.fulfillment_status ?? "",
          line_item_count: r.line_item_count,
          gross_revenue: r.gross_revenue.amount,
          discounts: r.discounts.amount,
          shipping: r.shipping.amount,
          tax: r.tax.amount,
          net_revenue: r.net_revenue.amount,
          currency: r.gross_revenue.currency_code,
          gateway: r.gateway ?? "",
          tags: r.tags.join("|"),
        })),
        [
          { key: "order_name", header: "Order" },
          { key: "order_id", header: "Order ID" },
          { key: "created_at", header: "Date" },
          { key: "channel", header: "Channel" },
          { key: "payment_status", header: "Payment" },
          { key: "fulfillment_status", header: "Fulfillment" },
          { key: "line_item_count", header: "Items" },
          { key: "gross_revenue", header: "Gross Revenue" },
          { key: "discounts", header: "Discounts" },
          { key: "shipping", header: "Shipping" },
          { key: "tax", header: "Tax" },
          { key: "net_revenue", header: "Net Revenue" },
          { key: "currency", header: "Currency" },
          { key: "gateway", header: "Gateway" },
          { key: "tags", header: "Tags" },
        ],
      );
    } else if (panel === "refunds") {
      // F45 — refund report rows
      const result = await computeRefundReport(graphql, range);
      csv = toCsv(
        result.refunds.map((r) => ({
          refunded_at: r.refunded_at.slice(0, 10),
          order_name: r.order_name,
          order_id: r.order_id,
          refund_id: r.refund_id,
          amount: r.amount.amount,
          currency: r.amount.currency_code,
          line_items_refunded: r.line_items_refunded,
          restocked: r.restocked ? "yes" : "no",
          note: r.note ?? "",
        })),
        [
          { key: "refunded_at", header: "Refund Date" },
          { key: "order_name", header: "Order" },
          { key: "order_id", header: "Order ID" },
          { key: "refund_id", header: "Refund ID" },
          { key: "amount", header: "Amount" },
          { key: "currency", header: "Currency" },
          { key: "line_items_refunded", header: "Items Refunded" },
          { key: "restocked", header: "Restocked" },
          { key: "note", header: "Note" },
        ],
      );
    } else {
      csv = "# Export not yet available for this panel\r\n";
    }

    if (truncated) {
      csv += "\r\n# partial results — capped at 2500 orders. Upgrade to Pro for full history.";
    }
    if (plan === "free") {
      csv += "\r\n# Generated by FirstBridge Analytics";
    }

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });

  return app;
}
