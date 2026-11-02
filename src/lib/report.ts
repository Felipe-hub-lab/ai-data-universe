import type { Filters } from '../analytics/aggregate';
import type { Overview } from '../analytics/insights';
import { compare, METRICS, type MetricId } from '../analytics/metrics';
import type { Dataset } from '../data/schema';
import { FACT_COLUMNS } from '../data/dictionary';
import { toCsv } from './csv';
import { fmtMonth, fmtRange } from './format';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function describeFilters(ds: Dataset, f: Filters): string[] {
  const name = (list: { id: string; name: string }[], ids: string[]) => ids.map((i) => list.find((x) => x.id === i)?.name ?? i).join(', ');
  return [
    `Período: ${fmtRange(ds.months, f.range)}`,
    `Regiões: ${f.regions.length ? name(ds.regions, f.regions) : 'todas'}`,
    `Segmentos: ${f.segments.length ? name(ds.segments, f.segments) : 'todos'}`,
    `Serviços: ${f.services.length ? name(ds.services, f.services) : 'todos'}`,
    `Hubs: ${f.hubs.length ? name(ds.hubs, f.hubs) : 'todos'}`,
  ];
}

/** CSV of the filtered fact rows, with the active filters recorded in the header. */
export function factsCsv(ds: Dataset, f: Filters, rows: Dataset['facts']): string {
  return toCsv(rows, FACT_COLUMNS.map((c) => c.field) as (keyof Dataset['facts'][number] & string)[], [
    'AI DATA UNIVERSE — exportação de dados filtrados',
    ds.meta.synthetic ? 'DEMONSTRATION DATA — FOR PORTFOLIO PURPOSES (dados sintéticos)' : ds.meta.name,
    ...describeFilters(ds, f),
    `Linhas: ${rows.length}`,
  ]);
}

/** Self-contained HTML summary report of the current analysis state. */
export function summaryReportHtml(ds: Dataset, f: Filters, o: Overview): string {
  const ids: MetricId[] = ['revenue', 'shipments', 'ticket', 'onTimeRate', 'margin', 'avgTransit', 'costPerShipment', 'claimsPer1k'];
  const kpis = ids
    .map((id) => {
      const c = o.previous ? compare(id, o.current[id], o.previous[id]) : null;
      return `<tr><td>${METRICS[id].name}</td><td class="r">${esc(METRICS[id].format(o.current[id]))}</td><td class="r">${o.previous ? esc(METRICS[id].format(o.previous[id])) : '—'}</td><td class="r ${c ? (c.sentiment > 0 ? 'g' : c.sentiment < 0 ? 'b' : '') : ''}">${c ? esc(c.label) : '—'}</td></tr>`;
    })
    .join('');
  const findings = o.findings
    .map((x) => `<li><b>${esc(x.title)}</b><br>${esc(x.fact)}${x.hypothesis ? `<br><i>Hipótese: ${esc(x.hypothesis)}</i>` : ''}<br><span class="m">Próximo passo: ${esc(x.action)}</span></li>`)
    .join('');
  const hubs = [...o.hubs]
    .sort((a, b) => b.metrics.revenue - a.metrics.revenue)
    .map((h) => `<tr><td>${esc(h.label)}</td><td class="r">${esc(METRICS.revenue.format(h.metrics.revenue))}</td><td class="r">${esc(METRICS.onTimeRate.format(h.metrics.onTimeRate))}</td><td class="r">${esc(METRICS.margin.format(h.metrics.margin))}</td></tr>`)
    .join('');
  const anomalies = o.anomalies
    .slice(0, 10)
    .map((a) => `<li>${esc(ds.hubs.find((h) => h.id === a.hubId)?.name ?? a.hubId)} · ${esc(METRICS[a.metric].name)} · ${fmtMonth(ds.months[a.monthIndex])}: ${esc(METRICS[a.metric].format(a.value))} vs ${esc(METRICS[a.metric].format(a.reference))} (${esc(a.scoreLabel)}, prioridade ${a.priority})</li>`)
    .join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório — AI Data Universe</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:860px;margin:32px auto;padding:0 16px;color:#111}h1{font-size:22px;margin:0}h2{font-size:16px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:4px}table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}.r{text-align:right;font-variant-numeric:tabular-nums}.g{color:#0a7a4c}.b{color:#b3123a}.m{color:#666}.demo{background:#fff4dc;border:1px solid #f0c36d;padding:8px 12px;border-radius:6px;font-size:12px}li{margin-bottom:8px}</style></head><body>
<h1>AI Data Universe — Relatório resumido</h1>
<p class="m">Gerado em ${new Date().toLocaleString('pt-BR')} · ${ds.meta.name}</p>
${ds.meta.synthetic ? '<p class="demo"><b>DEMONSTRATION DATA — FOR PORTFOLIO PURPOSES.</b> Dados sintéticos gerados deterministicamente; não representam uma empresa real.</p>' : ''}
<h2>Recorte</h2><ul>${describeFilters(ds, f).map((l) => `<li>${esc(l)}</li>`).join('')}<li>Comparação: ${o.previousRange ? esc(fmtRange(ds.months, o.previousRange)) : 'indisponível (sem período anterior equivalente)'}</li></ul>
<h2>Indicadores</h2><table><thead><tr><th>Indicador</th><th class="r">Atual</th><th class="r">Anterior</th><th class="r">Variação</th></tr></thead><tbody>${kpis}</tbody></table>
<p>Índice de saúde operacional: <b>${Number.isFinite(o.health.score) ? Math.round(o.health.score) : '—'}/100</b> (${o.health.band}).</p>
<h2>Principais descobertas</h2><ul>${findings || '<li>Nenhuma.</li>'}</ul>
<h2>Observações atípicas (top 10)</h2><ul>${anomalies || '<li>Nenhuma acima do limiar.</li>'}</ul>
<p class="m">Anomalias estatísticas indicam que a observação merece investigação; não são diagnóstico de causa.</p>
<h2>Hubs</h2><table><thead><tr><th>Hub</th><th class="r">Receita</th><th class="r">Pontualidade</th><th class="r">Margem</th></tr></thead><tbody>${hubs}</tbody></table>
</body></html>`;
}
