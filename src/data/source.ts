import { HUBS, REGIONS, SEGMENTS, SERVICES } from './reference';
import type { Dataset, FactRow, RegionId } from './schema';
import { buildLanes, generateSyntheticDataset } from './synthetic';
import { parseCsv } from '../lib/csv';

/**
 * Data access layer. The UI only ever talks to a `DataSource`; swapping the demo
 * generator for a real CSV export or an API is a configuration change, not a rewrite.
 */
export interface DataSource {
  readonly kind: 'synthetic' | 'csv';
  readonly label: string;
  load(signal?: AbortSignal): Promise<Dataset>;
}

export class SyntheticDataSource implements DataSource {
  readonly kind = 'synthetic' as const;
  readonly label = 'Gerador sintético determinístico';
  constructor(private readonly seed?: number) {}
  async load(): Promise<Dataset> {
    // Yield once so the loading screen can paint before the CPU-bound work.
    await new Promise((r) => setTimeout(r, 0));
    return generateSyntheticDataset(this.seed);
  }
}

/**
 * Loads a fact table in the same shape as FactRow (header names = field names).
 * Dimension tables (hubs, segments…) come from reference.ts; unknown ids are rejected.
 */
export class CsvDataSource implements DataSource {
  readonly kind = 'csv' as const;
  constructor(private readonly url: string, readonly label = 'Arquivo CSV') {}

  async load(signal?: AbortSignal): Promise<Dataset> {
    const res = await fetch(this.url, { signal });
    if (!res.ok) throw new Error(`Falha ao carregar ${this.url}: HTTP ${res.status}`);
    const rows = parseCsv(await res.text());
    const hubRegion = new Map(HUBS.map((h) => [h.id, h.region]));
    const months = [...new Set(rows.map((r) => r.month))].sort();
    const num = (v: string | undefined, field: string, line: number) => {
      const n = Number(v);
      if (v === undefined || v === '' || Number.isNaN(n)) throw new Error(`Linha ${line}: campo numérico inválido "${field}"`);
      return n;
    };
    const facts: FactRow[] = rows.map((r, i) => {
      const region = hubRegion.get(r.hubId);
      if (!region) throw new Error(`Linha ${i + 2}: hub desconhecido "${r.hubId}"`);
      return {
        id: `${r.month}|${r.hubId}|${r.segmentId}|${r.serviceId}`,
        month: r.month,
        monthIndex: months.indexOf(r.month),
        hubId: r.hubId,
        regionId: region as RegionId,
        segmentId: r.segmentId,
        serviceId: r.serviceId,
        shipments: num(r.shipments, 'shipments', i + 2),
        delivered: num(r.delivered, 'delivered', i + 2),
        onTime: num(r.onTime, 'onTime', i + 2),
        revenue: num(r.revenue, 'revenue', i + 2),
        cost: num(r.cost, 'cost', i + 2),
        transitDaysSum: num(r.transitDaysSum, 'transitDaysSum', i + 2),
        claims: num(r.claims, 'claims', i + 2),
        returns: num(r.returns, 'returns', i + 2),
        weightKg: r.weightKg === '' || r.weightKg === undefined ? null : Number(r.weightKg),
      };
    });
    return {
      meta: {
        name: this.label,
        source: 'csv',
        synthetic: false,
        generatedAt: new Date().toISOString(),
        asOf: months[months.length - 1],
        description: `Carregado de ${this.url}.`,
      },
      regions: REGIONS,
      hubs: HUBS,
      segments: SEGMENTS,
      services: SERVICES,
      months,
      facts,
      lanes: buildLanes(facts, months.length),
    };
  }
}

export function createDataSource(): DataSource {
  const url = import.meta.env.VITE_DATA_URL as string | undefined;
  return url ? new CsvDataSource(url) : new SyntheticDataSource();
}
