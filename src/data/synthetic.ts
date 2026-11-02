import { HUBS, REGIONS, SEGMENTS, SERVICES } from './reference';
import type { Dataset, FactRow, LaneRow, RegionId } from './schema';

/**
 * Deterministic generator for the demonstration dataset ("Helix Freight", a fictional
 * Brazilian parcel carrier). Same seed → byte-identical dataset, so every analysis in
 * the app is reproducible across reloads and machines.
 *
 * The generator also injects a small set of documented scenarios (see INJECTED_EVENTS)
 * so the anomaly detector and the analysis engine have known ground truth to find.
 */

export const DEFAULT_SEED = 42;
export const START_YEAR = 2024;
export const START_MONTH = 10; // October
export const MONTH_COUNT = 24;

/** Mulberry32 — tiny, fast, seedable PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildMonths(count = MONTH_COUNT, year = START_YEAR, month = START_MONTH): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const m0 = month - 1 + i;
    const y = year + Math.floor(m0 / 12);
    const m = (m0 % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

/** Relative hub size (≈ thousands of shipments / month across all segments). */
const HUB_SCALE: Record<string, number> = {
  SAO: 10, CPQ: 5, RIO: 7, BHZ: 5, VIX: 2, CWB: 4, JOI: 2, FLN: 2, POA: 4, BSB: 3,
  GYN: 2.5, CGR: 1.5, CGB: 1.5, SSA: 3, REC: 3, FOR: 2.5, NAT: 1.2, SLZ: 1.2, MAO: 1.8, BEL: 1.6,
};

/** Segment mix per region (shares sum to 1). */
const SEGMENT_MIX: Record<RegionId, Record<string, number>> = {
  SE: { ECOM: 0.42, RETAIL: 0.22, INDUSTRY: 0.2, HEALTH: 0.1, AGRO: 0.06 },
  S: { ECOM: 0.34, RETAIL: 0.22, INDUSTRY: 0.26, HEALTH: 0.08, AGRO: 0.1 },
  CO: { ECOM: 0.26, RETAIL: 0.2, INDUSTRY: 0.12, HEALTH: 0.08, AGRO: 0.34 },
  NE: { ECOM: 0.4, RETAIL: 0.28, INDUSTRY: 0.1, HEALTH: 0.12, AGRO: 0.1 },
  N: { ECOM: 0.36, RETAIL: 0.3, INDUSTRY: 0.16, HEALTH: 0.1, AGRO: 0.08 },
};

const SERVICE_MIX: Record<string, number> = { SAMEDAY: 0.08, EXPRESS: 0.27, STANDARD: 0.43, ECONOMY: 0.22 };
const SERVICE_TICKET: Record<string, number> = { SAMEDAY: 89, EXPRESS: 58, STANDARD: 34, ECONOMY: 22 };
const SERVICE_OTD: Record<string, number> = { SAMEDAY: 0.935, EXPRESS: 0.945, STANDARD: 0.925, ECONOMY: 0.9 };
const SEGMENT_TICKET: Record<string, number> = { ECOM: 0.85, RETAIL: 1, INDUSTRY: 1.6, HEALTH: 1.3, AGRO: 1.4 };
const SEGMENT_COST: Record<string, number> = { ECOM: 0.8, RETAIL: 0.76, INDUSTRY: 0.72, HEALTH: 0.7, AGRO: 0.78 };
const SEGMENT_CLAIMS: Record<string, number> = { ECOM: 0.0045, RETAIL: 0.0035, INDUSTRY: 0.006, HEALTH: 0.0025, AGRO: 0.005 };
const SEGMENT_RETURNS: Record<string, number> = { ECOM: 0.062, RETAIL: 0.031, INDUSTRY: 0.009, HEALTH: 0.012, AGRO: 0.008 };
const SEGMENT_KG: Record<string, number> = { ECOM: 1.8, RETAIL: 4.2, INDUSTRY: 18, HEALTH: 2.6, AGRO: 22 };
/** Monthly compound growth per segment. */
const SEGMENT_GROWTH: Record<string, number> = { ECOM: 0.018, RETAIL: 0.006, INDUSTRY: 0.002, HEALTH: 0.012, AGRO: 0.009 };
const REGION_DISTANCE: Record<RegionId, number> = { SE: 0.95, S: 1, CO: 1.1, NE: 1.15, N: 1.35 };
const REGION_COST: Record<RegionId, number> = { SE: 0, S: 0.01, CO: 0.03, NE: 0.04, N: 0.08 };
const REGION_OTD: Record<RegionId, number> = { SE: 0, S: -0.005, CO: -0.015, NE: -0.025, N: -0.05 };

