import type { Dataset } from '../data/schema';
import { applyFilters, derive, previousRange, sumRows, type Filters } from '../analytics/aggregate';
import { scanKeyAnomalies } from '../analytics/anomalies';
import { breakdown, contribution, DIM_LABEL, revenueBridge, type Dim } from '../analytics/breakdown';
import { buildOverview, summarize } from '../analytics/insights';
import { compare, METRIC_LIST, METRICS, type MetricId } from '../analytics/metrics';
import { pearson } from '../analytics/stats';
import { fmt2, fmtBRLCompact, fmtMonth, fmtPct, fmtRange } from '../lib/format';
import type { AnalysisRequest, AnalysisResult, IntentId } from './types';

/**
 * Deterministic analyst. Interprets a question with transparent keyword rules, runs the
 * matching analysis on the shared data model and returns a structured answer that keeps
 * observed facts, hypotheses and limitations apart. No language model is involved.
 */

export const INTENTS: Record<IntentId, { label: string; keywords: string[]; example: string }> = {
  drivers: {
    label: 'Decomposição da variação',
    keywords: ['contribu', 'explica', 'variação', 'variacao', 'driver', 'por que', 'porque', 'motivo', 'causou'],
    example: 'O que mais contribuiu para a variação da receita?',
  },
  deviation: {
    label: 'Desvio entre categorias',
    keywords: ['desvio', 'categoria', 'diverg', 'se afasta', 'deviation'],
    example: 'Quais categorias apresentam maior desvio de pontualidade?',
  },
  opportunities: {
    label: 'Mapa de oportunidades',
    keywords: ['oportunidade', 'opportunit', 'potencial', 'crescer', 'expandir'],
    example: 'Onde estão as principais oportunidades?',
  },
  atypical: {
    label: 'Comportamento atípico',
    keywords: ['atípic', 'atipic', 'anomal', 'outlier', 'fora do padrão', 'fora do padrao', 'estranho'],
    example: 'Quais grupos apresentam comportamento atípico?',
  },
  compare: {
    label: 'Comparação entre períodos',
    keywords: ['mudou', 'compar', 'entre os dois', 'diferença', 'diferenca', 'antes e depois'],
    example: 'O que mudou entre os dois períodos selecionados?',
  },
  investigate: {
    label: 'Fatores para investigação',
    keywords: ['investig', 'fator', 'merece', 'associad', 'relação', 'relacao', 'correla'],
    example: 'Quais fatores merecem investigação adicional?',
  },
  overview: {
    label: 'Resumo executivo',
    keywords: ['resumo', 'visão geral', 'visao geral', 'como está', 'como esta', 'panorama', 'summary'],
    example: 'Faça um resumo do desempenho no período.',
  },
};

