/**
 * Unit tests for the shared formatting helpers used in the dashboard.
 */

import { describe, expect, it } from "vitest";
import { formatMargin, formatDeltaPct, deltaTone } from "./format.js";

describe("formatMargin", () => {
  it("formats a 0..1 decimal as a percent with one decimal", () => {
    expect(formatMargin(0.4567)).toBe("45.7%");
  });
  it("handles negative margins (e.g. free items with cost)", () => {
    expect(formatMargin(-0.25)).toBe("-25.0%");
  });
  it("returns a dash for non-finite input", () => {
    expect(formatMargin(Number.NaN)).toBe("—");
    expect(formatMargin(Number.POSITIVE_INFINITY)).toBe("—");
  });
  it("zero margin formats clean", () => {
    expect(formatMargin(0)).toBe("0.0%");
  });
});

describe("formatDeltaPct", () => {
  it("adds a + sign for positive deltas", () => {
    expect(formatDeltaPct(5)).toBe("+5.0%");
  });
  it("returns a dash for null/non-finite", () => {
    expect(formatDeltaPct(null)).toBe("—");
    expect(formatDeltaPct(Number.NaN)).toBe("—");
  });
});

describe("deltaTone", () => {
  it("maps positive to success and negative to critical", () => {
    expect(deltaTone(1)).toBe("success");
    expect(deltaTone(-1)).toBe("critical");
    expect(deltaTone(0)).toBe("subdued");
    expect(deltaTone(null)).toBe("subdued");
  });
});