/** Calendar seasonality (index 0 = January). November/December peak, Jan–Feb dip. */
const SEASONALITY = [0.9, 0.88, 0.97, 0.98, 1.0, 0.99, 1.0, 1.02, 1.0, 1.03, 1.3, 1.18];
const ECOM_EXTRA_PEAK = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.18, 0.08];
/** Agro harvest window (March–June). */
const AGRO_SEASON = [0.85, 0.92, 1.15, 1.22, 1.2, 1.1, 0.95, 0.9, 0.9, 0.92, 0.95, 0.9];

/**
 * Scenarios planted in the synthetic data. They exist ONLY to give the analytical
 * features something real to detect; they do not describe any real company.
 */
export const INJECTED_EVENTS = [
  { id: 'MAO-transit', hub: 'MAO', month: '2026-03', description: 'Prazo médio +45% e pontualidade −12 p.p. em um único mês.' },
  { id: 'CWB-claims', hub: 'CWB', month: '2026-06..2026-07', description: 'Taxa de avarias ×3 durante dois meses.' },
  { id: 'REC-growth', hub: 'REC', month: '2025-10→', description: 'Mudança de tendência: E-commerce cresce +4% a.m. adicionais.' },
  { id: 'POA-drop', hub: 'POA', month: '2026-05', description: 'Volume −35% em um único mês, com recuperação posterior.' },
  { id: 'GYN-margin', hub: 'GYN', month: '2026-01→', description: 'Agro: custo −6 p.p. sobre a receita (melhora de margem).' },
  { id: 'BEL-cost', hub: 'BEL', month: '2026-07→', description: 'Custo por envio +10% de forma persistente.' },
] as const;

