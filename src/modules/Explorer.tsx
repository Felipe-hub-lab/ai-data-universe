import { useEffect, useMemo, useRef, useState } from 'react';
import { METRIC_LIST } from '../analytics/metrics';
import { finite, mean, quantile, std } from '../analytics/stats';
import { FACT_COLUMNS } from '../data/dictionary';
import type { FactRow } from '../data/schema';
import { Icon } from '../components/Icon';
import { downloadText, toCsv } from '../lib/csv';
import { fmt2, fmtInt, fmtMonth, fmtRange } from '../lib/format';
import { describeFilters } from '../lib/report';
import { useFilteredRows, useNames } from '../state/derived';
import { useDataset, useStore } from '../state/store';

const ROW_H = 32;
const PAGE = 1000;
type Col = keyof FactRow & string;
const NUMERIC: Col[] = ['shipments', 'delivered', 'onTime', 'revenue', 'cost', 'transitDaysSum', 'claims', 'returns', 'weightKg'];
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function Explorer() {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  const query = useStore((s) => s.explorerQuery);
  const setQuery = useStore((s) => s.setExplorerQuery);
  const toast = useStore((s) => s.toast);
  const names = useNames();
  const rows = useFilteredRows();
  const [cols, setCols] = useState<Col[]>(FACT_COLUMNS.map((c) => c.field as Col));
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [tab, setTab] = useState<'data' | 'quality' | 'dictionary'>('data');

  const searchable = useMemo(
    () => new Map(ds.facts.map((r) => [r.id, norm(`${r.id} ${names.hub(r.hubId)} ${names.region(r.regionId)} ${names.segment(r.segmentId)} ${names.service(r.serviceId)} ${fmtMonth(r.month)}`)])),
    [ds, names],
  );

  const view = useMemo(() => {
    const terms = norm(query).split(/\s+/).filter(Boolean);
    let out = terms.length ? rows.filter((r) => terms.every((t) => searchable.get(r.id)!.includes(t))) : rows;
    if (onlyMissing) out = out.filter((r) => NUMERIC.some((c) => r[c] === null || r[c] === undefined));
    if (sort) {
      const { col, dir } = sort;
      out = [...out].sort((a, b) => {
        const x = a[col];
        const y = b[col];
        if (x === null) return 1;
        if (y === null) return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
      });
    }
    return out;
  }, [rows, query, searchable, sort, onlyMissing]);

  useEffect(() => setPage(0), [view.length]);
  const pages = Math.max(1, Math.ceil(view.length / PAGE));
  const pageRows = view.slice(page * PAGE, (page + 1) * PAGE);

  // ---- quality & stats over the filtered rows (before text search) ------------------------
  const quality = useMemo(() => {
    const missing = FACT_COLUMNS.map((c) => ({ c, n: rows.filter((r) => (r as unknown as Record<string, unknown>)[c.field] === null || (r as unknown as Record<string, unknown>)[c.field] === undefined || (r as unknown as Record<string, unknown>)[c.field] === '').length }));
    const keys = new Map<string, number>();
    ds.facts.forEach((r) => keys.set(r.id, (keys.get(r.id) ?? 0) + 1));
    const dupes = [...keys.values()].filter((n) => n > 1).length;
    const stats = NUMERIC.map((c) => {
      const xs = finite(rows.map((r) => r[c] as number));
      return { c, n: xs.length, mean: mean(xs), std: std(xs), min: Math.min(...xs), p25: quantile(xs, 0.25), p50: quantile(xs, 0.5), p75: quantile(xs, 0.75), max: Math.max(...xs) };
    });
    const integrity = rows.filter((r) => r.onTime > r.delivered || r.delivered > r.shipments || r.cost < 0 || r.revenue < 0).length;
    return { missing, dupes, stats, integrity };
  }, [rows, ds]);

  const exportView = () => {
    const ok = downloadText(
      `explorer-${ds.months[filters.range[0]]}_${ds.months[filters.range[1]]}.csv`,
      toCsv(view, cols, ['AI DATA UNIVERSE — Data Explorer', ds.meta.synthetic ? 'DEMONSTRATION DATA — FOR PORTFOLIO PURPOSES' : ds.meta.name, ...describeFilters(ds, filters), `Busca: ${query || '—'}`, `Linhas: ${view.length}`]),
    );
    toast(ok ? `${view.length.toLocaleString('pt-BR')} linhas exportadas` : 'O navegador bloqueou o download', ok ? 'ok' : 'error');
  };

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__title">
          <span className="meta">07 · Data Explorer</span>
          <h1 className="h1">Dados de origem</h1>
        </div>
        <div className="seg" role="tablist" aria-label="Seções">
          <button role="tab" aria-selected={tab === 'data'} aria-pressed={tab === 'data'} onClick={() => setTab('data')}>Tabela</button>
          <button role="tab" aria-selected={tab === 'quality'} aria-pressed={tab === 'quality'} onClick={() => setTab('quality')}>Qualidade e estatísticas</button>
          <button role="tab" aria-selected={tab === 'dictionary'} aria-pressed={tab === 'dictionary'} onClick={() => setTab('dictionary')}>Metadados e dicionário</button>
        </div>
      </div>

      {ds.meta.synthetic && (
        <div className="panel" style={{ borderColor: 'rgba(255,181,71,.35)', marginBottom: 16, padding: '10px 14px' }}>
          <span className="demo-tag">DEMONSTRATION DATA — FOR PORTFOLIO PURPOSES</span>
          <span className="muted" style={{ marginLeft: 12, fontSize: 12.5 }}>{ds.meta.description}</span>
        </div>
      )}

      {tab === 'data' && (
        <section className="panel" style={{ padding: 0 }}>
          <div className="row wrap" style={{ gap: 10, padding: 14 }}>
            <div className="row grow" style={{ gap: 8, minWidth: 220 }}>
              <Icon name="search" />
              <input className="input" placeholder="Buscar por hub, região, segmento, serviço ou mês (ex.: manaus mar/26)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar registros" />
            </div>
            <ColumnPicker cols={cols} setCols={setCols} />
            <label className="row" style={{ gap: 6, fontSize: 12.5 }}>
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Só linhas com valores ausentes
            </label>
            <button className="btn btn--sm" onClick={exportView} disabled={!view.length}><Icon name="download" size={13} /> CSV</button>
          </div>
          <div className="row between" style={{ padding: '0 14px 10px', fontSize: 12 }}>
            <span className="mono muted">
              {view.length.toLocaleString('pt-BR')} linhas · {fmtRange(ds.months, filters.range)}
              {view.length > 0 ? ` · exibindo ${(page * PAGE + 1).toLocaleString('pt-BR')}–${Math.min(view.length, (page + 1) * PAGE).toLocaleString('pt-BR')}` : ''}
            </span>
            {pages > 1 && (
              <span className="row" style={{ gap: 6 }}>
                <button className="btn btn--sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
                <span className="mono" style={{ fontSize: 12 }}>{page + 1}/{pages}</span>
                <button className="btn btn--sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
              </span>
            )}
          </div>
          {view.length === 0 ? (
            <div className="state">Nenhuma linha corresponde à busca e aos filtros.</div>
          ) : (
            <VirtualTable rows={pageRows} cols={cols} sort={sort} setSort={setSort} />
          )}
        </section>
      )}

      {tab === 'quality' && (
        <section className="grid" style={{ gridTemplateColumns: 'minmax(0, 4fr) minmax(0, 8fr)' }} data-cc-hero>
          <div className="stack" style={{ gap: 16 }}>
            <div className="panel panel--hud">
              <div className="meta" style={{ marginBottom: 10 }}>Verificações · {rows.length.toLocaleString('pt-BR')} linhas filtradas</div>
              <Check ok={quality.dupes === 0} label="Chaves duplicadas (mês × hub × segmento × serviço)" value={`${quality.dupes}`} />
              <Check ok={quality.integrity === 0} label="Inconsistências (no prazo > entregues > envios; valores negativos)" value={`${quality.integrity}`} />
              <Check ok={quality.missing.every((m) => m.n === 0)} warn label="Colunas com valores ausentes" value={`${quality.missing.filter((m) => m.n > 0).length}`} />
            </div>
            <div className="panel">
              <div className="meta" style={{ marginBottom: 10 }}>Valores ausentes por coluna</div>
              {quality.missing.map(({ c, n }) => (
                <div key={c.field} className="row between" style={{ fontSize: 12.5, padding: '3px 0' }}>
                  <span className="mono">{c.field}</span>
                  <span className={n ? 'warn mono' : 'muted mono'}>{n} ({rows.length ? ((n / rows.length) * 100).toFixed(2).replace('.', ',') : '0'}%)</span>
                </div>
              ))}
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>weightKg tem lacunas propositais (~0,6%) e não participa de nenhum KPI.</div>
            </div>
          </div>
          <div className="panel" style={{ padding: 0 }}>
            <div className="meta" style={{ padding: 14 }}>Resumo estatístico (linhas filtradas)</div>
            <div className="table-wrap" style={{ border: 0, borderTop: '1px solid var(--line)', borderRadius: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Coluna</th>
                    {['n', 'média', 'desvio', 'mín', 'p25', 'mediana', 'p75', 'máx'].map((h) => <th key={h} className="r">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {quality.stats.map((s) => (
                    <tr key={s.c}>
                      <td className="mono">{s.c}</td>
                      <td className="r mono">{fmtInt(s.n)}</td>
                      {[s.mean, s.std, s.min, s.p25, s.p50, s.p75, s.max].map((v, i) => <td key={i} className="r mono">{Number.isFinite(v) ? fmt2(v) : '—'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === 'dictionary' && (
        <section className="stack" style={{ gap: 16 }}>
          <div className="panel panel--hud">
            <div className="meta" style={{ marginBottom: 10 }}>Metadados do conjunto</div>
            <dl className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', margin: 0, gap: 12 }}>
              {[
                ['Nome', ds.meta.name],
                ['Origem', ds.meta.source === 'synthetic' ? 'Gerador sintético no navegador' : ds.meta.source],
                ['Sintético', ds.meta.synthetic ? 'Sim — dados fictícios' : 'Não'],
                ['Seed', ds.meta.seed != null ? String(ds.meta.seed) : '—'],
                ['Cobertura', `${fmtMonth(ds.months[0])} – ${fmtMonth(ds.meta.asOf)} (${ds.months.length} meses)`],
                ['Linhas', ds.facts.length.toLocaleString('pt-BR')],
                ['Grão', 'mês × hub × segmento × serviço'],
                ['Gerado em', new Date(ds.meta.generatedAt).toLocaleString('pt-BR')],
                ['Atualização', 'Instantâneo estático — não há conexão em tempo real'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="meta">{k}</dt>
                  <dd style={{ margin: 0, fontSize: 13 }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="panel" style={{ padding: 0 }}>
            <div className="meta" style={{ padding: 14 }}>Dicionário de dados · tabela fato</div>
            <div className="table-wrap" style={{ border: 0, borderTop: '1px solid var(--line)', borderRadius: 0 }}>
              <table className="table">
                <thead><tr><th>Campo</th><th>Tipo</th><th>Unidade</th><th>Descrição</th><th>Regra</th><th>Limitações</th></tr></thead>
                <tbody>
                  {FACT_COLUMNS.map((c) => (
                    <tr key={c.field}>
                      <td className="mono">{c.field}</td>
                      <td className="mono muted">{c.type}</td>
                      <td>{c.unit}</td>
                      <td style={{ whiteSpace: 'normal', minWidth: 200 }}>{c.description}</td>
                      <td style={{ whiteSpace: 'normal', minWidth: 200, color: 'var(--text-2)' }}>{c.rule}</td>
                      <td style={{ whiteSpace: 'normal', minWidth: 160, color: 'var(--muted)' }}>{c.limitations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel" style={{ padding: 0 }}>
            <div className="meta" style={{ padding: 14 }}>Indicadores derivados · fórmulas</div>
            <div className="table-wrap" style={{ border: 0, borderTop: '1px solid var(--line)', borderRadius: 0 }}>
              <table className="table">
                <thead><tr><th>Indicador</th><th>Fórmula</th><th>Unidade</th><th>Melhor quando</th><th>Descrição</th></tr></thead>
                <tbody>
                  {METRIC_LIST.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td className="mono">{m.formula}</td>
                      <td>{m.unit}</td>
                      <td>{m.higherIsBetter ? 'maior' : 'menor'}</td>
                      <td style={{ whiteSpace: 'normal', minWidth: 240, color: 'var(--text-2)' }}>{m.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Check({ ok, warn, label, value }: { ok: boolean; warn?: boolean; label: string; value: string }) {
  return (
    <div className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
      <span className="row" style={{ gap: 8 }}>
        <span className={ok ? 'good' : warn ? 'warn' : 'bad'}>{ok ? '✓' : '!'}</span>
        {label}
      </span>
      <b className="mono">{value}</b>
    </div>
  );
}

function ColumnPicker({ cols, setCols }: { cols: Col[]; setCols: (c: Col[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn--sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="layers" size={13} /> Colunas ({cols.length})
      </button>
      {open && (
        <div className="dropdown__panel" style={{ position: 'absolute', top: 36, right: 0 }}>
          {FACT_COLUMNS.map((c) => {
            const on = cols.includes(c.field as Col);
            return (
              <button key={c.field} className="dropdown__opt" role="menuitemcheckbox" aria-checked={on} onClick={() => setCols(on ? cols.filter((x) => x !== c.field) : FACT_COLUMNS.map((d) => d.field as Col).filter((f) => f === c.field || cols.includes(f)))}>
                <span className="check" data-on={on} /> <span className="mono">{c.field}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Windowed table: only the visible rows are mounted. */
function VirtualTable({ rows, cols, sort, setSort }: { rows: FactRow[]; cols: Col[]; sort: { col: Col; dir: 1 | -1 } | null; setSort: (s: { col: Col; dir: 1 | -1 } | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const height = 520;
  const start = Math.max(0, Math.floor(top / ROW_H) - 8);
  const end = Math.min(rows.length, Math.ceil((top + height) / ROW_H) + 8);
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
    setTop(0);
  }, [rows]);
  const numeric = (c: Col) => NUMERIC.includes(c);
  const fmt = (v: unknown) => (v === null || v === undefined ? <span className="null">NULL</span> : typeof v === 'number' ? (Number.isInteger(v) ? fmtInt(v) : fmt2(v)) : String(v));
  return (
    <div ref={ref} className="table-wrap" style={{ height, border: 0, borderTop: '1px solid var(--line)', borderRadius: 0 }} onScroll={(e) => setTop(e.currentTarget.scrollTop)}>
      <table className="table" style={{ tableLayout: 'auto' }} aria-rowcount={rows.length}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className={numeric(c) ? 'r' : ''} aria-sort={sort?.col === c ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                <button onClick={() => setSort(sort?.col === c ? (sort.dir === 1 ? { col: c, dir: -1 } : null) : { col: c, dir: 1 })}>
                  {c} {sort?.col === c ? (sort.dir > 0 ? '↑' : '↓') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {start > 0 && <tr style={{ height: start * ROW_H }} aria-hidden="true"><td colSpan={cols.length} style={{ padding: 0, border: 0 }} /></tr>}
          {rows.slice(start, end).map((r) => (
            <tr key={r.id} style={{ height: ROW_H }}>
              {cols.map((c) => <td key={c} className={numeric(c) ? 'r mono' : 'mono'} style={{ fontSize: 12 }}>{fmt(r[c])}</td>)}
            </tr>
          ))}
          {end < rows.length && <tr style={{ height: (rows.length - end) * ROW_H }} aria-hidden="true"><td colSpan={cols.length} style={{ padding: 0, border: 0 }} /></tr>}
        </tbody>
      </table>
    </div>
  );
}
