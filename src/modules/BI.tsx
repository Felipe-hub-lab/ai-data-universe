import { useMemo, useState } from 'react';
import type { Filters } from '../analytics/aggregate';
import { applyFilters, derive, groupTotals } from '../analytics/aggregate';
import { breakdown, DIM_LABEL, type Dim } from '../analytics/breakdown';
import { computeEntities } from '../analytics/entities';
import { compare, METRIC_LIST, METRICS, type MetricId } from '../analytics/metrics';
import { histogram } from '../analytics/stats';
import { BarList, Histogram, ShareBar } from '../charts/Bars';
import { Heatmap } from '../charts/Heatmap';
import { LineChart } from '../charts/LineChart';
import { Icon } from '../components/Icon';
import { KpiInstrument } from '../components/Kpi';
import { NoResults } from '../components/States';
import { downloadText, toCsv } from '../lib/csv';
import { fmtMonth, fmtRange } from '../lib/format';
import { factsCsv, summaryReportHtml } from '../lib/report';
import { useFilteredRows, useMonthly, useOverview } from '../state/derived';
import { useDataset, useStore } from '../state/store';
import { REGION_COLORS, sequentialColor } from '../styles/tokens';

const LEVELS: Dim[] = ['region', 'hub', 'segment', 'service'];
const TABLE_METRICS: MetricId[] = ['revenue', 'shipments', 'ticket', 'onTimeRate', 'margin', 'avgTransit', 'claimsPer1k'];
const SEG_COLORS = ['#00E5FF', '#356BFF', '#9B5CFF', '#5c7290', '#3a4458'];

