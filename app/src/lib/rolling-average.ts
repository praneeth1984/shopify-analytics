/**
 * Rolling-average smoothing for chart series. We keep the implementation
 * defensive against null gaps: a rolling window is only emitted when at least
 * half the points in the window are non-null, so a single outlier at the
 * start of a sparse series doesn't drag the trendline.
 */

export function rollingAverage(
  points: ReadonlyArray<{ value: number | null }>,
  window: number,
): Array<number | null> {
  if (window <= 0) throw new Error("rollingAverage: window must be > 0");
  const out: Array<number | null> = [];
  const minNonNull = Math.ceil(window / 2);
  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= i; j++) {
      const v = points[j]?.value;
      if (v == null || !Number.isFinite(v)) continue;
      sum += v;
      count += 1;
    }
    if (count < minNonNull) {
      out.push(null);
    } else {
      out.push(sum / count);
    }
  }
  return out;
}
