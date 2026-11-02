import type { Dataset } from '../data/schema';
import { buildHubSeries, detectAnomalies } from './anomalies';
import { breakdown, contribution } from './breakdown';
import type { Filters } from './aggregate';
import { fmtDelta, fmtPct, fmtPP, fmtRange } from '../lib/format';

/**
 * Analytical missions. Each answer is computed from the data with a fixed, stated
 * criterion, so completion can be validated objectively — no hard-coded answers.
 */

export interface Mission {
  id: string;
  title: string;
  brief: string;
  criterion: string;
  target: 'hub' | 'segment' | 'region';
  answer: string;
  answerLabel: string;
  evidence: string;
  hint: string;
}

export function missionWindow(ds: Dataset): { current: [number, number]; previous: [number, number] } {
  const n = ds.months.length;
  return { current: [n - 6, n - 1], previous: [n - 12, n - 7] };
}

export function buildMissions(ds: Dataset): Mission[] {
  const { current, previous } = missionWindow(ds);
  const all: Filters = { range: current, regions: [], segments: [], services: [], hubs: [] };
  const period = fmtRange(ds.months, current);
  const prevPeriod = fmtRange(ds.months, previous);
  const hubName = (id: string) => ds.hubs.find((h) => h.id === id)?.name ?? id;
  const missions: Mission[] = [];

  const hubs = breakdown(ds, all, 'hub');
  const growth = hubs
    .map((h) => ({ h, g: h.previous ? h.metrics.revenue / h.previous.revenue - 1 : NaN }))
    .filter((x) => Number.isFinite(x.g))
    .sort((a, b) => b.g - a.g);
  if (growth[0]) {
    missions.push({
      id: 'm-growth',
      title: 'Encontre o hub com maior crescimento de receita',
      brief: `Compare ${period} com ${prevPeriod}. Qual hub teve o maior crescimento percentual de receita?`,
      criterion: 'Receita do hub nos últimos 6 meses ÷ receita nos 6 meses anteriores − 1.',
      target: 'hub',
      answer: growth[0].h.key,
      answerLabel: growth[0].h.label,
      evidence: `${growth[0].h.label}: ${fmtDelta(growth[0].g)} (2º: ${growth[1]?.h.label} ${growth[1] ? fmtDelta(growth[1].g) : ''}).`,
      hint: 'Na Data Galaxy, use "Cor: crescimento" — os pontos mais claros cresceram mais.',
    });
  }

  const series = buildHubSeries(ds, all);
  const transit = detectAnomalies(series, ds.months, { metric: 'avgTransit', method: 'zscore', range: [0, ds.months.length - 1] });
  if (transit[0]) {
    missions.push({
      id: 'm-transit',
      title: 'Identifique o hub com o maior desvio de prazo',
      brief: 'Em todo o histórico, qual hub registrou o mês mais fora do padrão no prazo médio de entrega?',
      criterion: 'Maior |z| do prazo médio contra os 12 meses anteriores, ajustado pelos demais hubs.',
      target: 'hub',
      answer: transit[0].hubId,
      answerLabel: hubName(transit[0].hubId),
      evidence: `${hubName(transit[0].hubId)} em ${ds.months[transit[0].monthIndex]}: ${transit[0].scoreLabel}.`,
      hint: 'O Anomaly Detector lista desvios por métrica; escolha "Prazo médio".',
    });
  }

  const vol = detectAnomalies(series, ds.months, { metric: 'shipments', method: 'zscore', range: [0, ds.months.length - 1] })
    .filter((a) => a.direction === 'down');
  if (vol[0]) {
    missions.push({
      id: 'm-drop',
      title: 'Localize a maior queda pontual de volume',
      brief: 'Algum hub teve um mês de volume muito abaixo do esperado. Qual?',
      criterion: 'Menor z-score de envios (participação do hub na rede) contra os 12 meses anteriores.',
      target: 'hub',
      answer: vol[0].hubId,
      answerLabel: hubName(vol[0].hubId),
      evidence: `${hubName(vol[0].hubId)} em ${ds.months[vol[0].monthIndex]}: ${vol[0].scoreLabel}.`,
      hint: 'No Temporal Engine, reproduza a linha do tempo e observe as colunas que encolhem de repente.',
    });
  }

  const regions = breakdown(ds, all, 'region').sort((a, b) => a.metrics.onTimeRate - b.metrics.onTimeRate);
  if (regions[0]) {
    missions.push({
      id: 'm-otd-region',
      title: 'Descubra a região com menor pontualidade',
      brief: `Em ${period}, qual região entregou a menor proporção de envios no prazo?`,
      criterion: 'Σ entregas no prazo ÷ Σ entregas, por região.',
      target: 'region',
      answer: regions[0].key,
      answerLabel: regions[0].label,
      evidence: `${regions[0].label}: ${fmtPct(regions[0].metrics.onTimeRate)} (melhor: ${regions[regions.length - 1].label} ${fmtPct(regions[regions.length - 1].metrics.onTimeRate)}).`,
      hint: 'Selecione qualquer objeto da região na Galaxy — a resposta é validada pela região dele.',
    });
  }

  const contrib = contribution(ds, all, 'segment', 'revenue', previous, current);
  if (contrib.rows[0]) {
    missions.push({
      id: 'm-contrib',
      title: 'Descubra o principal fator da variação de receita',
      brief: `Qual segmento mais contribuiu para a variação da receita entre ${prevPeriod} e ${period}?`,
      criterion: 'Decomposição aditiva da variação de receita por segmento.',
      target: 'segment',
      answer: contrib.rows[0].key,
      answerLabel: contrib.rows[0].label,
      evidence: `${contrib.rows[0].label} respondeu por ${fmtPct(contrib.rows[0].shareOfChange, 0)} da variação.`,
      hint: 'Pergunte ao AI Analytics Lab: "o que mais contribuiu para a variação da receita?"',
    });
  }

  const margin = hubs
    .map((h) => ({ h, d: h.previous ? h.metrics.margin - h.previous.margin : NaN }))
    .filter((x) => Number.isFinite(x.d))
    .sort((a, b) => b.d - a.d);
  if (margin[0]) {
    missions.push({
      id: 'm-margin',
      title: 'Encontre o hub com maior ganho de margem',
      brief: `Qual hub mais aumentou sua margem bruta entre ${prevPeriod} e ${period}?`,
      criterion: 'Margem bruta atual − margem bruta anterior, em pontos percentuais.',
      target: 'hub',
      answer: margin[0].h.key,
      answerLabel: margin[0].h.label,
      evidence: `${margin[0].h.label}: ${fmtPP(margin[0].d)}.`,
      hint: 'Use o layout analítico da Galaxy (eixo Y = margem) e compare com o período anterior no Business Intelligence.',
    });
  }
  return missions;
}

export function checkMission(ds: Dataset, m: Mission, sel: { hubId?: string; segmentId?: string }): boolean | null {
  if (m.target === 'segment') return sel.segmentId ? sel.segmentId === m.answer : null;
  if (!sel.hubId) return null;
  if (m.target === 'hub') return sel.hubId === m.answer;
  return ds.hubs.find((h) => h.id === sel.hubId)?.region === m.answer;
}
