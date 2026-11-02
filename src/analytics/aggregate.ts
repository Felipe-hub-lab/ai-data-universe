import type { FactRow, RegionId } from '../data/schema';

/** Global filter state. Empty arrays mean "all members". `range` is inclusive month indexes. */
export interface Filters {
  range: [number, number];
  regions: RegionId[];
  segments: string[];
  services: string[];
  hubs: string[];
}

export interface Totals {
  rows: number;
  shipments: number;
  delivered: number;
  onTime: number;
  revenue: number;
  cost: number;
  transitDaysSum: number;
  claims: number;
  returns: number;
}

export interface Metrics extends Totals {
  /** onTime / delivered */
  onTimeRate: number;
  /** transitDaysSum / delivered */
  avgTransit: number;
  /** revenue / shipments */
  ticket: number;
  /** revenue − cost */
  grossProfit: number;
  /** (revenue − cost) / revenue */
  margin: number;
  /** cost / shipments */
  costPerShipment: number;
  /** claims / shipments × 1000 */
  claimsPer1k: number;
  /** returns / shipments */
  returnRate: number;
}

export const emptyTotals = (): Totals => ({
  rows: 0,
  shipments: 0,
  delivered: 0,
  onTime: 0,
  revenue: 0,
  cost: 0,
  transitDaysSum: 0,
  claims: 0,
  returns: 0,
});

export function addInto(t: Totals, r: FactRow | Totals): Totals {
  t.rows += 'rows' in r ? r.rows : 1;
  t.shipments += r.shipments;
  t.delivered += r.delivered;
  t.onTime += r.onTime;
  t.revenue += r.revenue;
  t.cost += r.cost;
  t.transitDaysSum += r.transitDaysSum;
  t.claims += r.claims;
  t.returns += r.returns;
  return t;
}

export function sumRows(rows: Iterable<FactRow>): Totals {
  const t = emptyTotals();
  for (const r of rows) addInto(t, r);
  return t;
}

/** Division that returns NaN (rendered as "—") instead of Infinity when the base is empty. */
export const safeDiv = (a: number, b: number) => (b === 0 ? NaN : a / b);

export function derive(t: Totals): Metrics {
  return {
    ...t,
    onTimeRate: safeDiv(t.onTime, t.delivered),
    avgTransit: safeDiv(t.transitDaysSum, t.delivered),
    ticket: safeDiv(t.revenue, t.shipments),
    grossProfit: t.revenue - t.cost,
    margin: safeDiv(t.revenue - t.cost, t.revenue),
    costPerShipment: safeDiv(t.cost, t.shipments),
    claimsPer1k: safeDiv(t.claims, t.shipments) * 1000,
    returnRate: safeDiv(t.returns, t.shipments),
  };
}

export function matchesDims(r: FactRow, f: Omit<Filters, 'range'>): boolean {
  return (
    (f.regions.length === 0 || f.regions.includes(r.regionId)) &&
    (f.segments.length === 0 || f.segments.includes(r.segmentId)) &&
    (f.services.length === 0 || f.services.includes(r.serviceId)) &&
    (f.hubs.length === 0 || f.hubs.includes(r.hubId))
  );
}

export function inRange(r: FactRow, [a, b]: [number, number]): boolean {
  return r.monthIndex >= a && r.monthIndex <= b;
}

export function applyFilters(rows: FactRow[], f: Filters): FactRow[] {
  return rows.filter((r) => inRange(r, f.range) && matchesDims(r, f));
}

/** Dimension filters only — used for time series that must show the full timeline. */
export function applyDimFilters(rows: FactRow[], f: Omit<Filters, 'range'>): FactRow[] {
  return rows.filter((r) => matchesDims(r, f));
}

export function groupTotals<K extends string>(rows: Iterable<FactRow>, key: (r: FactRow) => K): Map<K, Totals> {
  const out = new Map<K, Totals>();
  for (const r of rows) {
    const k = key(r);
    let t = out.get(k);
    if (!t) out.set(k, (t = emptyTotals()));
    addInto(t, r);
  }
  return out;
}

/** One Totals per month index (0…monthCount−1); months without rows are empty Totals. */
export function monthlyTotals(rows: Iterable<FactRow>, monthCount: number): Totals[] {
  const out = Array.from({ length: monthCount }, emptyTotals);
  for (const r of rows) addInto(out[r.monthIndex], r);
  return out;
}

/**
 * The comparison window for a range: the same number of months immediately before it.
 * Returns null when the dataset does not reach back far enough — callers must then say
 * "no comparison base" instead of inventing one.
 */
export function previousRange([a, b]: [number, number]): [number, number] | null {
  const len = b - a + 1;
  return a - len < 0 ? null : [a - len, a - 1];
}

/** Same months one year earlier (requires 12 months of history before the range). */
export function yearAgoRange([a, b]: [number, number]): [number, number] | null {
  return a - 12 < 0 ? null : [a - 12, b - 12];
}
