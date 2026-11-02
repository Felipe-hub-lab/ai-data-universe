import type { Dataset, FactRow } from '../data/schema';
import { applyFilters, derive, emptyTotals, groupTotals, previousRange, sumRows, type Filters, type Metrics, type Totals } from './aggregate';
import type { MetricId } from './metrics';

/** Dimensions available for grouping, drill-down and contribution analysis. */
export type Dim = 'region' | 'hub' | 'segment' | 'service';

export const DIM_LABEL: Record<Dim, string> = { region: 'Região', hub: 'Hub', segment: 'Segmento', service: 'Serviço' };

export const dimKey = (dim: Dim) => (r: FactRow): string =>
  dim === 'region' ? r.regionId : dim === 'hub' ? r.hubId : dim === 'segment' ? r.segmentId : r.serviceId;

export function dimLabel(ds: Dataset, dim: Dim, key: string): string {
  const list =
    dim === 'region' ? ds.regions : dim === 'hub' ? ds.hubs : dim === 'segment' ? ds.segments : ds.services;
  return list.find((x) => x.id === key)?.name ?? key;
}

export function dimMembers(ds: Dataset, dim: Dim): { id: string; name: string }[] {
  return dim === 'region' ? ds.regions : dim === 'hub' ? ds.hubs : dim === 'segment' ? ds.segments : ds.services;
}

export interface Group {
  key: string;
  label: string;
  metrics: Metrics;
  previous: Metrics | null;
}

/** Aggregates the filtered range by a dimension, with the previous equal-length window. */
export function breakdown(ds: Dataset, filters: Filters, dim: Dim): Group[] {
  const cur = groupTotals(applyFilters(ds.facts, filters), dimKey(dim));
  const pr = previousRange(filters.range);
  const prev = pr ? groupTotals(applyFilters(ds.facts, { ...filters, range: pr }), dimKey(dim)) : null;
  return [...cur.entries()].map(([key, t]) => ({
    key,
    label: dimLabel(ds, dim, key),
    metrics: derive(t),
    previous: prev ? derive(prev.get(key) ?? emptyTotals()) : null,
  }));
}

/**
 * Exact additive decomposition of a metric change between two periods across the
 * members of a dimension.
 *
 * For a metric M = Σnum / Σden, member i contributes  num₁ᵢ/DEN₁ − num₀ᵢ/DEN₀.
 * The contributions sum exactly to M₁ − M₀ (both rate and mix effects are included).
 * For additive metrics (den ≡ 1) this is simply the member's absolute change.
 */
const PARTS: Record<MetricId, { num: (t: Totals) => number; den: ((t: Totals) => number) | null }> = {
  revenue: { num: (t) => t.revenue, den: null },
  shipments: { num: (t) => t.shipments, den: null },
  grossProfit: { num: (t) => t.revenue - t.cost, den: null },
  margin: { num: (t) => t.revenue - t.cost, den: (t) => t.revenue },
  onTimeRate: { num: (t) => t.onTime, den: (t) => t.delivered },
  ticket: { num: (t) => t.revenue, den: (t) => t.shipments },
  avgTransit: { num: (t) => t.transitDaysSum, den: (t) => t.delivered },
  costPerShipment: { num: (t) => t.cost, den: (t) => t.shipments },
  claimsPer1k: { num: (t) => t.claims * 1000, den: (t) => t.shipments },
  returnRate: { num: (t) => t.returns, den: (t) => t.shipments },
};

export interface ContributionRow {
  key: string;
  label: string;
  before: number;
  after: number;
  contribution: number;
  /** contribution ÷ total change (can exceed ±100% when members move in opposite directions). */
  shareOfChange: number;
}

export interface ContributionResult {
  metric: MetricId;
  dim: Dim;
  totalBefore: number;
  totalAfter: number;
  totalChange: number;
  rows: ContributionRow[];
}

export function contribution(
  ds: Dataset,
  filters: Filters,
  dim: Dim,
  metric: MetricId,
  rangeBefore: [number, number],
  rangeAfter: [number, number],
): ContributionResult {
  const part = PARTS[metric];
  const ga = groupTotals(applyFilters(ds.facts, { ...filters, range: rangeBefore }), dimKey(dim));
  const gb = groupTotals(applyFilters(ds.facts, { ...filters, range: rangeAfter }), dimKey(dim));
  const ta = sumRows(applyFilters(ds.facts, { ...filters, range: rangeBefore }));
  const tb = sumRows(applyFilters(ds.facts, { ...filters, range: rangeAfter }));
  const DA = part.den ? part.den(ta) : 1;
  const DB = part.den ? part.den(tb) : 1;
  const total = (t: Totals) => (part.den ? part.num(t) / part.den(t) : part.num(t));
  const totalBefore = total(ta);
  const totalAfter = total(tb);
  const keys = new Set([...ga.keys(), ...gb.keys()]);
  const totalChange = totalAfter - totalBefore;
  const rows = [...keys].map((key) => {
    const a = ga.get(key) ?? emptyTotals();
    const b = gb.get(key) ?? emptyTotals();
    const c = part.num(b) / DB - part.num(a) / DA;
    return {
      key,
      label: dimLabel(ds, dim, key),
      before: part.den ? part.num(a) / (part.den(a) || NaN) : part.num(a),
      after: part.den ? part.num(b) / (part.den(b) || NaN) : part.num(b),
      contribution: c,
      shareOfChange: totalChange === 0 ? NaN : c / totalChange,
    };
  });
  rows.sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution));
  return { metric, dim, totalBefore, totalAfter, totalChange, rows };
}

/** Revenue bridge: ΔR = (S₁ − S₀)·T₀  [volume]  +  S₁·(T₁ − T₀)  [ticket: price + mix]. */
export function revenueBridge(before: Totals, after: Totals) {
  const t0 = before.revenue / before.shipments;
  const t1 = after.revenue / after.shipments;
  const volumeEffect = (after.shipments - before.shipments) * t0;
  const ticketEffect = after.shipments * (t1 - t0);
  return { volumeEffect, ticketEffect, total: after.revenue - before.revenue };
}