export function generateSyntheticDataset(seed = DEFAULT_SEED): Dataset {
  const rand = mulberry32(seed);
  const noise = (spread: number) => 1 + (rand() * 2 - 1) * spread;
  const months = buildMonths();
  const idx = (m: string) => months.indexOf(m);
  const facts: FactRow[] = [];

  for (let mi = 0; mi < months.length; mi++) {
    const month = months[mi];
    const cal = (START_MONTH - 1 + mi) % 12;
    for (const hub of HUBS) {
      for (const seg of SEGMENTS) {
        for (const svc of SERVICES) {
          // ---- volume -------------------------------------------------------------
          let season = SEASONALITY[cal];
          if (seg.id === 'ECOM') season += ECOM_EXTRA_PEAK[cal];
          if (seg.id === 'AGRO') season = season * 0.4 + AGRO_SEASON[cal] * 0.6;
          let growth = Math.pow(1 + SEGMENT_GROWTH[seg.id], mi);
          if (hub.id === 'REC' && seg.id === 'ECOM' && mi >= idx('2025-10')) {
            growth *= Math.pow(1.04, mi - idx('2025-10') + 1);
          }
          let shipments =
            HUB_SCALE[hub.id] * 2400 * SEGMENT_MIX[hub.region][seg.id] * SERVICE_MIX[svc.id] * season * growth * noise(0.06);
          if (hub.id === 'POA' && month === '2026-05') shipments *= 0.65;
          shipments = Math.max(1, Math.round(shipments));

          // ---- delivery quality --------------------------------------------------
          let otd = SERVICE_OTD[svc.id] + REGION_OTD[hub.region] + (rand() * 2 - 1) * 0.012;
          if (cal === 10 || cal === 11) otd -= 0.03; // peak-season pressure
          let transitFactor = REGION_DISTANCE[hub.region] * noise(0.05);
          if (hub.id === 'MAO' && month === '2026-03') {
            otd -= 0.12;
            transitFactor *= 1.45;
          }
          otd = Math.min(0.995, Math.max(0.5, otd));
          const delivered = Math.round(shipments * (0.985 + rand() * 0.01));
          const onTime = Math.round(delivered * otd);
          const transitDaysSum = Math.round(delivered * (svc.slaDays * 0.82 + 0.35) * transitFactor * 100) / 100;

          // ---- money ---------------------------------------------------------------
          const ticket = SERVICE_TICKET[svc.id] * SEGMENT_TICKET[seg.id] * REGION_DISTANCE[hub.region] * noise(0.04);
          const revenue = Math.round(shipments * ticket * 100) / 100;
          let costRatio = SEGMENT_COST[seg.id] + REGION_COST[hub.region] + (rand() * 2 - 1) * 0.02;
          if (cal === 10 || cal === 11) costRatio += 0.015;
          if (hub.id === 'GYN' && seg.id === 'AGRO' && mi >= idx('2026-01')) costRatio -= 0.06;
          if (hub.id === 'BEL' && mi >= idx('2026-07')) costRatio *= 1.1;
          const cost = Math.round(revenue * costRatio * 100) / 100;

          // ---- claims, returns, weight --------------------------------------------
          let claimsRate = SEGMENT_CLAIMS[seg.id] * noise(0.25);
          if (hub.id === 'CWB' && (month === '2026-06' || month === '2026-07')) claimsRate *= 3;
          const claims = Math.round(shipments * claimsRate);
          const returns = Math.round(shipments * SEGMENT_RETURNS[seg.id] * noise(0.15));
          // ~0.6% of rows have no billed weight — a deliberate data-quality gap.
          const weightKg = rand() < 0.006 ? null : Math.round(shipments * SEGMENT_KG[seg.id] * noise(0.1));

          facts.push({
            id: `${month}|${hub.id}|${seg.id}|${svc.id}`,
            month,
            monthIndex: mi,
            hubId: hub.id,
            regionId: hub.region,
            segmentId: seg.id,
            serviceId: svc.id,
            shipments,
            delivered,
            onTime,
            revenue,
            cost,
            transitDaysSum,
            claims,
            returns,
            weightKg,
          });
        }
      }
    }
  }

  return {
    meta: {
      name: 'Helix Freight — demonstration dataset',
      source: 'synthetic',
      synthetic: true,
      seed,
      generatedAt: new Date().toISOString(),
      asOf: months[months.length - 1],
      description:
        'Dados sintéticos gerados de forma determinística no navegador (seed fixa). Empresa, volumes e valores são fictícios; apenas as coordenadas das cidades são reais.',
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

/**
 * Synthetic routing table: each hub ships a fixed share of its outbound volume to a
 * few destinations (always the São Paulo gateway plus its nearest hubs). Lane volume is
 * derived from fact rows, so lanes never contradict hub totals.
 */
export function buildLanes(facts: FactRow[], monthCount: number): LaneRow[] {
  const routes = laneRoutes();
  const outbound = new Map<string, number>();
  for (const f of facts) {
    const k = `${f.monthIndex}|${f.hubId}`;
    outbound.set(k, (outbound.get(k) ?? 0) + f.shipments);
  }
  const lanes: LaneRow[] = [];
  for (let mi = 0; mi < monthCount; mi++) {
    for (const r of routes) {
      const total = outbound.get(`${mi}|${r.origin}`) ?? 0;
      lanes.push({ monthIndex: mi, origin: r.origin, destination: r.destination, shipments: Math.round(total * r.share) });
    }
  }
  return lanes;
}

export function laneRoutes(): { origin: string; destination: string; share: number }[] {
  const out: { origin: string; destination: string; share: number }[] = [];
  const dist = (a: (typeof HUBS)[number], b: (typeof HUBS)[number]) => Math.hypot(a.lat - b.lat, a.lon - b.lon);
  for (const h of HUBS) {
    const nearest = HUBS.filter((o) => o.id !== h.id && o.id !== 'SAO')
      .sort((a, b) => dist(h, a) - dist(h, b))
      .slice(0, 2);
    if (h.id !== 'SAO') out.push({ origin: h.id, destination: 'SAO', share: 0.22 });
    nearest.forEach((n, i) => out.push({ origin: h.id, destination: n.id, share: i === 0 ? 0.12 : 0.07 }));
  }
  return out;
}
