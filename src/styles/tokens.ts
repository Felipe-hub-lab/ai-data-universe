import type { RegionId } from '../data/schema';

/**
 * Colour tokens shared by CSS (mirrored in global.css) and the WebGL scenes.
 * The region palette was validated for colour-vision deficiency on the dark surface
 * (adjacent-pair CVD ΔE ≥ 15, lightness band and contrast checks passing).
 */
export const COLORS = {
  bg: '#050608',
  surface: '#101319',
  text: '#F4F7FB',
  muted: '#8B95A7',
  cyan: '#00E5FF',
  blue: '#356BFF',
  violet: '#9B5CFF',
  good: '#35F2A3',
  bad: '#FF496C',
  warn: '#FFB547',
};

export const REGION_COLORS: Record<RegionId, string> = {
  N: '#0FA3BB',
  NE: '#B8862E',
  CO: '#5470F0',
  SE: '#3C9D7A',
  S: '#9461E3',
};

/** Diverging ramp for signed values: red ← neutral grey → cyan. */
export function divergingColor(t: number): string {
  const x = Math.max(-1, Math.min(1, t));
  const neutral = [139, 149, 167];
  const pos = [0, 229, 255];
  const neg = [255, 73, 108];
  const target = x >= 0 ? pos : neg;
  const k = Math.abs(x);
  const c = neutral.map((n, i) => Math.round(n + (target[i] - n) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Sequential ramp (one hue, dark → bright cyan) for magnitudes in [0,1]. */
export function sequentialColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  const lo = [22, 46, 74];
  const hi = [0, 229, 255];
  const c = lo.map((l, i) => Math.round(l + (hi[i] - l) * x));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
