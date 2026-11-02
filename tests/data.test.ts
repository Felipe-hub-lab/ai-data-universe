import { describe, expect, it } from 'vitest';
import { generateSyntheticDataset, laneRoutes, mulberry32 } from '../src/data/synthetic';
import { parseCsv, toCsv } from '../src/lib/csv';

describe('synthetic dataset', () => {
  const ds = generateSyntheticDataset();

  it('is deterministic for a given seed', () => {
    const again = generateSyntheticDataset();
    expect(again.facts).toEqual(ds.facts);
    expect(generateSyntheticDataset(7).facts[0]).not.toEqual(ds.facts[0]);
  });

  it('has the documented shape: 24 months × 20 hubs × 5 segments × 4 services', () => {
    expect(ds.months).toHaveLength(24);
    expect(ds.months[0]).toBe('2024-10');
    expect(ds.meta.asOf).toBe('2026-09');
    expect(ds.facts).toHaveLength(24 * 20 * 5 * 4);
    expect(new Set(ds.facts.map((f) => f.id)).size).toBe(ds.facts.length);
  });

  it('keeps internal consistency between counts', () => {
    for (const f of ds.facts) {
      expect(f.onTime).toBeLessThanOrEqual(f.delivered);
      expect(f.delivered).toBeLessThanOrEqual(f.shipments);
      expect(f.revenue).toBeGreaterThan(0);
      expect(f.cost).toBeGreaterThan(0);
      expect(f.regionId).toBe(ds.hubs.find((h) => h.id === f.hubId)!.region);
    }
  });

  it('contains a small, deliberate share of missing weights only', () => {
    const missing = ds.facts.filter((f) => f.weightKg === null).length;
    expect(missing).toBeGreaterThan(0);
    expect(missing / ds.facts.length).toBeLessThan(0.02);
  });

  it('derives lanes from origin volume with fixed shares', () => {
    const routes = laneRoutes();
    const mi = 5;
    const out = ds.facts.filter((f) => f.monthIndex === mi && f.hubId === 'REC').reduce((a, f) => a + f.shipments, 0);
    const lane = ds.lanes.find((l) => l.monthIndex === mi && l.origin === 'REC' && l.destination === 'SAO')!;
    expect(lane.shipments).toBe(Math.round(out * routes.find((r) => r.origin === 'REC' && r.destination === 'SAO')!.share));
  });

  it('PRNG is uniform-ish in [0,1)', () => {
    const r = mulberry32(1);
    const xs = Array.from({ length: 5000 }, r);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(xs.reduce((a, b) => a + b, 0) / xs.length).toBeCloseTo(0.5, 1);
  });
});

describe('csv', () => {
  it('round-trips quoted values', () => {
    const rows = [{ a: 'x,y', b: 'he said "hi"', c: 3 }];
    const text = toCsv(rows, ['a', 'b', 'c']);
    expect(parseCsv(text)).toEqual([{ a: 'x,y', b: 'he said "hi"', c: '3' }]);
  });
});
