import { useEffect, useMemo, useRef } from 'react';
import type { Metrics } from '../analytics/aggregate';
import { breakdown } from '../analytics/breakdown';
import { compare, METRICS, type MetricId } from '../analytics/metrics';
import { LineChart } from '../charts/LineChart';
import { BarList, Sparkline } from '../charts/Bars';
import { fmtMonth, fmtRange } from '../lib/format';
import { useFilteredRows, useMonthly, useOverview } from '../state/derived';
import { useDataset, useStore } from '../state/store';
import { Icon } from './Icon';

export function Delta({ id, current, previous }: { id: MetricId; current: number; previous: number | null | undefined }) {
  const c = previous == null ? null : compare(id, current, previous);
  if (!c) return <span className="delta" data-s="0" title="Sem período anterior equivalente">sem base</span>;
  return (
    <span className="delta" data-s={c.sentiment} aria-label={`variação ${c.label}`}>
      {c.value > 0 ? '▲' : c.value < 0 ? '▼' : '■'} {c.label}
    </span>
  );
}

export function FavButton({ id, kind, label, detail }: { id: string; kind: 'kpi' | 'finding' | 'view' | 'analysis'; label: string; detail?: string }) {
  const on = useStore((s) => s.favorites.some((f) => f.id === id));
  const toggle = useStore((s) => s.toggleFavorite);
  return (
    <button
      className="icon-btn"
      style={{ height: 26, minWidth: 26, padding: 0, border: 0, background: 'none', color: on ? 'var(--warn)' : 'var(--faint)' }}
      aria-pressed={on}
      aria-label={on ? `Remover ${label} dos favoritos` : `Favoritar ${label}`}
      title={on ? 'Remover dos favoritos' : 'Favoritar'}
      onClick={(e) => {
        e.stopPropagation();
        toggle({ id, kind, label, detail });
      }}
    >
      <Icon name="star" size={14} filled={on} />
    </button>
  );
}

/** KPI instrument: name, value, unit, period, variation, reference and sparkline. Opens the detail drawer. */
export function KpiInstrument({
  id,
  current,
  previous,
  size = 'md',
  onOpen,
  active,
}: {
  id: MetricId;
  current: Metrics;
  previous: Metrics | null;
  size?: 'md' | 'xl';
  onOpen: (id: MetricId) => void;
  active?: boolean;
}) {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  const monthly = useMonthly();
  const def = METRICS[id];
  return (
    <button className="kpi" aria-pressed={!!active} onClick={() => onOpen(id)} aria-label={`${def.name}: ${def.format(current[id])}. Abrir detalhes`}>
      <div className="kpi__top">
        <span className="meta">{def.name}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--faint)' }}>{def.unit}</span>
      </div>
      <div className={`kpi__value ${size === 'xl' ? 'kpi__value--xl' : ''}`}>{def.formatCompact(current[id])}</div>
      <div className="kpi__foot">
        <Delta id={id} current={current[id]} previous={previous?.[id]} />
        <span>vs {previous ? 'período anterior' : '—'}</span>
        <span style={{ marginLeft: 'auto' }}>
          <Sparkline values={monthly.map((m) => m[id])} highlight={filters.range} width={84} height={22} />
        </span>
      </div>
      <span className="sr-only">Período: {fmtRange(ds.months, filters.range)}</span>
    </button>
  );
}

/** Detail view of a KPI: definition, formula, source, quality, series and breakdown. */
export function KpiDrawer({ id, onClose }: { id: MetricId; onClose: () => void }) {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const o = useOverview();
  const monthly = useMonthly();
  const rows = useFilteredRows();
  const def = METRICS[id];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  const byHub = useMemo(() => breakdown(ds, filters, 'hub'), [ds, filters]);
  const sorted = [...byHub].sort((a, b) => (def.higherIsBetter ? b.metrics[id] - a.metrics[id] : a.metrics[id] - b.metrics[id]));
  const incomplete = rows.filter((r) => def.sourceFields.some((f) => !Number.isFinite((r as unknown as Record<string, number>)[f]))).length;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="kpi-title" ref={ref} tabIndex={-1}>
        <div className="drawer__head">
          <div className="stack" style={{ gap: 6 }}>
            <span className="meta">KPI · {fmtRange(ds.months, filters.range)}</span>
            <h2 className="h1" id="kpi-title">{def.name}</h2>
            <div className="row" style={{ gap: 12 }}>
              <span className="kpi__value" style={{ fontSize: 34 }}>{def.format(o.current[id])}</span>
              <Delta id={id} current={o.current[id]} previous={o.previous?.[id]} />
            </div>
          </div>
          <div className="row">
            <FavButton id={`kpi:${id}`} kind="kpi" label={def.name} detail={def.format(o.current[id])} />
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="drawer__body">
          <dl className="grid grid--2" style={{ margin: 0, gap: 12 }}>
            <Def k="Unidade" v={def.unit} />
            <Def k="Período analisado" v={fmtRange(ds.months, filters.range)} />
            <Def k="Referência de comparação" v={o.previousRange ? `${fmtRange(ds.months, o.previousRange)} (${def.format(o.previous![id])})` : 'Indisponível — o conjunto de dados não cobre o período anterior equivalente'} />
            <Def k="Melhor quando" v={def.higherIsBetter ? 'maior' : 'menor'} />
            <Def k="Fórmula" v={def.formula} mono />
            <Def k="Origem" v={`${ds.meta.synthetic ? 'Dados sintéticos' : ds.meta.name} · campos ${def.sourceFields.join(', ')}`} />
            <Def k="Qualidade" v={incomplete === 0 ? `Completo: ${rows.length.toLocaleString('pt-BR')} linhas, todos os campos da fórmula preenchidos` : `${incomplete} linha(s) com campos ausentes foram ignoradas`} />
            <Def k="Atualizado até" v={fmtMonth(ds.meta.asOf)} />
          </dl>
          <p className="muted" style={{ margin: 0 }}>{def.description}</p>
          <section>
            <div className="meta" style={{ marginBottom: 8 }}>Série mensal · área destacada = período selecionado (clique para focar o mês)</div>
            <LineChart
              ariaLabel={`Série mensal de ${def.name}`}
              series={[{ id, label: def.name, color: 'var(--cyan)', values: monthly.map((m) => m[id]), area: true }]}
              xLabels={ds.months.map(fmtMonth)}
              format={def.formatCompact}
              highlight={filters.range}
              compare={o.previousRange}
              height={200}
              onSelectIndex={(i) => setFilters({ range: [i, i] })}
            />
          </section>
          <section>
            <div className="meta" style={{ marginBottom: 8 }}>Por hub · clique para filtrar</div>
            <BarList
              ariaLabel={`${def.name} por hub`}
              items={sorted.map((g) => ({
                key: g.key,
                label: g.label,
                value: g.metrics[id],
                display: def.formatCompact(g.metrics[id]),
                note: g.previous ? (() => { const c = compare(id, g.metrics[id], g.previous![id]); return c ? { text: c.label, sentiment: c.sentiment } : undefined; })() : undefined,
              }))}
              selected={filters.hubs}
              onSelect={(k) => setFilters({ hubs: filters.hubs.includes(k) ? filters.hubs.filter((h) => h !== k) : [k] })}
            />
          </section>
        </div>
      </aside>
    </>
  );
}

function Def({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="meta" style={{ marginBottom: 2 }}>{k}</dt>
      <dd style={{ margin: 0, fontSize: 13, fontFamily: mono ? 'var(--font-mono)' : undefined }}>{v}</dd>
    </div>
  );
}
