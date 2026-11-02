import type { Dataset } from '../data/schema';
import { applyDimFilters, derive, emptyTotals, groupTotals, monthlyTotals, type Filters, type Metrics, type Totals } from './aggregate';
import { compare, METRICS, type MetricId, type MetricKind } from './metrics';
import { mad, mean, median, quantile, slope, std } from './stats';
import { fmt1, fmtDelta, fmtMonth } from '../lib/format';

/**
 * Anomaly detection over monthly hub-level series.
 *
 * Every method states what it compares against, and only applies to metric kinds for
 * which that comparison is meaningful. An anomaly is a statistical observation that
 * deserves investigation — never a diagnosis of fraud, error or operational failure.
 */

export type AnomalyMethod = 'zscore' | 'iqr' | 'mom' | 'yoy' | 'trend';

export interface MethodDef {
  id: AnomalyMethod;
  name: string;
  short: string;
  description: string;
  compatible: (kind: MetricKind) => boolean;
  incompatibleReason: string;
  /** Default threshold per metric kind and its unit label. */
  threshold: (kind: MetricKind) => { value: number; label: string; step: number; min: number; max: number };
}

export const ANOMALY_METRICS: MetricId[] = [
  'shipments',
  'revenue',
  'ticket',
  'onTimeRate',
  'avgTransit',
  'margin',
  'costPerShipment',
  'claimsPer1k',
];

const sigma = (value: number) => ({ value, label: 'σ', step: 0.5, min: 1.5, max: 6 });

export const METHODS: Record<AnomalyMethod, MethodDef> = {
  zscore: {
    id: 'zscore',
    name: 'Desvio em relação à média histórica (z-score)',
    short: 'Z-score histórico',
    description:
      'Compara cada mês com a média e o desvio-padrão dos 12 meses anteriores do próprio hub. Com o ajuste de rede ativo, remove antes a sazonalidade e a tendência comuns aos demais hubs. Exige também efeito prático mínimo (3% ou 0,5 p.p.).',
    compatible: () => true,
    incompatibleReason: '',
    threshold: () => sigma(3),
  },
  iqr: {
    id: 'iqr',
    name: 'Intervalo interquartil entre hubs (IQR)',
    short: 'IQR entre hubs',
    description:
      'Em cada mês, compara os hubs entre si: valores fora de [Q1 − k·IQR, Q3 + k·IQR] são atípicos. Só faz sentido para métricas intensivas (taxas, prazos, valores unitários).',
    compatible: (k) => k !== 'volume',
    incompatibleReason: 'Métricas de volume dependem do porte de cada hub; compará-las entre hubs apontaria apenas os maiores.',
    threshold: () => ({ value: 1.5, label: '× IQR', step: 0.25, min: 1, max: 4 }),
  },
  mom: {
    id: 'mom',
    name: 'Variação mês a mês',
    short: 'Variação MoM',
    description:
      'Mede a mudança em relação ao mês anterior: em % para volumes e valores, em pontos percentuais para proporções. Sensível à sazonalidade quando o ajuste de rede está desligado.',
    compatible: () => true,
    incompatibleReason: '',
    threshold: (k) =>
      k === 'ratio'
        ? { value: 0.03, label: 'p.p.', step: 0.005, min: 0.01, max: 0.15 }
        : { value: k === 'volume' ? 0.25 : 0.15, label: '%', step: 0.05, min: 0.05, max: 0.8 },
  },
  yoy: {
    id: 'yoy',
    name: 'Comparação com o mesmo mês do ano anterior',
    short: 'Ano contra ano',
    description:
      'Calcula o crescimento contra o mesmo mês do ano anterior (neutraliza a sazonalidade) e sinaliza meses cujo crescimento foge do padrão do hub (z robusto por mediana/MAD).',
    compatible: (k) => k === 'volume',
    incompatibleReason: 'Aplicado apenas a volumes sazonais; para taxas use z-score ou IQR.',
    threshold: () => ({ value: 3.5, label: 'z robusto', step: 0.5, min: 2, max: 6 }),
  },
  trend: {
    id: 'trend',
    name: 'Mudança de tendência',
    short: 'Quebra de tendência',
    description:
      'Compara a inclinação da participação do hub na rede nos últimos 6 meses do período com os 12 meses anteriores. Indica aceleração ou desaceleração estrutural.',
    compatible: (k) => k === 'volume',
    incompatibleReason: 'Aplicado a volumes (participação na rede); para taxas use z-score.',
    threshold: () => ({ value: 0.015, label: '% a.m.', step: 0.005, min: 0.005, max: 0.06 }),
  },
};

