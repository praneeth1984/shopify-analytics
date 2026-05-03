import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { getPlanCached } from "../plan/get-plan.js";
import { resolveRange } from "../metrics/date-range.js";
import { computeTaxReport } from "../metrics/tax-report.js";
import { BadRequest } from "../lib/errors.js";
import type { DateRangePreset } from "@fbc/shared";

const VALID_PRESETS: DateRangePreset[] = [
  "today","yesterday","last_7_days","last_30_days","last_90_days",
  "month_to_date","year_to_date","custom",
];
const VALID_TABS = ["monthly", "geo"] as const;

export function metricsTaxRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const tab = (c.req.query("tab") ?? "monthly") as "monthly" | "geo";
    if (!VALID_TABS.includes(tab)) throw BadRequest("invalid tab");
    const preset = (c.req.query("preset") ?? "month_to_date") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");

    const range = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const shop = c.get("shopDomain");

    const result = await computeTaxReport(
      c.env.FEEDBACK_DB, shop, tab, range.start, range.end, plan,
    );
    return c.json(result);
  });

  return app;
}
