/** Small, dependency-free statistics helpers. NaN values are ignored where noted. */

export const finite = (xs: number[]) => xs.filter((x) => Number.isFinite(x));

export function mean(xs: number[]): number {
  const v = finite(xs);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}

/** Sample standard deviation (n − 1). */
export function std(xs: number[]): number {
  const v = finite(xs);
  if (v.length < 2) return NaN;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

/** Linear-interpolated quantile (type 7, same as numpy/Excel default). */
export function quantile(xs: number[], q: number): number {
  const v = finite(xs).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

export const median = (xs: number[]) => quantile(xs, 0.5);

/** Median absolute deviation, scaled to be consistent with σ for normal data. */
export function mad(xs: number[]): number {
  const m = median(xs);
  return median(finite(xs).map((x) => Math.abs(x - m))) * 1.4826;
}

export function pearson(xs: number[], ys: number[]): number {
  const pairs = xs.map((x, i) => [x, ys[i]] as const).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return NaN;
  const mx = mean(pairs.map((p) => p[0]));
  const my = mean(pairs.map((p) => p[1]));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  return dx === 0 || dy === 0 ? NaN : num / Math.sqrt(dx * dy);
}

/** Ordinary least squares slope of ys over x = 0…n−1. */
export function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return NaN;
  const mx = (n - 1) / 2;
  const my = mean(ys);
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  return num / den;
}

/** Histogram with `bins` equal-width buckets over [min, max]. */
export function histogram(xs: number[], bins: number): { x0: number; x1: number; count: number }[] {
  const v = finite(xs);
  if (!v.length) return [];
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const w = (hi - lo) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, count: 0 }));
  for (const x of v) out[Math.min(bins - 1, Math.floor((x - lo) / w))].count++;
  return out;
}