export default function BI() {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const metric = useStore((s) => s.focusMetric);
  const setMetric = useStore((s) => s.setFocusMetric);
  const openKpi = useStore((s) => s.openKpi);
  const toast = useStore((s) => s.toast);
  const o = useOverview();
  const monthly = useMonthly();
  const rows = useFilteredRows();
  const def = METRICS[metric];

  const [path, setPath] = useState<{ dim: Dim; key: string; label: string }[]>([]);
  const [sort, setSort] = useState<{ col: MetricId | 'label'; dir: 1 | -1 }>({ col: 'revenue', dir: -1 });

  const bySeg = useMemo(() => breakdown(ds, filters, 'segment'), [ds, filters]);
  const bySvc = useMemo(() => breakdown(ds, filters, 'service'), [ds, filters]);
  const byReg = useMemo(() => breakdown(ds, filters, 'region'), [ds, filters]);
  const entities = useMemo(() => computeEntities(ds, filters, []), [ds, filters]);

  // ---- drill-down table -------------------------------------------------------------------
  const level = LEVELS[Math.min(path.length, LEVELS.length - 1)];
  const drillFilters: Filters = useMemo(() => {
    const f = { ...filters };
    for (const p of path) {
      if (p.dim === 'region') f.regions = [p.key as Filters['regions'][number]];
      if (p.dim === 'hub') f.hubs = [p.key];
      if (p.dim === 'segment') f.segments = [p.key];
      if (p.dim === 'service') f.services = [p.key];
    }
    return f;
  }, [filters, path]);
  const table = useMemo(() => {
    const g = breakdown(ds, drillFilters, level);
    const k = sort.col;
    return g.sort((a, b) => (k === 'label' ? a.label.localeCompare(b.label) * sort.dir : (a.metrics[k] - b.metrics[k]) * sort.dir));
  }, [ds, drillFilters, level, sort]);

  // ---- region × month heatmap -------------------------------------------------------------
  const heat = useMemo(() => {
    const r = applyFilters(ds.facts, { ...filters, range: [0, ds.months.length - 1] });
    const g = groupTotals(r, (x) => `${x.regionId}|${x.monthIndex}`);
    const vals = ds.regions.map((reg) => ds.months.map((_, mi) => {
      const t = g.get(`${reg.id}|${mi}`);
      return t ? derive(t)[metric] : NaN;
    }));
    const flat = vals.flat().filter(Number.isFinite);
    return { vals, lo: Math.min(...flat), hi: Math.max(...flat) };
  }, [ds, filters, metric]);

  if (o.empty) return <div className="page"><NoResults /></div>;

  const yearAgo = monthly.map((_, i) => (i >= 12 ? monthly[i - 12][metric] : NaN));
  const toggle = <K extends 'segments' | 'services' | 'hubs' | 'regions'>(key: K, id: string) => {
    const cur = filters[key] as string[];
    setFilters({ [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } as Partial<Filters>);
  };
  const note = (g: { metrics: Record<MetricId, number>; previous: Record<MetricId, number> | null }) => {
    const c = g.previous ? compare(metric, g.metrics[metric], g.previous[metric]) : null;
    return c ? { text: c.label, sentiment: c.sentiment } : undefined;
  };
  const sortedBy = (gs: typeof bySeg) => [...gs].sort((a, b) => (def.higherIsBetter ? b.metrics[metric] - a.metrics[metric] : a.metrics[metric] - b.metrics[metric]));

  const exportFacts = () => {
    const ok = downloadText(`dados-filtrados-${ds.months[filters.range[0]]}_${ds.months[filters.range[1]]}.csv`, factsCsv(ds, filters, rows));
    toast(ok ? `${rows.length.toLocaleString('pt-BR')} linhas exportadas (${fmtRange(ds.months, filters.range)})` : 'O navegador bloqueou o download', ok ? 'ok' : 'error');
  };
  const exportTable = () => {
    const data = table.map((g) => ({ [DIM_LABEL[level]]: g.label, ...Object.fromEntries(TABLE_METRICS.map((m) => [METRICS[m].name, Number(g.metrics[m].toFixed(4))])) }));
    const cols = [DIM_LABEL[level], ...TABLE_METRICS.map((m) => METRICS[m].name)];
    const ok = downloadText(`tabela-${level}.csv`, toCsv(data as Record<string, unknown>[], cols as never[], [`Período: ${fmtRange(ds.months, filters.range)}`, `Caminho: ${path.map((p) => p.label).join(' › ') || 'raiz'}`, 'Dados sintéticos — demonstração']));
    toast(ok ? 'Tabela exportada' : 'O navegador bloqueou o download', ok ? 'ok' : 'error');
  };
  const exportReport = () => {
    const ok = downloadText(`relatorio-${ds.months[filters.range[1]]}.html`, summaryReportHtml(ds, filters, o), 'text/html;charset=utf-8');
    toast(ok ? 'Relatório resumido gerado' : 'O navegador bloqueou o download', ok ? 'ok' : 'error');
  };

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__title">
          <span className="meta">06 · Business Intelligence · {fmtRange(ds.months, filters.range)}</span>
          <h1 className="h1">Painel analítico</h1>
        </div>
        <div className="page__actions">
          <label className="row" style={{ gap: 6 }}>
            <span className="meta">Métrica em foco</span>
            <select className="select" value={metric} onChange={(e) => setMetric(e.target.value as MetricId)}>
              {METRIC_LIST.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <button className="btn btn--sm" onClick={exportFacts}><Icon name="download" size={13} /> Dados filtrados (CSV)</button>
          <button className="btn btn--sm" onClick={exportReport}><Icon name="download" size={13} /> Relatório resumido</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 16 }}>
        {(['revenue', 'shipments', 'ticket', 'onTimeRate', 'margin', 'avgTransit'] as MetricId[]).map((id) => (
          <KpiInstrument key={id} id={id} current={o.current} previous={o.previous} onOpen={openKpi} active={id === metric} />
        ))}
      </div>

      <section className="grid" style={{ gridTemplateColumns: 'minmax(0, 8fr) minmax(0, 4fr)' }} data-cc-hero>
        <div className="panel">
          <div className="panel__head">
            <span className="meta">Série histórica · {def.name}</span>
            <span className="row" style={{ gap: 12, fontSize: 11 }}>
              <span className="row" style={{ gap: 6 }}><span className="swatch" style={{ background: 'var(--cyan)' }} /> mensal</span>
              <span className="row" style={{ gap: 6 }}><span className="swatch" style={{ height: 0, borderTop: '2px dashed var(--muted)' }} /> mesmo mês, ano anterior</span>
            </span>
          </div>
          <LineChart
            ariaLabel={`Série mensal de ${def.name}`}
            series={[
              { id: 'cur', label: def.name, color: 'var(--cyan)', values: monthly.map((m) => m[metric]), area: true },
              { id: 'yoy', label: 'Ano anterior', color: 'var(--muted)', values: yearAgo, dashed: true },
            ]}
            xLabels={ds.months.map(fmtMonth)}
            format={def.formatCompact}
            highlight={filters.range}
            onSelectIndex={(i) => setFilters({ range: [i, i] })}
            height={240}
          />
          <div className="muted" style={{ fontSize: 11.5 }}>Clique em um mês para focar o período global nele.</div>
        </div>
        <div className="panel">
          <div className="panel__head"><span className="meta">Participação na receita</span></div>
          <div className="stack" style={{ gap: 18 }}>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Por região</div>
              <ShareBar ariaLabel="Receita por região" parts={byReg.sort((a, b) => b.metrics.revenue - a.metrics.revenue).map((g) => ({ key: g.key, label: g.label, value: g.metrics.revenue, display: METRICS.revenue.formatCompact(g.metrics.revenue), color: REGION_COLORS[g.key as keyof typeof REGION_COLORS] }))} />
            </div>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Por segmento</div>
              <ShareBar ariaLabel="Receita por segmento" parts={ds.segments.map((s, i) => ({ s, i })).filter(({ s }) => bySeg.some((g) => g.key === s.id)).map(({ s, i }) => { const g = bySeg.find((x) => x.key === s.id)!; return { key: s.id, label: s.name, value: g.metrics.revenue, display: METRICS.revenue.formatCompact(g.metrics.revenue), color: SEG_COLORS[i] }; })} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid--3" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel__head"><span className="meta">Ranking de hubs · {def.name}</span><span className="mono muted" style={{ fontSize: 10.5 }}>clique = filtro</span></div>
          <BarList ariaLabel="Ranking de hubs" items={sortedBy(o.hubs).map((g) => ({ key: g.key, label: g.label, value: g.metrics[metric], display: def.formatCompact(g.metrics[metric]), note: note(g) }))} selected={filters.hubs} onSelect={(k) => toggle('hubs', k)} />
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel__head"><span className="meta">Segmentos · {def.name}</span></div>
            <BarList ariaLabel="Comparação entre segmentos" items={sortedBy(bySeg).map((g) => ({ key: g.key, label: g.label, value: g.metrics[metric], display: def.formatCompact(g.metrics[metric]), note: note(g) }))} selected={filters.segments} onSelect={(k) => toggle('segments', k)} />
          </div>
          <div className="panel">
            <div className="panel__head"><span className="meta">Serviços · {def.name}</span></div>
            <BarList ariaLabel="Comparação entre serviços" items={sortedBy(bySvc).map((g) => ({ key: g.key, label: g.label, value: g.metrics[metric], display: def.formatCompact(g.metrics[metric]), note: note(g) }))} selected={filters.services} onSelect={(k) => toggle('services', k)} />
          </div>
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel__head"><span className="meta">Distribuição · hub × segmento</span></div>
            <Histogram ariaLabel={`Distribuição de ${def.name}`} bins={histogram(entities.map((e) => e.m[metric]), 14)} formatX={def.formatCompact} marker={{ value: o.current[metric], label: 'rede' }} />
            <div className="muted" style={{ fontSize: 11.5 }}>{entities.length} combinações; linha = valor agregado da rede.</div>
          </div>
          <div className="panel">
            <div className="panel__head"><span className="meta">Região × mês</span></div>
            <Heatmap
              ariaLabel="Mapa de calor por região e mês"
              rows={ds.regions.map((r) => ({ key: r.id, label: r.name }))}
              cols={ds.months.map(fmtMonth)}
              values={heat.vals}
              color={(v) => sequentialColor((v - heat.lo) / (heat.hi - heat.lo || 1))}
              format={def.format}
              highlightCols={filters.range}
              onSelectRow={(k) => toggle('regions', k)}
            />
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel__head" style={{ flexWrap: 'wrap' }}>
          <nav className="row wrap" style={{ gap: 6 }} aria-label="Caminho do drill-down">
            <button className="chip" aria-pressed={path.length === 0} onClick={() => setPath([])}>Rede</button>
            {path.map((p, i) => (
              <span key={p.key} className="row" style={{ gap: 6 }}>
                <span className="muted">›</span>
                <button className="chip" aria-pressed={i === path.length - 1} onClick={() => setPath(path.slice(0, i + 1))}>{p.label}</button>
              </span>
            ))}
            <span className="muted">›</span>
            <span className="meta">{DIM_LABEL[level]}</span>
          </nav>
          <button className="btn btn--sm" onClick={exportTable}><Icon name="download" size={13} /> Tabela (CSV)</button>
        </div>
        <div className="table-wrap" style={{ maxHeight: 460 }}>
          <table className="table">
            <thead>
              <tr>
                <th aria-sort={sort.col === 'label' ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                  <button onClick={() => setSort({ col: 'label', dir: sort.col === 'label' ? (-sort.dir as 1 | -1) : 1 })}>{DIM_LABEL[level]} {sort.col === 'label' ? (sort.dir > 0 ? '↑' : '↓') : ''}</button>
                </th>
                {TABLE_METRICS.map((m) => (
                  <th key={m} className="r" aria-sort={sort.col === m ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                    <button onClick={() => setSort({ col: m, dir: sort.col === m ? (-sort.dir as 1 | -1) : -1 })}>{METRICS[m].name} {sort.col === m ? (sort.dir > 0 ? '↑' : '↓') : ''}</button>
                  </th>
                ))}
                <th className="r">Δ receita</th>
              </tr>
            </thead>
            <tbody>
              {table.map((g) => {
                const canDrill = path.length < LEVELS.length - 1;
                const c = g.previous ? compare('revenue', g.metrics.revenue, g.previous.revenue) : null;
                return (
                  <tr
                    key={g.key}
                    data-clickable={canDrill}
                    tabIndex={canDrill ? 0 : undefined}
                    onClick={() => canDrill && setPath([...path, { dim: level, key: g.key, label: g.label }])}
                    onKeyDown={(e) => e.key === 'Enter' && canDrill && setPath([...path, { dim: level, key: g.key, label: g.label }])}
                    title={canDrill ? `Detalhar por ${DIM_LABEL[LEVELS[path.length + 1]].toLowerCase()}` : undefined}
                  >
                    <td>{g.label} {canDrill && <span className="muted">›</span>}</td>
                    {TABLE_METRICS.map((m) => <td key={m} className="r mono">{METRICS[m].formatCompact(g.metrics[m])}</td>)}
                    <td className="r">{c ? <span className="delta" data-s={c.sentiment}>{c.label}</span> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