export type Priority = 'alta' | 'média' | 'baixa';

export interface Anomaly {
  id: string;
  hubId: string;
  monthIndex: number;
  metric: MetricId;
  method: AnomalyMethod;
  value: number;
  reference: number;
  referenceLabel: string;
  /** Magnitude in the method's own unit (σ, ×IQR, %, p.p.). */
  score: number;
  scoreLabel: string;
  /** |score| ÷ threshold — ≥ 1 by construction. */
  severity: number;
  direction: 'up' | 'down';
  favourable: boolean;
  priority: Priority;
  justification: string;
  nextSteps: string[];
}

export interface DetectOptions {
  metric: MetricId;
  method: AnomalyMethod;
  threshold?: number;
  /** Remove effects shared by the whole network (seasonality, common trend). */
  networkAdjusted?: boolean;
  /** Only report observations inside this month range. */
  range?: [number, number];
}

export interface HubSeries {
  hubs: Map<string, Metrics[]>;
  /** Per hub: the rest of the network (all other hubs) — leave-one-out baseline. */
  peers: Map<string, Metrics[]>;
  network: Metrics[];
}

export function buildHubSeries(ds: Dataset, filters: Omit<Filters, 'range'>): HubSeries {
  // Hub filter is intentionally ignored for the network baseline and series set: detecting
  // what is atypical needs the peers. Selection of a hub is applied to the *results*.
  const rows = applyDimFilters(ds.facts, { ...filters, hubs: [] });
  const byHub = groupTotals(rows, (r) => r.hubId);
  const networkTotals = monthlyTotals(rows, ds.months.length);
  const hubs = new Map<string, Metrics[]>();
  const peers = new Map<string, Metrics[]>();
  for (const hubId of byHub.keys()) {
    const own = monthlyTotals(rows.filter((r) => r.hubId === hubId), ds.months.length);
    hubs.set(hubId, own.map(derive));
    peers.set(hubId, networkTotals.map((t, i) => derive(subtract(t, own[i]))));
  }
  return { hubs, peers, network: networkTotals.map(derive) };
}

function subtract(a: Totals, b: Totals): Totals {
  const out = emptyTotals();
  for (const k of Object.keys(out) as (keyof Totals)[]) out[k] = a[k] - b[k];
  return out;
}

const priorityOf = (severity: number): Priority => (severity >= 2 ? 'alta' : severity >= 1.4 ? 'média' : 'baixa');

function nextStepsFor(metric: MetricId, direction: 'up' | 'down'): string[] {
  const common = 'Verificar se houve mudança de cadastro, de regra de faturamento ou falha de carga dos dados no mês.';
  switch (metric) {
    case 'shipments':
    case 'revenue':
      return [
        'Abrir o detalhamento por segmento e cliente para localizar a origem da variação.',
        direction === 'down' ? 'Confirmar com a operação se houve restrição de capacidade ou interrupção de coleta.' : 'Avaliar se o volume adicional é recorrente ou pontual antes de ajustar capacidade.',
        common,
      ];
    case 'onTimeRate':
    case 'avgTransit':
      return [
        'Cruzar com o volume do mês: picos de demanda costumam pressionar o prazo.',
        'Decompor por nível de serviço e rota para ver se o desvio é concentrado.',
        common,
      ];
    case 'claimsPer1k':
      return ['Separar avarias por segmento e tipo de ocorrência.', 'Comparar com hubs da mesma rota no mesmo mês.', common];
    default:
      return ['Decompor a variação entre efeito de mix (serviço/segmento) e efeito de preço ou custo unitário.', common];
  }
}

function makeAnomaly(
  partial: Omit<Anomaly, 'id' | 'priority' | 'favourable' | 'direction' | 'nextSteps' | 'severity' | 'justification'> & {
    threshold: number;
    months: string[];
    method: AnomalyMethod;
    explain: string;
  },
): Anomaly {
  const def = METRICS[partial.metric];
  const direction = partial.value >= partial.reference ? 'up' : 'down';
  const severity = Math.abs(partial.score) / partial.threshold;
  const delta = compare(partial.metric, partial.value, partial.reference);
  return {
    id: `${partial.method}|${partial.metric}|${partial.hubId}|${partial.monthIndex}`,
    hubId: partial.hubId,
    monthIndex: partial.monthIndex,
    metric: partial.metric,
    method: partial.method,
    value: partial.value,
    reference: partial.reference,
    referenceLabel: partial.referenceLabel,
    score: partial.score,
    scoreLabel: partial.scoreLabel,
    severity,
    direction,
    favourable: (direction === 'up') === def.higherIsBetter,
    priority: priorityOf(severity),
    justification: `${def.name} de ${def.format(partial.value)} em ${fmtMonth(partial.months[partial.monthIndex])}, contra referência de ${def.format(partial.reference)}${delta ? ` (${delta.label})` : ''}. ${partial.explain}`,
    nextSteps: nextStepsFor(partial.metric, direction),
  };
}

