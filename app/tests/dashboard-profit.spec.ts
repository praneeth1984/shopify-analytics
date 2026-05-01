/**
 * Dashboard profit — Playwright E2E spec (requires Playwright tooling not yet
 * wired into the repo; tracked as a follow-up).
 *
 * Scenarios:
 *   1. Profit cards render: with COGS pre-seeded, the dashboard shows three
 *      Profit cards (gross profit, margin, profit per order) and the Top
 *      Profitable Products section.
 *   2. Empty state when no COGS: with no entries and zero default margin,
 *      ProfitCards renders the "Set up costs" CTA instead of zeroes.
 *   3. CogsCoverageBanner: with partial coverage (some line items lacking an
 *      explicit cost), the dashboard surfaces an informational banner with
 *      the explicit-cost percentage and a "Add costs in Settings" link.
 */

import { test, expect } from "@playwright/test";

test.describe("Dashboard — profit", () => {
  test.skip("renders profit cards with COGS data", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Gross profit")).toBeVisible();
    await expect(page.getByText("Margin")).toBeVisible();
    await expect(page.getByText("Profit per order")).toBeVisible();
    await expect(page.getByText("Top profitable products")).toBeVisible();
  });

  test.skip("shows CTA when no COGS", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("See profit, not just revenue")).toBeVisible();
    await expect(page.getByRole("button", { name: "Set up costs" })).toBeVisible();
  });
});
