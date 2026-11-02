import { describe, expect, it } from 'vitest';
import { generateSyntheticDataset } from '../src/data/synthetic';
import { applyFilters, derive, previousRange, sumRows, type Filters } from '../src/analytics/aggregate';
import { buildHubSeries, detectAnomalies, METHODS } from '../src/analytics/anomalies';
import { breakdown, contribution, revenueBridge } from '../src/analytics/breakdown';
import { healthIndex } from '../src/analytics/health';
import { buildOverview } from '../src/analytics/insights';
import { compare, METRICS } from '../src/analytics/metrics';
import { buildMissions, checkMission } from '../src/analytics/missions';
import { quantile, std } from '../src/analytics/stats';
import { relevantChanges } from '../src/analytics/temporal';
import { analyze, classify } from '../src/ai/engine';

const ds = generateSyntheticDataset();
const all = (range: [number, number]): Filters => ({ range, regions: [], segments: [], services: [], hubs: [] });
const last6 = all([18, 23]);

describe('aggregation & metrics', () => {
  it('derives ratios from sums (never averages of ratios)', () => {
    const rows = applyFilters(ds.facts, last6);
    const m = derive(sumRows(rows));
    expect(m.onTimeRate).toBeCloseTo(rows.reduce((a, r) => a + r.onTime, 0) / rows.reduce((a, r) => a + r.delivered, 0), 12);
    expect(m.margin).toBeCloseTo((m.revenue - m.cost) / m.revenue, 12);
  });

  it('breakdown members add up to the total', () => {
    const total = derive(sumRows(applyFilters(ds.facts, last6)));
    const hubs = breakdown(ds, last6, 'hub');
    expect(hubs.reduce((a, g) => a + g.metrics.revenue, 0)).toBeCloseTo(total.revenue, 2);
  });

  it('refuses to invent a comparison window', () => {
    expect(previousRange([0, 5])).toBeNull();
    expect(previousRange([6, 11])).toEqual([0, 5]);
  });

  it('compares proportions in p.p. and volumes in %', () => {
    expect(compare('onTimeRate', 0.92, 0.9)!.mode).toBe('pp');
    expect(compare('revenue', 110, 100)!.value).toBeCloseTo(0.1);
    expect(compare('avgTransit', 4, 3)!.sentiment).toBe(-1);
    expect(compare('revenue', 1, NaN)).toBeNull();
  });

  it('empty filters produce NaN ratios, not Infinity', () => {
    const m = derive(sumRows(applyFilters(ds.facts, { ...last6, hubs: ['NOPE'] })));
    expect(m.revenue).toBe(0);
    expect(Number.isNaN(m.onTimeRate)).toBe(true);
  });
});

describe('contribution analysis', () => {
  it('member contributions sum exactly to the total change (additive and ratio metrics)', () => {
    for (const metric of ['revenue', 'onTimeRate', 'margin', 'ticket'] as const) {
      const c = contribution(ds, last6, 'segment', metric, [12, 17], [18, 23]);
      const sum = c.rows.reduce((a, r) => a + r.contribution, 0);
      expect(sum).toBeCloseTo(c.totalChange, 6);
    }
  });

  it('revenue bridge closes', () => {
    const a = sumRows(applyFilters(ds.facts, all([12, 17])));
    const b = sumRows(applyFilters(ds.facts, last6));
    const br = revenueBridge(a, b);
    expect(br.volumeEffect + br.ticketEffect).toBeCloseTo(br.total, 4);
  });
});

describe('health index', () => {
  it('stays within 0–100 and re-weights when growth is unavailable', () => {
    const cur = derive(sumRows(applyFilters(ds.facts, all([0, 5]))));
    const h = healthIndex(cur, null);
    expect(h.components.find((c) => c.id === 'growth')!.available).toBe(false);
    expect(h.score).toBeGreaterThanOrEqual(0);
    expect(h.score).toBeLessThanOrEqual(100);
  });
});

