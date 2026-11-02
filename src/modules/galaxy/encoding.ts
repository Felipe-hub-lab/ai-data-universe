import type { Metrics } from '../../analytics/aggregate';
import type { Entity } from '../../analytics/entities';
import { fmtDelta, fmtPP } from '../../lib/format';
import type { GalaxyColor } from '../../state/store';
import { COLORS, divergingColor, REGION_COLORS } from '../../styles/tokens';

/**
 * Visual encoding rules for the Data Galaxy — the single source of truth used by the 3D
 * scene, the 2D fallback and the legend. Documented in docs/VISUAL_MAPPING.md.
 */

export const COLOR_MODES: { id: GalaxyColor; label: string; description: string }[] = [
  { id: 'region', label: 'Região', description: 'Cor categórica por macrorregião do hub.' },
  { id: 'growth', label: 'Crescimento', description: 'Variação da receita contra o período anterior: vermelho = queda, ciano = alta (saturação em ±15%).' },
  { id: 'onTimeRate', label: 'Pontualidade', description: 'Pontualidade relativa à rede: vermelho = abaixo, ciano = acima (saturação em ±4 p.p.).' },
  { id: 'margin', label: 'Margem', description: 'Margem relativa à rede: vermelho = abaixo, ciano = acima (saturação em ±8 p.p.).' },
  { id: 'anomaly', label: 'Anomalias', description: 'Vermelho = hub com observações atípicas no período (intensidade ∝ quantidade); cinza = sem ocorrências.' },
];

export function entityColor(e: Entity, mode: GalaxyColor, network: Metrics): string {
  switch (mode) {
    case 'region':
      return REGION_COLORS[e.regionId];
    case 'growth':
      return Number.isFinite(e.growth) ? divergingColor(e.growth / 0.15) : '#3a4150';
    case 'onTimeRate':
      return divergingColor((e.m.onTimeRate - network.onTimeRate) / 0.04);
    case 'margin':
      return divergingColor((e.m.margin - network.margin) / 0.08);
    case 'anomaly':
      return e.hubAnomalies > 0 ? mix('#5a2030', COLORS.bad, Math.min(1, e.hubAnomalies / 3)) : '#3a4150';
  }
}

export function colorValueLabel(e: Entity, mode: GalaxyColor, network: Metrics): string {
  switch (mode) {
    case 'region':
      return '';
    case 'growth':
      return Number.isFinite(e.growth) ? `Crescimento ${fmtDelta(e.growth)}` : 'Sem período anterior';
    case 'onTimeRate':
      return `OTD vs rede ${fmtPP(e.m.onTimeRate - network.onTimeRate)}`;
    case 'margin':
      return `Margem vs rede ${fmtPP(e.m.margin - network.margin)}`;
    case 'anomaly':
      return `${e.hubAnomalies} observação(ões) atípica(s) no hub`;
  }
}

function mix(a: string, b: string, t: number): string {
  const pa = hex(a);
  const pb = hex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Sphere radius ∝ √revenue (so that apparent AREA is proportional to revenue). */
export function sizeScale(entities: Entity[]): (revenue: number) => number {
  const max = Math.max(1, ...entities.map((e) => e.m.revenue));
  return (r) => 0.05 + 0.21 * Math.sqrt(Math.max(0, r) / max);
}

export interface Domain {
  min: number;
  max: number;
}

/** Padded extent for scatter axes. */
export function domainOf(values: number[], pad = 0.06): Domain {
  const v = values.filter(Number.isFinite);
  if (!v.length) return { min: 0, max: 1 };
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = hi - lo || Math.abs(hi) * 0.1 || 1;
  return { min: lo - span * pad, max: hi + span * pad };
}

export const SCATTER = {
  x: { metric: 'onTimeRate' as const, label: 'X · Pontualidade (OTD)', range: [-6, 6] as [number, number] },
  y: { metric: 'margin' as const, label: 'Y · Margem bruta', range: [0, 7] as [number, number] },
  z: { metric: 'ticket' as const, label: 'Z · Ticket médio', range: [5, -5] as [number, number] },
};
