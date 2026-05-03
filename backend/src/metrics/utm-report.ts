import type { D1Database } from "@cloudflare/workers-types";
import { forShop } from "../db/client.js";
import type { Plan } from "@fbc/shared";

export const UTM_LIMITATION_NOTE =
  "First-touch attribution from order landing page. Multi-touch requires a pixel.";

export type UTMRow = {
  channel: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  orders: number;
  revenueMinor: number;
  currency: string;
  aovMinor: number;
  sharePct: number;
};

export type UTMReport = {
  limitationNote: string;
  topSourceByRevenue: string;
  topCampaignByOrders: string;
  directPct: number;
  rows: UTMRow[];
  plan: Plan;
  historyClampedTo: string | null;
  hasData: boolean;
};

export async function computeUTMReport(
  db: D1Database,
  shop: string,
  channelFilter: string | null,
  from: string,
  to: string,
  plan: Plan,
): Promise<UTMReport> {
  const shopDb = forShop(db, shop);

  const freeDays = 90;
  const freeCutoff = plan === "free"
    ? new Date(Date.now() - freeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;
  const effectiveFrom = freeCutoff && freeCutoff > from ? freeCutoff : from;
  const historyClampedTo = effectiveFrom !== from ? effectiveFrom : null;

  // For Pro: include campaign; for Free: group only by source/medium, top 10
  const groupBy = plan === "pro"
    ? "channel, utm_source, utm_medium, utm_campaign"
    : "channel, utm_source, utm_medium";
  const selectCampaign = plan === "pro" ? "utm_campaign," : "NULL AS utm_campaign,";

  const whereChannel = channelFilter ? `AND channel=?` : "";
  const extraParam = channelFilter ? [channelFilter] : [];

  const rows = await shopDb.all<{
    channel: string; utm_source: string | null; utm_medium: string | null;
    utm_campaign: string | null; orders: number; revenue: number; currency: string;
  }>(
    `SELECT channel, utm_source, utm_medium, ${selectCampaign}
            COUNT(*) AS orders,
            SUM(revenue_minor) AS revenue,
            MAX(currency) AS currency
     FROM order_utm
     WHERE shop_domain=? AND order_date>=? AND order_date<? ${whereChannel}
     GROUP BY ${groupBy}
     ORDER BY revenue DESC
     ${plan === "free" ? "LIMIT 10" : ""}`,
    effectiveFrom, to, ...extraParam,
  );

  const totalRevenue = rows.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const totalOrders = rows.reduce((s, r) => s + (r.orders ?? 0), 0);
  const currency = rows[0]?.currency ?? "USD";

  const directRevenue = rows.filter((r) => r.channel === "direct").reduce((s, r) => s + (r.revenue ?? 0), 0);
  const directPct = totalRevenue > 0 ? directRevenue / totalRevenue : 0;

  const topSourceByRevenue = rows[0]?.utm_source ?? rows[0]?.channel ?? "direct";
  const topCampaignByOrders = [...rows].sort((a, b) => (b.orders ?? 0) - (a.orders ?? 0))[0]?.utm_campaign ?? "—";

  const utmRows: UTMRow[] = rows.map((r) => ({
    channel: r.channel,
    source: r.utm_source,
    medium: r.utm_medium,
    campaign: r.utm_campaign,
    orders: r.orders ?? 0,
    revenueMinor: r.revenue ?? 0,
    currency,
    aovMinor: r.orders ? Math.round((r.revenue ?? 0) / r.orders) : 0,
    sharePct: totalRevenue > 0 ? (r.revenue ?? 0) / totalRevenue : 0,
  }));

  return {
    limitationNote: UTM_LIMITATION_NOTE,
    topSourceByRevenue,
    topCampaignByOrders,
    directPct,
    rows: utmRows,
    plan,
    historyClampedTo,
    hasData: rows.length > 0,
  };
}