describe('anomaly detection finds the planted scenarios', () => {
  const series = buildHubSeries(ds, all([0, 23]));
  const top = (metric: Parameters<typeof detectAnomalies>[2]['metric'], method: Parameters<typeof detectAnomalies>[2]['method'] = 'zscore') =>
    detectAnomalies(series, ds.months, { metric, method })[0];

  it('Manaus transit-time spike in 2026-03', () => {
    const a = top('avgTransit');
    expect(a.hubId).toBe('MAO');
    expect(ds.months[a.monthIndex]).toBe('2026-03');
    expect(a.priority).toBe('alta');
  });
  it('Curitiba claims spike in 2026-06', () => {
    const a = top('claimsPer1k');
    expect([a.hubId, ds.months[a.monthIndex]]).toEqual(['CWB', '2026-06']);
  });
  it('Porto Alegre volume drop in 2026-05 (z-score and YoY agree)', () => {
    expect([top('shipments').hubId, ds.months[top('shipments').monthIndex]]).toEqual(['POA', '2026-05']);
    expect(top('shipments', 'yoy').hubId).toBe('POA');
  });
  it('Belém margin deterioration in 2026-07', () => {
    const a = top('margin');
    expect([a.hubId, ds.months[a.monthIndex]]).toEqual(['BEL', '2026-07']);
    expect(a.favourable).toBe(false);
  });
  it('does not apply incompatible methods', () => {
    expect(METHODS.iqr.compatible(METRICS.shipments.kind)).toBe(false);
    expect(detectAnomalies(series, ds.months, { metric: 'shipments', method: 'iqr' })).toEqual([]);
  });
  it('flags few false positives with the default key-metric scan', () => {
    const o = buildOverview(ds, last6);
    expect(o.anomalies.length).toBeLessThan(40);
  });
});

describe('temporal helpers', () => {
  it('detects statistically relevant month-over-month changes', () => {
    const vals = [100, 101, 99, 100, 140, 100, 101, 100, 99, 100];
    const c = relevantChanges(vals, 1.5);
    expect(c.map((x) => x.index)).toContain(4);
  });
  it('stats helpers match known values', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });
});

describe('missions are validated against computed answers', () => {
  const missions = buildMissions(ds);
  it('builds all missions with answers', () => {
    expect(missions.length).toBe(6);
    missions.forEach((m) => expect(m.answer).toBeTruthy());
  });
  it('accepts the right selection and rejects others', () => {
    const transit = missions.find((m) => m.id === 'm-transit')!;
    expect(checkMission(ds, transit, { hubId: transit.answer })).toBe(true);
    expect(checkMission(ds, transit, { hubId: 'SAO' })).toBe(false);
    expect(checkMission(ds, transit, {})).toBeNull();
    const region = missions.find((m) => m.target === 'region')!;
    const hubInRegion = ds.hubs.find((h) => h.region === region.answer)!;
    expect(checkMission(ds, region, { hubId: hubInRegion.id })).toBe(true);
  });
});

describe('deterministic analysis engine', () => {
  it('classifies the suggested questions', () => {
    expect(classify('O que mais contribuiu para a variação da receita?')).toBe('drivers');
    expect(classify('Quais grupos apresentam comportamento atípico?')).toBe('atypical');
    expect(classify('O que mudou entre os dois períodos selecionados?')).toBe('compare');
    expect(classify('qual a cor do céu')).toBeNull();
  });
  it('answers with evidence and admits when it cannot', () => {
    const r = analyze(ds, { question: 'O que mais contribuiu para a variação da receita?', filters: last6, metric: 'revenue' });
    expect(r.engine).toBe('deterministic');
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.limitations.length).toBeGreaterThan(0);
    const none = analyze(ds, { question: 'O que mais contribuiu para a variação?', filters: all([0, 5]), metric: 'revenue' });
    expect(none.insufficient).toBe(true);
    const unknown = analyze(ds, { question: 'qual a cor do céu', filters: last6, metric: 'revenue' });
    expect(unknown.insufficient).toBe(true);
  });
  it('narrows the scope when a hub is named in the question', () => {
    const r = analyze(ds, { question: 'O que mudou em Manaus entre os dois períodos?', filters: last6, metric: 'revenue' });
    const mao = derive(sumRows(applyFilters(ds.facts, { ...last6, hubs: ['MAO'] })));
    expect(r.table!.rows[0][2]).toBe(METRICS.revenue.format(mao.revenue));
  });
});
