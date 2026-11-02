import { useMemo } from 'react';
import { applyDimFilters, applyFilters, derive, monthlyTotals } from '../analytics/aggregate';
import { computeEntities } from '../analytics/entities';
import { buildOverview } from '../analytics/insights';
import { useDataset, useStore } from './store';

/**
 * Memoised views over the shared dataset. Every module reads through these hooks, so
 * the same filters always produce the same numbers everywhere.
 */

export function useOverview() {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  return useMemo(() => buildOverview(ds, filters), [ds, filters]);
}

export function useFilteredRows() {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  return useMemo(() => applyFilters(ds.facts, filters), [ds, filters]);
}

export function useEntities() {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  const overview = useOverview();
  return useMemo(() => computeEntities(ds, filters, overview.anomalies), [ds, filters, overview.anomalies]);
}

export function useNames() {
  const ds = useDataset();
  return useMemo(() => {
    const hub = new Map(ds.hubs.map((h) => [h.id, h.name]));
    const seg = new Map(ds.segments.map((s) => [s.id, s.name]));
    const reg = new Map(ds.regions.map((r) => [r.id as string, r.name]));
    const svc = new Map(ds.services.map((s) => [s.id, s.name]));
    return {
      hub: (id: string) => hub.get(id) ?? id,
      segment: (id: string) => seg.get(id) ?? id,
      region: (id: string) => reg.get(id) ?? id,
      service: (id: string) => svc.get(id) ?? id,
    };
  }, [ds]);
}

/** Full monthly timeline (all months) under the dimension filters — for trend context. */
export function useMonthly() {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  return useMemo(
    () => monthlyTotals(applyDimFilters(ds.facts, filters), ds.months.length).map(derive),
    [ds, filters],
  );
}
