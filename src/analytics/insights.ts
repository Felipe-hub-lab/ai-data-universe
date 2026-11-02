import type { Dataset } from '../data/schema';
import { applyFilters, derive, previousRange, sumRows, type Filters, type Metrics } from './aggregate';
import { scanKeyAnomalies, type Anomaly } from './anomalies';
import { breakdown, contribution, type Group } from './breakdown';
import { healthIndex, type Health } from './health';
import { compare, METRICS } from './metrics';
import { fmtBRLCompact, fmtDelta, fmtPct, fmtRange } from '../lib/format';

/**
 * Rule-based finding generator shared by the Command Center, Executive mode, guided
 * tour and the analysis engine. Each finding carries its numeric evidence and keeps the
 * observed fact separate from any interpretation.
 */

export type FindingKind = 'opportunity' | 'risk' | 'trend' | 'alert';

export interface Finding {
  id: string;
  kind: FindingKind;
  title: string;
  fact: string;
  evidence: { label: string; value: string }[];
  hypothesis?: string;
  action: string;
  hubId?: string;
  segmentId?: string;
  severity: number;
}

export interface Overview {
  current: Metrics;
  previous: Metrics | null;
  previousRange: [number, number] | null;
  health: Health;
  hubs: Group[];
  segments: Group[];
  anomalies: Anomaly[];
  findings: Finding[];
  empty: boolean;
}

const growth = (g: Group) => (g.previous && g.previous.revenue > 0 ? g.metrics.revenue / g.previous.revenue - 1 : NaN);

export function buildOverview(ds: Dataset, filters: Filters): Overview {
  const rows = applyFilters(ds.facts, filters);
  const current = derive(sumRows(rows));
  const pr = previousRange(filters.range);
  const previous = pr ? derive(sumRows(applyFilters(ds.facts, { ...filters, range: pr }))) : null;
  const health = healthIndex(current, previous);
  const hubs = breakdown(ds, filters, 'hub');
  const segments = breakdown(ds, filters, 'segment');
  const anomalies = rows.length ? scanKeyAnomalies(ds, filters) : [];
  const findings = rows.length ? buildFindings(ds, filters, current, previous, pr, hubs, segments, anomalies) : [];
  return { current, previous, previousRange: pr, health, hubs, segments, anomalies, findings, empty: rows.length === 0 };
}

