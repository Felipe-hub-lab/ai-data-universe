import { fmt1, fmt2, fmtBRL, fmtBRLCompact, fmtCompact, fmtDelta, fmtInt, fmtPct, fmtPP } from '../lib/format';
import type { Metrics } from './aggregate';

/**
 * Single catalog of business metrics. KPIs, charts, tables, anomaly detection and the
 * analysis engine all reference these definitions, so a metric can never be computed
 * two different ways in two different screens.
 */

export type MetricId =
  | 'revenue'
  | 'shipments'
  | 'ticket'
  | 'grossProfit'
  | 'margin'
  | 'onTimeRate'
  | 'avgTransit'
  | 'costPerShipment'
  | 'claimsPer1k'
  | 'returnRate';

/**
 * volume: additive totals that scale with business size (seasonal).
 * value: per-unit money values (comparable across hubs).
 * ratio: proportions in [0,1] — changes are expressed in percentage points.
 * rate:  other intensive measures (days, per-mille) — changes expressed in %.
 */
export type MetricKind = 'volume' | 'value' | 'ratio' | 'rate';

export interface MetricDef {
  id: MetricId;
  name: string;
  unit: string;
  kind: MetricKind;
  higherIsBetter: boolean;
  description: string;
  formula: string;
  sourceFields: string[];
  format: (v: number) => string;
  formatCompact: (v: number) => string;
}

const nan = (f: (v: number) => string) => (v: number) => (Number.isFinite(v) ? f(v) : '—');

export const METRICS: Record<MetricId, MetricDef> = {
  revenue: {
    id: 'revenue',
    name: 'Receita',
    unit: 'R$',
    kind: 'volume',
    higherIsBetter: true,
    description: 'Receita de frete faturada no período.',
    formula: 'Σ revenue',
    sourceFields: ['revenue'],
    format: nan(fmtBRL),
    formatCompact: nan(fmtBRLCompact),
  },
  shipments: {
    id: 'shipments',
    name: 'Volume de envios',
    unit: 'envios',
    kind: 'volume',
    higherIsBetter: true,
    description: 'Quantidade de envios coletados no período.',
    formula: 'Σ shipments',
    sourceFields: ['shipments'],
    format: nan(fmtInt),
    formatCompact: nan(fmtCompact),
  },
  ticket: {
    id: 'ticket',
    name: 'Ticket médio',
    unit: 'R$/envio',
    kind: 'value',
    higherIsBetter: true,
    description: 'Receita média por envio. Varia com o mix de serviço, segmento e distância.',
    formula: 'Σ revenue ÷ Σ shipments',
    sourceFields: ['revenue', 'shipments'],
    format: nan(fmtBRL),
    formatCompact: nan(fmtBRL),
  },
  grossProfit: {
    id: 'grossProfit',
    name: 'Lucro bruto',
    unit: 'R$',
    kind: 'volume',
    higherIsBetter: true,
    description: 'Receita menos custo operacional direto (coleta, transferência, entrega).',
    formula: 'Σ revenue − Σ cost',
    sourceFields: ['revenue', 'cost'],
    format: nan(fmtBRL),
    formatCompact: nan(fmtBRLCompact),
  },
  margin: {
    id: 'margin',
    name: 'Margem bruta',
    unit: '%',
    kind: 'ratio',
    higherIsBetter: true,
    description: 'Parcela da receita que permanece após o custo operacional direto.',
    formula: '(Σ revenue − Σ cost) ÷ Σ revenue',
    sourceFields: ['revenue', 'cost'],
    format: nan((v) => fmtPct(v)),
    formatCompact: nan((v) => fmtPct(v)),
  },
  onTimeRate: {
    id: 'onTimeRate',
    name: 'Pontualidade (OTD)',
    unit: '%',
    kind: 'ratio',
    higherIsBetter: true,
    description: 'Percentual dos envios entregues dentro do prazo contratado (on-time delivery).',
    formula: 'Σ onTime ÷ Σ delivered',
    sourceFields: ['onTime', 'delivered'],
    format: nan((v) => fmtPct(v)),
    formatCompact: nan((v) => fmtPct(v)),
  },
  avgTransit: {
    id: 'avgTransit',
    name: 'Prazo médio',
    unit: 'dias',
    kind: 'rate',
    higherIsBetter: false,
    description: 'Tempo médio porta a porta dos envios entregues, em dias corridos.',
    formula: 'Σ transitDaysSum ÷ Σ delivered',
    sourceFields: ['transitDaysSum', 'delivered'],
    format: nan((v) => `${fmt2(v)} dias`),
    formatCompact: nan((v) => `${fmt1(v)} d`),
  },
  costPerShipment: {
    id: 'costPerShipment',
    name: 'Custo por envio',
    unit: 'R$/envio',
    kind: 'value',
    higherIsBetter: false,
    description: 'Custo operacional direto médio por envio.',
    formula: 'Σ cost ÷ Σ shipments',
    sourceFields: ['cost', 'shipments'],
    format: nan(fmtBRL),
    formatCompact: nan(fmtBRL),
  },
  claimsPer1k: {
    id: 'claimsPer1k',
    name: 'Avarias / mil envios',
    unit: '‰',
    kind: 'rate',
    higherIsBetter: false,
    description: 'Ocorrências de avaria ou extravio registradas a cada mil envios.',
    formula: 'Σ claims ÷ Σ shipments × 1000',
    sourceFields: ['claims', 'shipments'],
    format: nan((v) => `${fmt2(v)} ‰`),
    formatCompact: nan((v) => `${fmt1(v)} ‰`),
  },
  returnRate: {
    id: 'returnRate',
    name: 'Taxa de devolução',
    unit: '%',
    kind: 'ratio',
    higherIsBetter: false,
    description: 'Envios devolvidos ao remetente em relação ao total enviado.',
    formula: 'Σ returns ÷ Σ shipments',
    sourceFields: ['returns', 'shipments'],
    format: nan((v) => fmtPct(v)),
    formatCompact: nan((v) => fmtPct(v)),
  },
};

export const METRIC_LIST = Object.values(METRICS);

export const metricValue = (m: Metrics, id: MetricId): number => m[id];

export interface Change {
  /** Relative change (volume/value/rate) or absolute difference (ratio). */
  value: number;
  label: string;
  /** +1 favourable, −1 unfavourable, 0 neutral — already accounts for higherIsBetter. */
  sentiment: -1 | 0 | 1;
  mode: 'pct' | 'pp';
}

/** Compares two values of the same metric with the right arithmetic for its kind. */
export function compare(id: MetricId, current: number, previous: number): Change | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const def = METRICS[id];
  if (def.kind === 'ratio') {
    const d = current - previous;
    return { value: d, label: fmtPP(d), sentiment: sentimentOf(d, def.higherIsBetter, 0.0005), mode: 'pp' };
  }
  if (previous === 0) return null;
  const d = current / previous - 1;
  return { value: d, label: fmtDelta(d), sentiment: sentimentOf(d, def.higherIsBetter, 0.001), mode: 'pct' };
}

function sentimentOf(d: number, higherIsBetter: boolean, eps: number): -1 | 0 | 1 {
  if (Math.abs(d) < eps) return 0;
  return (d > 0) === higherIsBetter ? 1 : -1;
}
