/**
 * Canonical data model. Every view in the app reads from a `Dataset` that matches
 * this schema, whatever its origin (synthetic generator, CSV file or API).
 *
 * Fact rows only carry ADDITIVE measures (counts and sums). Ratios such as on-time
 * rate or margin are always derived at aggregation time (see analytics/aggregate.ts),
 * which keeps KPIs, charts and tables consistent at any level of detail.
 */

export type RegionId = 'N' | 'NE' | 'CO' | 'SE' | 'S';

export interface Region {
  id: RegionId;
  name: string;
}

export interface Hub {
  id: string;
  name: string;
  uf: string;
  region: RegionId;
  lat: number;
  lon: number;
}

export interface Segment {
  id: string;
  name: string;
}

export interface ServiceLevel {
  id: string;
  name: string;
  /** Contractual delivery promise, in calendar days. */
  slaDays: number;
}

/** One row = one month × hub × segment × service level. */
export interface FactRow {
  id: string;
  month: string; // YYYY-MM
  monthIndex: number; // 0-based position in Dataset.months
  hubId: string;
  regionId: RegionId;
  segmentId: string;
  serviceId: string;
  shipments: number;
  delivered: number;
  onTime: number;
  revenue: number; // BRL
  cost: number; // BRL
  transitDaysSum: number; // sum of door-to-door days over delivered shipments
  claims: number;
  returns: number;
  /** Total billed weight (kg). May be null: the demo dataset deliberately contains gaps. */
  weightKg: number | null;
}

/** Outbound volume routed from one hub to another in a month. */
export interface LaneRow {
  monthIndex: number;
  origin: string;
  destination: string;
  shipments: number;
}

export interface DatasetMeta {
  name: string;
  source: 'synthetic' | 'csv' | 'api';
  synthetic: boolean;
  seed?: number;
  generatedAt: string;
  /** Last month covered by the data (YYYY-MM). */
  asOf: string;
  description: string;
}

export interface Dataset {
  meta: DatasetMeta;
  regions: Region[];
  hubs: Hub[];
  segments: Segment[];
  services: ServiceLevel[];
  months: string[];
  facts: FactRow[];
  lanes: LaneRow[];
}

export const ADDITIVE_FIELDS = [
  'shipments',
  'delivered',
  'onTime',
  'revenue',
  'cost',
  'transitDaysSum',
  'claims',
  'returns',
] as const;

export type AdditiveField = (typeof ADDITIVE_FIELDS)[number];
