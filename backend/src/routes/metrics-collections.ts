import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { getPlanCached } from "../plan/get-plan.js";
import { resolveRange } from "../metrics/date-range.js";
import { computeCollectionReport } from "../metrics/collection-sales.js";
import { BadRequest } from "../lib/errors.js";
import type { DateRangePreset } from "@fbc/shared";

const VALID_PRESETS: DateRangePreset[] = [
  "today","yesterday","last_7_days","last_30_days","last_90_days",
  "month_to_date","year_to_date","custom",
];

export function metricsCollectionsRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const tab = (c.req.query("tab") ?? "sales") as "sales" | "best-selling" | "products";
    if (!["sales", "best-selling", "products"].includes(tab)) throw BadRequest("invalid tab");
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");
    const collectionId = c.req.query("collectionId");

    const range = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const shop = c.get("shopDomain");

    const result = await computeCollectionReport(
      c.env.FEEDBACK_DB, shop, tab, range.start, range.end, plan, collectionId,
    );
    return c.json(result);
  });

  return app;
}