const METRIC_WORDS: [string[], MetricId][] = [
  [['pontualidade', 'otd', 'no prazo', 'atraso'], 'onTimeRate'],
  [['margem'], 'margin'],
  [['lucro'], 'grossProfit'],
  [['ticket'], 'ticket'],
  [['custo'], 'costPerShipment'],
  [['prazo médio', 'prazo medio', 'tempo de entrega', 'transit'], 'avgTransit'],
  [['avaria', 'extravio', 'sinistro'], 'claimsPer1k'],
  [['devolu'], 'returnRate'],
  [['volume', 'envios', 'remessas'], 'shipments'],
  [['receita', 'faturamento'], 'revenue'],
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function classify(question: string): IntentId | null {
  const q = norm(question);
  let best: IntentId | null = null;
  let bestScore = 0;
  for (const [id, def] of Object.entries(INTENTS) as [IntentId, (typeof INTENTS)[IntentId]][]) {
    const score = def.keywords.filter((k) => q.includes(norm(k))).length;
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

export function detectMetric(question: string): MetricId | null {
  const q = norm(question);
  for (const [words, id] of METRIC_WORDS) if (words.some((w) => q.includes(norm(w)))) return id;
  return null;
}

/** Hubs, segments and regions mentioned by name narrow the filters for this question only. */
export function detectFocus(ds: Dataset, question: string): Partial<Filters> {
  const q = norm(question);
  const hubs = ds.hubs.filter((h) => q.includes(norm(h.name))).map((h) => h.id);
  const segments = ds.segments.filter((s) => q.includes(norm(s.name))).map((s) => s.id);
  const regions = ds.regions.filter((r) => q.includes(norm(r.name))).map((r) => r.id);
  return {
    ...(hubs.length ? { hubs } : {}),
    ...(segments.length ? { segments } : {}),
    ...(regions.length ? { regions } : {}),
  };
}

const CORRELATION_CAVEAT = 'Correlação entre hubs não implica causalidade; ambos os indicadores podem responder a um terceiro fator (porte, distância, mix).';

export function analyze(ds: Dataset, req: AnalysisRequest): AnalysisResult {
  const intent = classify(req.question);
  const metric = detectMetric(req.question) ?? req.metric;
  const filters: Filters = { ...req.filters, ...detectFocus(ds, req.question) };
  const base = {
    id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    question: req.question,
    engine: 'deterministic' as const,
    createdAt: Date.now(),
    period: fmtRange(ds.months, filters.range),
  };

  if (!intent) {
    return {
      ...base,
      intent: 'overview',
      intentLabel: 'Pergunta não reconhecida',
      insufficient: true,
      observed:
        'O motor determinístico não reconheceu o tipo de análise pedido. Ele responde a perguntas sobre variação, desvios, oportunidades, anomalias, comparação de períodos, fatores para investigação e resumo.',
      facts: [],
      evidence: [],
      criterion: 'Classificação por palavras-chave (ver lista de intenções suportadas).',
      interpretations: [],
      limitations: ['Sem um modelo de linguagem conectado, perguntas abertas fora dessas categorias não podem ser interpretadas.'],
      next: `Tente, por exemplo: "${INTENTS.drivers.example}"`,
      metricsUsed: [],
    };
  }

  const rows = applyFilters(ds.facts, filters);
  if (!rows.length) {
    return {
      ...base,
      intent,
      intentLabel: INTENTS[intent].label,
      insufficient: true,
      observed: 'Nenhum registro corresponde aos filtros desta pergunta.',
      facts: [],
      evidence: [],
      criterion: '—',
      interpretations: [],
      limitations: ['Amplie o período ou remova filtros.'],
      next: 'Redefinir os filtros globais.',
      metricsUsed: [],
    };
  }

  const handler = HANDLERS[intent];
  return { ...base, intent, intentLabel: INTENTS[intent].label, ...handler(ds, filters, metric, req.compareRange ?? null) };
}

type Body = Omit<AnalysisResult, 'id' | 'question' | 'engine' | 'createdAt' | 'period' | 'intent' | 'intentLabel'>;
type Handler = (ds: Dataset, f: Filters, metric: MetricId, compareRange: [number, number] | null) => Body;

const insufficientComparison = (f: Filters, ds: Dataset): Body => ({
  insufficient: true,
  observed: `Não há período anterior equivalente a ${fmtRange(ds.months, f.range)} no conjunto de dados, então não é possível medir variação.`,
  facts: [],
  evidence: [],
  criterion: 'Comparação com a janela de mesmo tamanho imediatamente anterior.',
  interpretations: [],
  limitations: [`O conjunto de dados começa em ${fmtMonth(ds.months[0])}.`],
  next: 'Selecione um período mais recente ou mais curto, ou defina um período de comparação explícito.',
  metricsUsed: [],
});

const HANDLERS: Record<IntentId, Handler> = {
  drivers(ds, f, metric, cmp) {
    const before = cmp ?? previousRange(f.range);
    if (!before) return insufficientComparison(f, ds);
    const def = METRICS[metric];
    const dims: Dim[] = ['segment', 'hub', 'service'];
    const results = dims.map((d) => contribution(ds, f, d, metric, before, f.range));
    // Primary dimension = where the single largest member explains the most of the change.
    const primary = [...results].sort((a, b) => Math.abs(b.rows[0]?.shareOfChange ?? 0) - Math.abs(a.rows[0]?.shareOfChange ?? 0))[0];
    const change = compare(metric, primary.totalAfter, primary.totalBefore);
    const unit = def.kind === 'volume' ? (v: number) => def.formatCompact(v) : def.kind === 'ratio' ? (v: number) => `${v >= 0 ? '+' : '−'}${fmt2(Math.abs(v) * 100)} p.p.` : (v: number) => `${v >= 0 ? '+' : '−'}${def.format(Math.abs(v))}`;
    const top = primary.rows[0];
    const facts = results.map((r) => {
      const t = r.rows[0];
      return `Por ${DIM_LABEL[r.dim].toLowerCase()}: ${t.label} responde por ${unit(t.contribution)} (${Number.isFinite(t.shareOfChange) ? fmtPct(t.shareOfChange, 0) : '—'} da variação).`;
    });
    const extra: string[] = [];
    if (metric === 'revenue') {
      const ta = sumRows(applyFilters(ds.facts, { ...f, range: before }));
      const tb = sumRows(applyFilters(ds.facts, f));
      const br = revenueBridge(ta, tb);
      extra.push(`Ponte de receita: efeito volume ${fmtBRLCompact(br.volumeEffect)}; efeito ticket (preço + mix) ${fmtBRLCompact(br.ticketEffect)}.`);
    }
    return {
      observed: `${def.name} passou de ${def.format(primary.totalBefore)} para ${def.format(primary.totalAfter)} (${change?.label ?? '—'}). O principal contribuinte foi ${top.label} (${DIM_LABEL[primary.dim].toLowerCase()}), com ${unit(top.contribution)}.`,
      facts: [...facts, ...extra],
      evidence: primary.rows.slice(0, 5).map((r) => ({ label: r.label, value: unit(r.contribution) })),
      criterion: `Decomposição aditiva exata: contribuição de i = num₁ᵢ/DEN₁ − num₀ᵢ/DEN₀; soma das contribuições = variação total. Comparação: ${fmtRange(ds.months, before)} → ${fmtRange(ds.months, f.range)}.`,
      interpretations: [
        `A concentração em ${top.label} sugere que a variação não é generalizada; vale verificar se ela vem de poucos clientes ou rotas.`,
        def.kind !== 'volume' ? 'Em métricas de razão, parte da contribuição vem de mudança de mix (peso do membro), não só do desempenho do membro.' : 'Parte da variação pode ser sazonal se os períodos comparados cobrirem meses diferentes do ano.',
      ],
      limitations: [
        'Contribuição descreve onde a variação ocorreu, não por que ocorreu.',
        'Os dados são agregados por mês × hub × segmento × serviço; não há detalhe por cliente.',
      ],
      next: `Filtrar ${top.label} e repetir a pergunta para decompor em uma segunda dimensão.`,
      metricsUsed: [metric],
      table: {
        title: `Contribuição por ${DIM_LABEL[primary.dim].toLowerCase()}`,
        columns: [DIM_LABEL[primary.dim], 'Antes', 'Depois', 'Contribuição', '% da variação'],
        rows: primary.rows.map((r) => [r.label, def.format(r.before), def.format(r.after), unit(r.contribution), Number.isFinite(r.shareOfChange) ? fmtPct(r.shareOfChange, 0) : '—']),
      },
    };
  },

  deviation(ds, f, metric) {
    const def = METRICS[metric];
    const net = derive(sumRows(applyFilters(ds.facts, f)))[metric];
    const dims: Dim[] = ['region', 'segment', 'service', 'hub'];
    const all = dims.flatMap((d) =>
      breakdown(ds, f, d).map((g) => ({ dim: d, g, dev: def.kind === 'ratio' ? g.metrics[metric] - net : g.metrics[metric] / net - 1 })),
    );
    const usable = def.kind === 'volume' ? [] : all.filter((x) => Number.isFinite(x.dev)).sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));
    if (!usable.length) {
      return {
        insufficient: true,
        observed: `${def.name} é uma métrica de volume: o "desvio" entre categorias refletiria apenas o tamanho de cada uma. Escolha uma métrica de taxa (pontualidade, margem, prazo, ticket, custo por envio).`,
        facts: [], evidence: [], criterion: 'Desvio só é calculado para métricas intensivas.', interpretations: [],
        limitations: ['Comparar volumes absolutos entre categorias de portes diferentes não indica desempenho.'],
        next: 'Repita a pergunta mencionando "pontualidade" ou "margem".', metricsUsed: [metric],
      };
    }
    const fmtDev = (d: number) => (def.kind === 'ratio' ? `${d >= 0 ? '+' : '−'}${fmt2(Math.abs(d) * 100)} p.p.` : `${d >= 0 ? '+' : '−'}${fmt2(Math.abs(d) * 100)}%`);
    const top = usable[0];
    return {
      observed: `${top.g.label} (${DIM_LABEL[top.dim].toLowerCase()}) tem o maior desvio de ${def.name.toLowerCase()} em relação ao recorte: ${def.format(top.g.metrics[metric])} contra ${def.format(net)} (${fmtDev(top.dev)}).`,
      facts: dims.map((d) => {
        const x = usable.find((u) => u.dim === d);
        return x ? `Maior desvio por ${DIM_LABEL[d].toLowerCase()}: ${x.g.label} (${fmtDev(x.dev)}).` : '';
      }).filter(Boolean),
      evidence: usable.slice(0, 6).map((x) => ({ label: `${x.g.label} · ${DIM_LABEL[x.dim]}`, value: fmtDev(x.dev) })),
      criterion: `Desvio = valor da categoria ${def.kind === 'ratio' ? '−' : '÷'} valor agregado do recorte${def.kind === 'ratio' ? ' (p.p.)' : ' − 1 (%)'}. Categorias de todas as dimensões ranqueadas pelo desvio absoluto.`,
      interpretations: [
        'Desvios por região e por serviço podem ser estruturais (distância, promessa de prazo) e não necessariamente ineficiência.',
        `Desvios de hubs pequenos são mais voláteis; confira o volume de ${top.g.label} antes de priorizar.`,
      ],
      limitations: ['As dimensões se sobrepõem (um hub pertence a uma região), então os desvios não são independentes.'],
      next: `Abrir ${top.g.label} no Business Intelligence e detalhar por nível de serviço.`,
      metricsUsed: [metric],
      table: {
        title: `Desvio de ${def.name.toLowerCase()} por categoria`,
        columns: ['Categoria', 'Dimensão', def.name, 'Desvio', 'Envios'],
        rows: usable.slice(0, 15).map((x) => [x.g.label, DIM_LABEL[x.dim], def.format(x.g.metrics[metric]), fmtDev(x.dev), METRICS.shipments.formatCompact(x.g.metrics.shipments)]),
      },
    };
  },

  opportunities(ds, f) {
    const pr = previousRange(f.range);
    const net = derive(sumRows(applyFilters(ds.facts, f)));
    const hubs = breakdown(ds, f, 'hub');
    const growthOf = (g: (typeof hubs)[number]) => (g.previous && g.previous.revenue > 0 ? g.metrics.revenue / g.previous.revenue - 1 : NaN);
    const netGrowth = pr ? net.revenue / derive(sumRows(applyFilters(ds.facts, { ...f, range: pr }))).revenue - 1 : NaN;
    const stars = hubs.filter((h) => h.metrics.margin > net.margin && growthOf(h) > netGrowth);
    // Service gap: revenue at risk = volume of late deliveries × ticket, versus network OTD.
    const gaps = hubs
      .map((h) => ({ h, gap: Math.max(0, net.onTimeRate - h.metrics.onTimeRate) * h.metrics.delivered }))
      .filter((x) => x.gap > 0)
      .sort((a, b) => b.gap - a.gap);
    const facts: string[] = [];
    if (pr) facts.push(`${stars.length} hub(s) combinam margem acima da rede (${fmtPct(net.margin)}) e crescimento de receita acima da rede (${compare('revenue', 1 + netGrowth, 1)?.label ?? '—'}): ${stars.map((s) => s.label).join(', ') || 'nenhum'}.`);
    else facts.push('Sem período anterior equivalente: o critério de crescimento foi omitido.');
    if (gaps[0]) facts.push(`Se ${gaps[0].h.label} igualasse a pontualidade da rede, ~${Math.round(gaps[0].gap).toLocaleString('pt-BR')} entregas adicionais teriam chegado no prazo no período.`);
    return {
      observed: stars.length
        ? `${stars[0].label} é o hub com melhor combinação de margem e crescimento; ${gaps[0]?.h.label ?? '—'} concentra o maior volume de entregas fora do prazo em relação à média da rede.`
        : `Nenhum hub combina margem e crescimento acima da rede no recorte. ${gaps[0] ? `${gaps[0].h.label} concentra a maior lacuna de pontualidade.` : ''}`,
      facts,
      evidence: [
        ...stars.slice(0, 3).map((s) => ({ label: `${s.label} · margem / crescimento`, value: `${fmtPct(s.metrics.margin)} / ${compare('revenue', s.metrics.revenue, s.previous!.revenue)?.label}` })),
        ...gaps.slice(0, 3).map((g) => ({ label: `${g.h.label} · entregas a recuperar`, value: Math.round(g.gap).toLocaleString('pt-BR') })),
      ],
      criterion: 'Quadrante margem × crescimento (ambos contra a rede) e lacuna de pontualidade = (OTD da rede − OTD do hub) × entregas do hub.',
      interpretations: [
        'Hubs no quadrante de margem e crescimento altos são candidatos a receber mais capacidade comercial.',
        'A lacuna de pontualidade é um teto teórico: parte dela pode ser explicada por distância e não ser recuperável.',
      ],
      limitations: ['Oportunidade aqui é uma leitura relativa à média; não considera custo de capturá-la nem restrições de capacidade.'],
      next: 'Explorar o quadrante na Data Galaxy (layout analítico: eixo X = pontualidade, eixo Y = margem).',
      metricsUsed: ['margin', 'revenue', 'onTimeRate'],
      table: {
        title: 'Hubs — margem, crescimento e lacuna de pontualidade',
        columns: ['Hub', 'Margem', 'Crescimento', 'OTD', 'Entregas a recuperar'],
        rows: hubs
          .sort((a, b) => b.metrics.revenue - a.metrics.revenue)
          .map((h) => [h.label, fmtPct(h.metrics.margin), Number.isFinite(growthOf(h)) ? compare('revenue', h.metrics.revenue, h.previous!.revenue)!.label : '—', fmtPct(h.metrics.onTimeRate), Math.round(Math.max(0, net.onTimeRate - h.metrics.onTimeRate) * h.metrics.delivered).toLocaleString('pt-BR')]),
      },
    };
  },

  atypical(ds, f) {
    const list = scanKeyAnomalies(ds, f);
    const hubName = (id: string) => ds.hubs.find((h) => h.id === id)?.name ?? id;
    if (!list.length) {
      return {
        observed: 'Nenhuma observação ultrapassou o limiar de 3,5σ (com efeito mínimo de 3% ou 0,5 p.p.) no recorte.',
        facts: [], evidence: [], criterion: 'Z-score contra os 12 meses anteriores, ajustado pelos demais hubs.',
        interpretations: [], limitations: ['Ausência de anomalia estatística não garante ausência de problema operacional.'],
        next: 'Reduzir o limiar no Anomaly Detector ou testar outro método.', metricsUsed: [],
      };
    }
    const byHub = new Map<string, number>();
    list.forEach((a) => byHub.set(a.hubId, (byHub.get(a.hubId) ?? 0) + 1));
    const repeated = [...byHub.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
    return {
      observed: `${list.length} observações atípicas em ${byHub.size} hub(s). A mais intensa: ${METRICS[list[0].metric].name} em ${hubName(list[0].hubId)} (${fmtMonth(ds.months[list[0].monthIndex])}, ${list[0].scoreLabel}).`,
      facts: [
        ...list.slice(0, 4).map((a) => `${hubName(a.hubId)} · ${METRICS[a.metric].name} · ${fmtMonth(ds.months[a.monthIndex])}: ${METRICS[a.metric].format(a.value)} vs ${METRICS[a.metric].format(a.reference)} esperados.`),
        ...(repeated.length ? [`Hubs com mais de uma ocorrência: ${repeated.map(([h, n]) => `${hubName(h)} (${n})`).join(', ')}.`] : []),
      ],
      evidence: list.slice(0, 6).map((a) => ({ label: `${hubName(a.hubId)} · ${METRICS[a.metric].name}`, value: a.scoreLabel })),
      criterion: 'Z-score de cada mês contra os 12 meses anteriores do próprio hub, após remover o comportamento dos demais hubs; |z| ≥ 3,5 e efeito ≥ 3% (ou 0,5 p.p.).',
      interpretations: [
        'Desvios isolados em um único mês costumam indicar eventos pontuais; desvios que persistem indicam mudança de patamar.',
        'Ocorrências simultâneas em métricas relacionadas (prazo e pontualidade) reforçam que o evento é real e não ruído.',
      ],
      limitations: ['Uma anomalia estatística não é evidência de fraude, erro ou falha operacional — apenas de que o valor foge do padrão histórico.'],
      next: `Abrir ${hubName(list[0].hubId)} no Anomaly Detector e comparar com outros métodos (IQR, ano contra ano).`,
      metricsUsed: [...new Set(list.map((a) => a.metric))],
      table: {
        title: 'Observações atípicas',
        columns: ['Hub', 'Métrica', 'Mês', 'Observado', 'Esperado', 'Desvio', 'Prioridade'],
        rows: list.map((a) => [hubName(a.hubId), METRICS[a.metric].name, fmtMonth(ds.months[a.monthIndex]), METRICS[a.metric].format(a.value), METRICS[a.metric].format(a.reference), a.scoreLabel, a.priority]),
      },
    };
  },

  compare(ds, f, _metric, cmp) {
    const before = cmp ?? previousRange(f.range);
    if (!before) return insufficientComparison(f, ds);
    const a = derive(sumRows(applyFilters(ds.facts, { ...f, range: before })));
    const b = derive(sumRows(applyFilters(ds.facts, f)));
    const ids: MetricId[] = ['revenue', 'shipments', 'ticket', 'margin', 'onTimeRate', 'avgTransit', 'costPerShipment', 'claimsPer1k'];
    const changes = ids.map((id) => ({ id, c: compare(id, b[id], a[id]) }));
    const better = changes.filter((x) => x.c && x.c.sentiment > 0);
    const worse = changes.filter((x) => x.c && x.c.sentiment < 0);
    const lenA = before[1] - before[0] + 1;
    const lenB = f.range[1] - f.range[0] + 1;
    const br = revenueBridge(a, b);
    return {
      observed: `Entre ${fmtRange(ds.months, before)} e ${fmtRange(ds.months, f.range)}, ${better.length} indicador(es) melhoraram e ${worse.length} pioraram. Receita: ${changes[0].c?.label ?? '—'}.`,
      facts: [
        ...changes.map((x) => `${METRICS[x.id].name}: ${METRICS[x.id].format(a[x.id])} → ${METRICS[x.id].format(b[x.id])} (${x.c?.label ?? '—'}).`),
        `Ponte de receita: volume ${fmtBRLCompact(br.volumeEffect)}, ticket ${fmtBRLCompact(br.ticketEffect)}.`,
      ],
      evidence: changes.map((x) => ({ label: METRICS[x.id].name, value: x.c?.label ?? '—' })),
      criterion: 'Cada indicador recalculado a partir das linhas de cada período; proporções comparadas em p.p., demais em %.',
      interpretations: [
        lenA !== lenB ? 'Os períodos têm durações diferentes: compare totais com cautela e prefira as taxas.' : 'Períodos de mesma duração: totais são diretamente comparáveis.',
        'Se os períodos cobrem meses diferentes do ano, parte da variação é sazonal (pico em nov/dez).',
      ],
      limitations: ['Comparação descritiva; não controla sazonalidade nem mudanças de mix automaticamente.'],
      next: 'Perguntar "o que mais contribuiu para a variação" para localizar onde a mudança aconteceu.',
      metricsUsed: ids,
      table: {
        title: 'Período A × Período B',
        columns: ['Indicador', fmtRange(ds.months, before), fmtRange(ds.months, f.range), 'Variação'],
        rows: changes.map((x) => [METRICS[x.id].name, METRICS[x.id].format(a[x.id]), METRICS[x.id].format(b[x.id]), x.c?.label ?? '—']),
      },
    };
  },

  investigate(ds, f) {
    const hubs = breakdown(ds, f, 'hub');
    if (hubs.length < 5) {
      return {
        insufficient: true,
        observed: `Apenas ${hubs.length} hub(s) no recorte: amostra insuficiente para medir associação entre indicadores.`,
        facts: [], evidence: [], criterion: 'Correlação de Pearson entre hubs exige ao menos 5 observações.', interpretations: [],
        limitations: ['Remova o filtro de hub/região para ampliar a amostra.'], next: 'Ampliar o recorte.', metricsUsed: [],
      };
    }
    const ids: MetricId[] = ['onTimeRate', 'avgTransit', 'margin', 'costPerShipment', 'ticket', 'claimsPer1k', 'returnRate'];
    const pairs: { a: MetricId; b: MetricId; r: number }[] = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        pairs.push({ a: ids[i], b: ids[j], r: pearson(hubs.map((h) => h.metrics[ids[i]]), hubs.map((h) => h.metrics[ids[j]])) });
    const strong = pairs.filter((p) => Number.isFinite(p.r)).sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
    const anomalies = scanKeyAnomalies(ds, f).slice(0, 3);
    const hubName = (id: string) => ds.hubs.find((h) => h.id === id)?.name ?? id;
    const fr = (r: number) => r.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    return {
      observed: `A associação mais forte entre hubs é entre ${METRICS[strong[0].a].name.toLowerCase()} e ${METRICS[strong[0].b].name.toLowerCase()} (r = ${fr(strong[0].r)}, n = ${hubs.length}).`,
      facts: [
        ...strong.slice(0, 3).map((p) => `${METRICS[p.a].name} × ${METRICS[p.b].name}: r = ${fr(p.r)}.`),
        ...anomalies.map((a) => `Observação atípica: ${hubName(a.hubId)} · ${METRICS[a.metric].name} (${a.scoreLabel}).`),
      ],
      evidence: strong.slice(0, 5).map((p) => ({ label: `${METRICS[p.a].name} × ${METRICS[p.b].name}`, value: `r = ${fr(p.r)}` })),
      criterion: `Correlação de Pearson entre os ${hubs.length} hubs do recorte, para cada par de indicadores intensivos; anomalias pelo z-score padrão.`,
      interpretations: [
        'Pares com |r| alto são hipóteses a testar, não relações causais.',
        'Associação entre prazo e pontualidade é parcialmente mecânica (ambos medem tempo de entrega).',
      ],
      limitations: [CORRELATION_CAVEAT, `n = ${hubs.length} é uma amostra pequena; um único hub atípico pode dominar o coeficiente.`],
      next: 'Validar o par mais forte na Data Galaxy (layout analítico) e verificar se o padrão se mantém por segmento.',
      metricsUsed: ids,
      table: {
        title: 'Matriz de correlação (pares ordenados por |r|)',
        columns: ['Indicador A', 'Indicador B', 'r de Pearson', 'Leitura'],
        rows: strong.map((p) => [METRICS[p.a].name, METRICS[p.b].name, fr(p.r), Math.abs(p.r) >= 0.7 ? 'forte' : Math.abs(p.r) >= 0.4 ? 'moderada' : 'fraca']),
      },
    };
  },

  overview(ds, f) {
    const o = buildOverview(ds, f);
    const lines = summarize(ds, f, o);
    return {
      observed: lines[0],
      facts: lines.slice(1),
      evidence: [
        { label: 'Receita', value: METRICS.revenue.formatCompact(o.current.revenue) },
        { label: 'Envios', value: METRICS.shipments.formatCompact(o.current.shipments) },
        { label: 'Pontualidade', value: fmtPct(o.current.onTimeRate) },
        { label: 'Margem', value: fmtPct(o.current.margin) },
        { label: 'Índice de saúde', value: Number.isFinite(o.health.score) ? `${Math.round(o.health.score)}/100` : '—' },
      ],
      criterion: 'Agregação das linhas filtradas; achados gerados por regras documentadas (docs/METRICS.md).',
      interpretations: o.findings.filter((x) => x.hypothesis).slice(0, 2).map((x) => x.hypothesis!),
      limitations: o.previous ? [] : ['Sem período anterior equivalente: variações não foram calculadas.'],
      next: o.findings[0]?.action ?? 'Explorar a Data Galaxy.',
      metricsUsed: ['revenue', 'shipments', 'onTimeRate', 'margin'],
    };
  },
};

export const SUPPORTED_METRICS = METRIC_LIST.map((m) => m.id);