function buildFindings(
  ds: Dataset,
  filters: Filters,
  current: Metrics,
  previous: Metrics | null,
  pr: [number, number] | null,
  hubs: Group[],
  segments: Group[],
  anomalies: Anomaly[],
): Finding[] {
  const out: Finding[] = [];
  const period = fmtRange(ds.months, filters.range);
  const prevLabel = pr ? fmtRange(ds.months, pr) : '';
  const hubName = (id: string) => ds.hubs.find((h) => h.id === id)?.name ?? id;

  if (previous && pr) {
    const material = hubs.filter((h) => h.metrics.revenue / current.revenue >= 0.02 && Number.isFinite(growth(h)));
    const byGrowth = [...material].sort((a, b) => growth(b) - growth(a));
    const top = byGrowth[0];
    const netGrowth = current.revenue / previous.revenue - 1;
    if (top && growth(top) > netGrowth) {
      out.push({
        id: `growth-${top.key}`,
        kind: 'opportunity',
        title: `${top.label} lidera o crescimento de receita`,
        fact: `A receita de ${top.label} variou ${fmtDelta(growth(top))} em ${period} contra ${prevLabel}, acima da rede (${fmtDelta(netGrowth)}).`,
        evidence: [
          { label: 'Receita no período', value: fmtBRLCompact(top.metrics.revenue) },
          { label: 'Período anterior', value: fmtBRLCompact(top.previous!.revenue) },
          { label: 'Crescimento da rede', value: fmtDelta(netGrowth) },
        ],
        hypothesis: 'Pode refletir ganho de clientes, mudança de mix ou efeito de base fraca; os dados agregados não distinguem essas causas.',
        action: 'Verificar se o crescimento é concentrado em um segmento e se a capacidade do hub acompanha a demanda.',
        hubId: top.key,
        severity: 0.7,
      });
    }
    const bottom = byGrowth[byGrowth.length - 1];
    if (bottom && bottom !== top && growth(bottom) < Math.min(0, netGrowth)) {
      out.push({
        id: `decline-${bottom.key}`,
        kind: 'risk',
        title: `Receita de ${bottom.label} abaixo do período anterior`,
        fact: `${bottom.label} variou ${fmtDelta(growth(bottom))} em receita (${period} vs ${prevLabel}), enquanto a rede variou ${fmtDelta(netGrowth)}.`,
        evidence: [
          { label: 'Receita no período', value: fmtBRLCompact(bottom.metrics.revenue) },
          { label: 'Período anterior', value: fmtBRLCompact(bottom.previous!.revenue) },
        ],
        action: 'Abrir a série mensal do hub no Temporal Engine para ver se a queda é pontual ou persistente.',
        hubId: bottom.key,
        severity: 0.8,
      });
    }

    const contrib = contribution(ds, filters, 'segment', 'revenue', pr, filters.range);
    const lead = contrib.rows[0];
    if (lead && Number.isFinite(lead.shareOfChange)) {
      out.push({
        id: `contrib-${lead.key}`,
        kind: 'trend',
        title: `${lead.label} explica a maior parte da variação de receita`,
        fact: `${lead.label} contribuiu com ${fmtBRLCompact(lead.contribution)} de uma variação total de ${fmtBRLCompact(contrib.totalChange)} (${fmtPct(lead.shareOfChange, 0)}).`,
        evidence: contrib.rows.slice(0, 3).map((r) => ({ label: r.label, value: fmtBRLCompact(r.contribution) })),
        action: 'Usar o AI Analytics Lab para decompor a variação por hub dentro do segmento.',
        segmentId: lead.key,
        severity: 0.5,
      });
    }

    const costMovers = hubs
      .map((h) => ({ h, c: h.previous ? compare('costPerShipment', h.metrics.costPerShipment, h.previous.costPerShipment) : null }))
      .filter((x) => x.c && x.c.value > 0.05)
      .sort((a, b) => b.c!.value - a.c!.value);
    if (costMovers[0]) {
      const { h, c } = costMovers[0];
      out.push({
        id: `cost-${h.key}`,
        kind: 'risk',
        title: `Custo por envio em alta em ${h.label}`,
        fact: `O custo por envio de ${h.label} passou de ${METRICS.costPerShipment.format(h.previous!.costPerShipment)} para ${METRICS.costPerShipment.format(h.metrics.costPerShipment)} (${c!.label}).`,
        evidence: [
          { label: 'Margem atual', value: METRICS.margin.format(h.metrics.margin) },
          { label: 'Margem anterior', value: METRICS.margin.format(h.previous!.margin) },
        ],
        hypothesis: 'Mudança de mix para serviços mais caros elevaria o custo junto com o ticket; se o ticket ficou estável, a pressão é de custo unitário.',
        action: 'Comparar ticket médio e custo por envio do hub no módulo Business Intelligence.',
        hubId: h.key,
        severity: Math.min(1, c!.value * 4),
      });
    }
  }

  const otdTarget = 0.9;
  const lateHubs = hubs.filter((h) => h.metrics.onTimeRate < otdTarget).sort((a, b) => a.metrics.onTimeRate - b.metrics.onTimeRate);
  if (lateHubs[0]) {
    const h = lateHubs[0];
    out.push({
      id: `otd-${h.key}`,
      kind: 'risk',
      title: `${lateHubs.length} hub(s) abaixo de 90% de pontualidade`,
      fact: `${h.label} tem a menor pontualidade do recorte: ${fmtPct(h.metrics.onTimeRate)} (rede: ${fmtPct(current.onTimeRate)}).`,
      evidence: lateHubs.slice(0, 3).map((x) => ({ label: x.label, value: fmtPct(x.metrics.onTimeRate) })),
      hypothesis: 'Hubs mais distantes do eixo Sul-Sudeste tendem a ter prazos maiores; o dado não separa distância de eficiência operacional.',
      action: 'Comparar pontualidade por nível de serviço para separar efeito de mix de efeito operacional.',
      hubId: h.key,
      severity: Math.min(1, (otdTarget - h.metrics.onTimeRate) * 15),
    });
  }

  const growingSegments = segments.filter((s) => Number.isFinite(growth(s)) && growth(s) > 0);
  const bestSeg = [...growingSegments].sort((a, b) => b.metrics.margin - a.metrics.margin)[0];
  if (bestSeg) {
    out.push({
      id: `seg-${bestSeg.key}`,
      kind: 'opportunity',
      title: `${bestSeg.label}: margem alta e receita em crescimento`,
      fact: `${bestSeg.label} combina a maior margem entre os segmentos em crescimento (${fmtPct(bestSeg.metrics.margin)}) com variação de receita de ${fmtDelta(growth(bestSeg))}.`,
      evidence: [
        { label: 'Participação na receita', value: fmtPct(bestSeg.metrics.revenue / current.revenue) },
        { label: 'Margem da rede', value: fmtPct(current.margin) },
      ],
      action: 'Avaliar se há espaço para ampliar a participação do segmento sem pressionar a pontualidade.',
      segmentId: bestSeg.key,
      severity: 0.45,
    });
  }

  const high = anomalies.filter((a) => a.priority === 'alta');
  if (anomalies[0]) {
    const a = anomalies[0];
    const def = METRICS[a.metric];
    out.push({
      id: `anomaly-${a.id}`,
      kind: 'alert',
      title: `${anomalies.length} observações atípicas (${high.length} de prioridade alta)`,
      fact: `Maior desvio: ${def.name} em ${hubName(a.hubId)} — ${def.format(a.value)} contra ${def.format(a.reference)} esperados (${a.scoreLabel}).`,
      evidence: anomalies.slice(0, 3).map((x) => ({ label: `${hubName(x.hubId)} · ${METRICS[x.metric].name}`, value: x.scoreLabel })),
      hypothesis: 'Desvio estatístico, não diagnóstico: pode ser evento operacional, mudança de cadastro ou problema de dados.',
      action: 'Investigar no Anomaly Detector e confirmar com a área responsável antes de concluir qualquer causa.',
      hubId: a.hubId,
      severity: Math.min(1, a.severity / 3),
    });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

/** Deterministic narrative used where a text summary is useful. Never claims to be an LLM. */
export function summarize(ds: Dataset, filters: Filters, o: Overview): string[] {
  if (o.empty) return ['Nenhum registro corresponde aos filtros atuais.'];
  const period = fmtRange(ds.months, filters.range);
  const lines: string[] = [];
  const rev = METRICS.revenue.formatCompact(o.current.revenue);
  if (o.previous) {
    const c = compare('revenue', o.current.revenue, o.previous.revenue);
    lines.push(`Em ${period}, a receita somou ${rev} (${c?.label ?? '—'} contra o período anterior equivalente), com ${METRICS.shipments.formatCompact(o.current.shipments)} envios.`);
  } else {
    lines.push(`Em ${period}, a receita somou ${rev} com ${METRICS.shipments.formatCompact(o.current.shipments)} envios. Não há período anterior equivalente no conjunto de dados para comparação.`);
  }
  lines.push(
    `Índice de saúde operacional: ${Number.isFinite(o.health.score) ? Math.round(o.health.score) : '—'}/100 (${o.health.band}). Pontualidade em ${fmtPct(o.current.onTimeRate)} e margem bruta em ${fmtPct(o.current.margin)}.`,
  );
  const risk = o.findings.find((f) => f.kind === 'risk' || f.kind === 'alert');
  const opp = o.findings.find((f) => f.kind === 'opportunity');
  if (risk) lines.push(`Ponto de atenção: ${risk.fact}`);
  if (opp) lines.push(`Oportunidade: ${opp.fact}`);
  return lines;
}
