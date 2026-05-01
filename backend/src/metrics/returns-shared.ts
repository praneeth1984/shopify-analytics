/**
 * Shared helpers for returns aggregators (R-RET-1, R-RET-3, R-RET-4).
 *
 * `humanizeReturnReason` maps Shopify's `ReturnReason` enum codes to
 * merchant-facing labels. Unknown / null codes bucket as "Unspecified".
 */

const REASON_LABELS: Record<string, string> = {
  COLOR: "Color not as expected",
  DEFECTIVE: "Defective or damaged",
  NOT_AS_DESCRIBED: "Not as described",
  SIZE_TOO_LARGE: "Size too large",
  SIZE_TOO_SMALL: "Size too small",
  STYLE: "Style",
  UNWANTED: "No longer wanted",
  WRONG_ITEM: "Wrong item shipped",
  OTHER: "Other",
};

export function humanizeReturnReason(code: string | null | undefined): string {
  if (!code) return "Unspecified";
  return REASON_LABELS[code] ?? "Unspecified";
}