const val = (m: Metrics | undefined, id: MetricId) => (m ? m[id] : NaN);

export function detectAnomalies(series: HubSeries, months: string[], opts: DetectOptions): Anomaly[] {
  const def = METRICS[opts.metric];
  const method = METHODS[opts.method];
  if (!method.compatible(def.kind)) return [];
  const thr = opts.threshold ?? method.threshold(def.kind).value;
  const adjust = opts.networkAdjusted ?? true;
  const [ra, rb] = opts.range ?? [0, months.length - 1];
  const n = months.length;
  // Network adjustment against the hub's peers (all other hubs): proportions use the
  // spread in p.p.; everything else uses a relative index (hub ÷ peers).
  const isRatio = def.kind === 'ratio';
  const out: Anomaly[] = [];
  const inWindow = (t: number) => t >= ra && t <= rb;

  if (opts.method === 'iqr') {
    for (let t = ra; t <= rb; t++) {
      const entries = [...series.hubs.entries()].map(([h, s]) => [h, val(s[t], opts.metric)] as const);
      const xs = entries.map((e) => e[1]);
      const q1 = quantile(xs, 0.25);
      const q3 = quantile(xs, 0.75);
      const iqr = q3 - q1;
      if (!(iqr > 0)) continue;
      const lo = q1 - thr * iqr;
      const hi = q3 + thr * iqr;
      for (const [hubId, x] of entries) {
        if (!Number.isFinite(x) || (x >= lo && x <= hi)) continue;
        const fence = x > hi ? hi : lo;
        const score = (x - fence) / iqr + Math.sign(x - fence) * thr;
        out.push(
          makeAnomaly({
            hubId, monthIndex: t, metric: opts.metric, method: 'iqr', value: x, reference: median(xs),
            referenceLabel: 'Mediana dos hubs no mês', score, scoreLabel: `${fmt1(Math.abs(score))} × IQR`,
            threshold: thr, months,
            explain: `Fora da cerca ${x > hi ? 'superior' : 'inferior'} (${def.format(fence)}) do intervalo interquartil entre ${entries.length} hubs.`,
          }),
        );
      }
    }
    return out;
  }

  for (const [hubId, s] of series.hubs) {
    const net = series.peers.get(hubId)!.map((m) => val(m, opts.metric));
    const toAdj = (x: number, t: number) => (!adjust ? x : isRatio ? x - net[t] : x / net[t]);
    const fromAdj = (a: number, t: number) => (!adjust ? a : isRatio ? a + net[t] : a * net[t]);
    const raw = s.map((m) => val(m, opts.metric));
    const adj = raw.map(toAdj);

    if (opts.method === 'zscore') {
      for (let t = 6; t < n; t++) {
        if (!inWindow(t)) continue;
        const base = adj.slice(Math.max(0, t - 12), t);
        const m = mean(base);
        const sd = std(base);
        if (!(sd > 0) || !Number.isFinite(adj[t])) continue;
        const z = (adj[t] - m) / sd;
        if (Math.abs(z) < thr) continue;
        // Materiality: very smooth series turn tiny moves into large z. Require a
        // practical effect (≥ 3% relative, or ≥ 0.5 p.p. for proportions).
        const expected = fromAdj(m, t);
        const effect = isRatio ? Math.abs(raw[t] - expected) : Math.abs(raw[t] / expected - 1);
        if (effect < (isRatio ? 0.005 : 0.03)) continue;
        out.push(
          makeAnomaly({
            hubId, monthIndex: t, metric: opts.metric, method: 'zscore', value: raw[t], reference: expected,
            referenceLabel: adjust ? 'Esperado pela média histórica ajustada à rede' : 'Média dos 12 meses anteriores',
            score: z, scoreLabel: `${z > 0 ? '+' : '−'}${fmt1(Math.abs(z))}σ`, threshold: thr, months,
            explain: `Desvio de ${fmt1(Math.abs(z))} desvios-padrão em relação a ${base.length} meses anteriores${adjust ? ', após remover efeitos comuns da rede' : ''}.`,
          }),
        );
      }
    }

    if (opts.method === 'mom') {
      for (let t = 1; t < n; t++) {
        if (!inWindow(t)) continue;
        const prev = adj[t - 1];
        const cur = adj[t];
        if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
        const change = def.kind === 'ratio' ? cur - prev : prev === 0 ? NaN : cur / prev - 1;
        if (!(Math.abs(change) >= thr)) continue;
        const label = def.kind === 'ratio' ? `${change > 0 ? '+' : '−'}${fmt1(Math.abs(change) * 100)} p.p.` : fmtDelta(change);
        out.push(
          makeAnomaly({
            hubId, monthIndex: t, metric: opts.metric, method: 'mom', value: raw[t], reference: fromAdj(prev, t),
            referenceLabel: adjust ? 'Mês anterior, ajustado à rede' : 'Mês anterior', score: change, scoreLabel: label,
            threshold: thr, months, explain: `Variação de ${label} contra ${fmtMonth(months[t - 1])}${adjust ? ' (ajustada pela variação da rede)' : ''}.`,
          }),
        );
      }
    }

    if (opts.method === 'yoy') {
      const growth = raw.map((x, t) => (t >= 12 && raw[t - 12] > 0 ? x / raw[t - 12] - 1 : NaN));
      const g = growth.filter(Number.isFinite);
      if (g.length < 6) continue;
      const md = median(g);
      const spread = mad(g);
      if (!(spread > 0)) continue;
      for (let t = 12; t < n; t++) {
        if (!inWindow(t) || !Number.isFinite(growth[t])) continue;
        const rz = (growth[t] - md) / spread;
        if (Math.abs(rz) < thr) continue;
        out.push(
          makeAnomaly({
            hubId, monthIndex: t, metric: opts.metric, method: 'yoy', value: raw[t], reference: raw[t - 12] * (1 + md),
            referenceLabel: 'Mesmo mês do ano anterior × crescimento mediano do hub', score: rz,
            scoreLabel: `z robusto ${rz > 0 ? '+' : '−'}${fmt1(Math.abs(rz))}`, threshold: thr, months,
            explain: `Crescimento anual de ${fmtDelta(growth[t])} contra mediana de ${fmtDelta(md)} do próprio hub.`,
          }),
        );
      }
    }

    if (opts.method === 'trend') {
      const end = rb;
      if (end - 17 < 0) continue;
      const share = raw.map((x, t) => x / (net[t] + x));
      const total = (t: number) => net[t] + raw[t];
      const recent = share.slice(end - 5, end + 1);
      const before = share.slice(end - 17, end - 5);
      const level = mean(share.slice(end - 17, end + 1));
      const dRecent = slope(recent) / level;
      const dBefore = slope(before) / level;
      const shift = dRecent - dBefore;
      if (!(Math.abs(shift) >= thr)) continue;
      out.push(
        makeAnomaly({
          hubId, monthIndex: end - 5, metric: opts.metric, method: 'trend', value: raw[end],
          reference: (before[before.length - 1] + slope(before) * 6) * total(end),
          referenceLabel: 'Projeção da tendência dos 12 meses anteriores', score: shift,
          scoreLabel: `${shift > 0 ? '+' : '−'}${fmt1(Math.abs(shift) * 100)}% a.m.`, threshold: thr, months,
          explain: `A participação do hub na rede passou de ${fmtDelta(dBefore)} a.m. para ${fmtDelta(dRecent)} a.m. a partir de ${fmtMonth(months[end - 5])}.`,
        }),
      );
    }
  }
  return out.sort((a, b) => b.severity - a.severity);
}

/** Default scan used by the 3D overlays and the Command Center: z-score on key metrics. */
export function scanKeyAnomalies(ds: Dataset, filters: Filters): Anomaly[] {
  const series = buildHubSeries(ds, filters);
  const metrics: MetricId[] = ['shipments', 'onTimeRate', 'avgTransit', 'margin', 'costPerShipment', 'claimsPer1k'];
  const all = metrics.flatMap((metric) =>
    detectAnomalies(series, ds.months, { metric, method: 'zscore', range: filters.range, networkAdjusted: true }),
  );
  const byHub = filters.hubs.length ? all.filter((a) => filters.hubs.includes(a.hubId)) : all;
  return byHub.sort((a, b) => b.severity - a.severity);
}
