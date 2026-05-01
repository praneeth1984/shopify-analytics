/**
 * Chart palette derived from Polaris CSS custom properties so the charts pick
 * up the merchant's admin theme automatically. Falls back to Polaris' default
 * brand colors when CSS vars haven't been wired up (e.g. SSR or tests).
 */

import { useEffect, useState } from "react";

export type ChartTheme = {
  primary: string;
  secondary: string;
  comparison: string;
  grid: string;
  tooltipBg: string;
  donutPalette: [string, string, string, string, string];
};

const DEFAULTS: ChartTheme = {
  primary: "#005bd3",
  secondary: "#29845a",
  comparison: "#616161",
  grid: "#e1e1e1",
  tooltipBg: "#ffffff",
  donutPalette: ["#005bd3", "#29845a", "#e51c00", "#e8a300", "#0091ae"],
};

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(DEFAULTS);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = getComputedStyle(document.documentElement);
    const get = (v: string): string | undefined => {
      const raw = s.getPropertyValue(v).trim();
      return raw.length > 0 ? raw : undefined;
    };
    setTheme({
      primary: get("--p-color-bg-fill-brand") ?? DEFAULTS.primary,
      secondary: get("--p-color-bg-fill-success") ?? DEFAULTS.secondary,
      comparison: get("--p-color-text-secondary") ?? DEFAULTS.comparison,
      grid: get("--p-color-border-secondary") ?? DEFAULTS.grid,
      tooltipBg: get("--p-color-bg-surface") ?? DEFAULTS.tooltipBg,
      donutPalette: [
        get("--p-color-bg-fill-brand") ?? DEFAULTS.donutPalette[0],
        get("--p-color-bg-fill-success") ?? DEFAULTS.donutPalette[1],
        get("--p-color-bg-fill-critical") ?? DEFAULTS.donutPalette[2],
        get("--p-color-bg-fill-warning") ?? DEFAULTS.donutPalette[3],
        get("--p-color-bg-fill-info") ?? DEFAULTS.donutPalette[4],
      ],
    });
  }, []);
  return theme;
}
