import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { getPlanCached } from "../plan/get-plan.js";
import { resolveRange } from "../metrics/date-range.js";
import { computeUTMReport } from "../metrics/utm-report.js";
import { BadRequest } from "../lib/errors.js";
import type { DateRangePreset } from "@fbc/shared";

const VALID_PRESETS: DateRangePreset[] = [
  "today","yesterday","last_7_days","last_30_days","last_90_days",
  "month_to_date","year_to_date","custom",
];
const VALID_CHANNELS = [null, "all", "direct", "organic", "paid", "email", "social", "referral"];

export function metricsUTMRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");
    const channelRaw = c.req.query("channel") ?? null;
    const channel = channelRaw === "all" ? null : channelRaw;
    if (!VALID_CHANNELS.includes(channel)) throw BadRequest("invalid channel");

    const range = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const plan = await getPlanCached(c);
    const shop = c.get("shopDomain");

    const result = await computeUTMReport(c.env.FEEDBACK_DB, shop, channel, range.start, range.end, plan);
    return c.json(result);
  });

  return app;
}
