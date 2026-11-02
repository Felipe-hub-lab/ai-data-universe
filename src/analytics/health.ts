import type { Metrics } from './aggregate';

/**
 * Operational Health Index (0–100). A transparent composite — every component is a
 * linear rescale of one metric between a "floor" (0 pts) and a "target" (100 pts),
 * clamped, then weighted. Thresholds are documented in docs/METRICS.md.
 */

export interface HealthComponent {
  id: 'onTime' | 'margin' | 'growth' | 'quality';
  label: string;
  weight: number;
  raw: number;
  score: number;
  floor: number;
  target: number;
  available: boolean;
}

export interface Health {
  score: number;
  components: HealthComponent[];
  band: 'forte' | 'estável' | 'atenção' | 'crítico';
}

const scale = (v: number, floor: number, target: number) =>
  Math.max(0, Math.min(100, ((v - floor) / (target - floor)) * 100));

export const HEALTH_SPEC = [
  { id: 'onTime', label: 'Pontualidade', weight: 0.35, floor: 0.85, target: 0.97 },
  { id: 'margin', label: 'Margem', weight: 0.25, floor: 0.1, target: 0.28 },
  { id: 'growth', label: 'Crescimento', weight: 0.2, floor: -0.1, target: 0.1 },
  { id: 'quality', label: 'Qualidade', weight: 0.2, floor: 8, target: 2 },
] as const;

export function healthIndex(current: Metrics, previous: Metrics | null): Health {
  const raw = {
    onTime: current.onTimeRate,
    margin: current.margin,
    growth: previous && previous.revenue > 0 ? current.revenue / previous.revenue - 1 : NaN,
    quality: current.claimsPer1k,
  };
  const components: HealthComponent[] = HEALTH_SPEC.map((s) => {
    const v = raw[s.id];
    const available = Number.isFinite(v);
    return { ...s, raw: v, score: available ? scale(v, s.floor, s.target) : NaN, available };
  });
  const used = components.filter((c) => c.available);
  const wsum = used.reduce((a, c) => a + c.weight, 0);
  const score = wsum ? used.reduce((a, c) => a + c.score * c.weight, 0) / wsum : NaN;
  const band = score >= 75 ? 'forte' : score >= 60 ? 'estável' : score >= 45 ? 'atenção' : 'crítico';
  return { score, components, band };
}
