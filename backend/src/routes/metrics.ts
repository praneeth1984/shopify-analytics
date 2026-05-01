import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";
import { resolveRange } from "../metrics/date-range.js";
import { computeOverview } from "../metrics/overview.js";
import type { ComparisonMode, DateRangePreset } from "@fbc/shared";
import { BadRequest } from "../lib/errors.js";

const VALID_PRESETS: DateRangePreset[] = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "month_to_date",
  "year_to_date",
  "custom",
];

const VALID_COMPARISONS: ComparisonMode[] = ["previous_period", "previous_year", "none"];

export function metricsRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.get("/overview", async (c) => {
    const preset = (c.req.query("preset") ?? "last_30_days") as DateRangePreset;
    if (!VALID_PRESETS.includes(preset)) throw BadRequest("invalid preset");
    const comparison = (c.req.query("comparison") ?? "previous_period") as ComparisonMode;
    if (!VALID_COMPARISONS.includes(comparison)) throw BadRequest("invalid comparison");

    const range = resolveRange(preset, c.req.query("start"), c.req.query("end"));
    const graphql = c.get("graphql");
    const overview = await computeOverview(graphql, range, comparison);
    return c.json(overview);
  });

  return app;
}
