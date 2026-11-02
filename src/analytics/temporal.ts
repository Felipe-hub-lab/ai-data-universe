import { mean, slope, std } from './stats';

/**
 * Time-series helpers for the Temporal Engine. Peaks/drops are defined statistically on
 * month-over-month change, never by eye.
 */

export interface ChangePoint {
  index: number;
  change: number;
  kind: 'pico' | 'queda';
  z: number;
}

/** Months whose MoM change deviates > k·σ from the series' typical MoM change. */
export function relevantChanges(values: number[], k = 1.5, isRatio = false): ChangePoint[] {
  const ch = values.map((v, i) => (i === 0 || !Number.isFinite(v) || !Number.isFinite(values[i - 1]) ? NaN : isRatio ? v - values[i - 1] : v / values[i - 1] - 1));
  const m = mean(ch);
  const s = std(ch);
  if (!(s > 0)) return [];
  const out: ChangePoint[] = [];
  ch.forEach((c, i) => {
    if (!Number.isFinite(c)) return;
    const z = (c - m) / s;
    if (Math.abs(z) >= k) out.push({ index: i, change: c, kind: z > 0 ? 'pico' : 'queda', z });
  });
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

/** OLS trend fitted on [from, to] and evaluated on every index. */
export function trendLine(values: number[], from = 0, to = values.length - 1): number[] {
  const win = values.slice(from, to + 1);
  const b = slope(win);
  const a = mean(win) - b * ((win.length - 1) / 2);
  return values.map((_, i) => a + b * (i - from));
}
