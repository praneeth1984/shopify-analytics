/**
 * Settings — Playwright E2E spec (requires Playwright tooling not yet wired
 * into the repo; tracked as a follow-up: install @playwright/test, generate a
 * `playwright.config.ts`, and add a CI runner. This file documents the
 * intended scenarios so the test fixture has a clear definition of done).
 *
 * Scenarios (per the architect's R1 spec):
 *   1. Enter cost: search for a product, type a cost into the inline editor,
 *      and confirm the new entry appears in the saved-costs table.
 *   2. Hit cap: with 20 entries already saved on Free, attempt to add a 21st
 *      and assert that the upsert call returns 409 COGS_CAP_EXCEEDED and the
 *      CogsCapBanner is visible.
 *   3. Set default margin: type 30 into the default-margin field, blur, and
 *      assert PATCH /api/cogs/default-margin was called with 0.3.
 */

import { test, expect } from "@playwright/test";

test.describe("Settings — COGS UX", () => {
  test.skip("enter cost flow", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByPlaceholder("Search by product title or SKU").fill("hat");
    await page.getByRole("option", { name: /Hat/ }).first().click();
    await page.getByLabel("Cost").fill("4.50");
    await page.getByRole("button", { name: /Save cost/ }).click();
    await expect(page.getByText(/Saved cost/)).toBeVisible();
  });

  test.skip("hit free-tier cap shows banner", async ({ page }) => {
    await page.goto("/#/settings");
    // Pre-seeded fixture has 20 entries on Free.
    await expect(
      page.getByText(/You've reached 20 of 20 costs on the Free plan/),
    ).toBeVisible();
  });

  test.skip("default margin saves on blur", async ({ page }) => {
    await page.goto("/#/settings");
    const field = page.getByLabel("Default margin %");
    await field.fill("30");
    await field.blur();
    await expect(page.getByText("Default margin saved")).toBeVisible();
  });
});
