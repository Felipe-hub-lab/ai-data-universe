import type { Dataset, RegionId } from '../data/schema';
import { applyFilters, derive, groupTotals, previousRange, type Filters, type Metrics } from './aggregate';
import type { Anomaly } from './anomalies';

/**
 * Galaxy entities: one object per hub × segment inside the filtered window. This is the
 * grain at which the 3D scene encodes data (see docs/VISUAL_MAPPING.md).
 */
export interface Entity {
  id: string;
  hubId: string;
  segmentId: string;
  regionId: RegionId;
  m: Metrics;
  prev: Metrics | null;
  /** Revenue growth vs previous equal-length window (NaN when unavailable). */
  growth: number;
  /** Count of key-metric anomalies of the parent hub inside the window. */
  hubAnomalies: number;
}

export function computeEntities(ds: Dataset, filters: Filters, anomalies: Anomaly[]): Entity[] {
  const key = (r: { hubId: string; segmentId: string }) => `${r.hubId}|${r.segmentId}`;
  const cur = groupTotals(applyFilters(ds.facts, filters), key);
  const pr = previousRange(filters.range);
  const prev = pr ? groupTotals(applyFilters(ds.facts, { ...filters, range: pr }), key) : null;
  const anomalyCount = new Map<string, number>();
  anomalies.forEach((a) => anomalyCount.set(a.hubId, (anomalyCount.get(a.hubId) ?? 0) + 1));
  const region = new Map(ds.hubs.map((h) => [h.id, h.region]));
  return [...cur.entries()].map(([id, t]) => {
    const [hubId, segmentId] = id.split('|');
    const m = derive(t);
    const p = prev?.get(id);
    const pm = p ? derive(p) : null;
    return {
      id,
      hubId,
      segmentId,
      regionId: region.get(hubId)!,
      m,
      prev: pm,
      growth: pm && pm.revenue > 0 ? m.revenue / pm.revenue - 1 : NaN,
      hubAnomalies: anomalyCount.get(hubId) ?? 0,
    };
  });
}
