import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { applyDimFilters, applyFilters, derive, monthlyTotals, previousRange, sumRows } from '../analytics/aggregate';
import { compare, METRIC_LIST, METRICS } from '../analytics/metrics';
import { mean } from '../analytics/stats';
import { relevantChanges, trendLine } from '../analytics/temporal';
import { Heatmap } from '../charts/Heatmap';
import { LineChart } from '../charts/LineChart';
import { Icon } from '../components/Icon';
import { NoResults } from '../components/States';
import { useReducedMotion, webglAvailable } from '../lib/env';
import { fmtMonth, fmtRange } from '../lib/format';
import { useMonthly, useNames } from '../state/derived';
import { useDataset, useStore } from '../state/store';
import { divergingColor } from '../styles/tokens';

const TerrainScene = lazy(() => import('../three/TerrainScene'));
const useTerrainHover = create<{ h: { row: number; col: number; x: number; y: number } | null; set: (h: { row: number; col: number; x: number; y: number } | null) => void }>((set) => ({ h: null, set: (h) => set({ h }) }));

export default function Temporal() {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const metric = useStore((s) => s.focusMetric);
  const setMetric = useStore((s) => s.setFocusMetric);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const names = useNames();
  const monthly = useMonthly();
  const reduced = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const hover = useTerrainHover((s) => s.h);
  const setHover = useTerrainHover((s) => s.set);
  const def = METRICS[metric];
  const n = ds.months.length;

  const [playhead, setPlayhead] = useState(filters.range[1]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cmpA, setCmpA] = useState<[number, number]>(() => previousRange(filters.range) ?? [0, Math.max(0, filters.range[0] - 1)]);

  useEffect(() => setPlayhead(filters.range[1]), [filters.range]);
  useEffect(() => () => setHover(null), [setHover]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setPlayhead((p) => {
        if (p >= n - 1) {
          setPlaying(false);
          return p;
        }
        return p + 1;
      });
    }, 900 / speed);
    return () => clearInterval(id);
  }, [playing, speed, n]);

  // ---- hub × month matrix (dimension filters apply; hub filter limits rows) ----------
  // Height = 1 + k × relative deviation from the hub's own mean (k documented on screen).
  const amplify = def.kind === 'ratio' ? 20 : 4;
  const { rows, raw, index } = useMemo(() => {
    const dimRows = applyDimFilters(ds.facts, filters);
    const hubs = ds.hubs
      .filter((h) => (filters.hubs.length === 0 || filters.hubs.includes(h.id)) && (filters.regions.length === 0 || filters.regions.includes(h.region)))
      .sort((a, b) => a.region.localeCompare(b.region) || a.lon - b.lon);
    const raw = hubs.map((h) => monthlyTotals(dimRows.filter((r) => r.hubId === h.id), n).map((t) => (t.rows ? derive(t)[metric] : NaN)));
    const index = raw.map((vals) => {
      const m = mean(vals);
      return vals.map((v) => 1 + amplify * (v / m - 1));
    });
    return { rows: hubs.map((h) => ({ id: h.id, label: h.id })), raw, index };
  }, [ds, filters, metric, n, amplify]);

  const series = useMemo(() => monthly.map((m) => (m.rows ? m[metric] : NaN)), [monthly, metric]);
  const changes = useMemo(() => relevantChanges(series, 1.5, def.kind === 'ratio'), [series, def.kind]);
  const trend = useMemo(() => trendLine(series, 0, Math.max(1, cmpA[1])), [series, cmpA]);
  const markers = changes.slice(0, 8).map((c) => ({ index: c.index, label: `${c.kind === 'pico' ? 'Alta' : 'Queda'} relevante (${c.z > 0 ? '+' : '−'}${Math.abs(c.z).toFixed(1).replace('.', ',')}σ)`, tone: c.kind === 'pico' ? ('up' as const) : ('down' as const) }));

  // ---- period comparison ---------------------------------------------------------------
  const A = useMemo(() => derive(sumRows(applyFilters(ds.facts, { ...filters, range: cmpA }))), [ds, filters, cmpA]);
  const B = useMemo(() => derive(sumRows(applyFilters(ds.facts, filters))), [ds, filters]);
  const lenA = cmpA[1] - cmpA[0] + 1;
  const lenB = filters.range[1] - filters.range[0] + 1;

  const last = filters.range[1];
  const trendGap = Number.isFinite(series[last]) && Number.isFinite(trend[last]) ? compare(metric, series[last], trend[last]) : null;

  if (!B.rows) return <div className="page"><NoResults /></div>;

  const fmtChange = (c: number) => (def.kind === 'ratio' ? `${c >= 0 ? '+' : '−'}${(Math.abs(c) * 100).toFixed(1).replace('.', ',')} p.p.` : `${c >= 0 ? '+' : '−'}${(Math.abs(c) * 100).toFixed(1).replace('.', ',')}%`);

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__title">
          <span className="meta">03 · Temporal Engine</span>
          <h1 className="h1">{def.name} ao longo do tempo</h1>
        </div>
        <div className="page__actions">
          <label className="row" style={{ gap: 6 }}>
            <span className="meta">Métrica</span>
            <select className="select" value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>
              {METRIC_LIST.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* ---- playback ---- */}
      <div className="panel panel--hud" style={{ marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 6 }}>
            <button className="icon-btn" onClick={() => { setPlaying(false); setPlayhead(0); }} aria-label="Voltar ao início"><Icon name="back" size={14} /></button>
            <button className="icon-btn" onClick={() => setPlayhead((p) => Math.max(0, p - 1))} aria-label="Mês anterior">‹</button>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => {
                if (!playing && playhead >= n - 1) setPlayhead(0);
                setPlaying((v) => !v);
              }}
              aria-label={playing ? 'Pausar' : 'Reproduzir'}
            >
              <Icon name={playing ? 'pause' : 'play'} size={13} /> {playing ? 'Pausar' : 'Reproduzir'}
            </button>
            <button className="icon-btn" onClick={() => setPlayhead((p) => Math.min(n - 1, p + 1))} aria-label="Próximo mês">›</button>
            <div className="seg" role="group" aria-label="Velocidade">
              {[1, 2, 4].map((s) => (
                <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>
              ))}
            </div>
          </div>
          <label className="grow row" style={{ gap: 10, minWidth: 240 }}>
            <span className="sr-only">Mês da linha do tempo</span>
            <input type="range" min={0} max={n - 1} value={playhead} onChange={(e) => { setPlaying(false); setPlayhead(Number(e.target.value)); }} style={{ flex: 1 }} aria-valuetext={fmtMonth(ds.months[playhead])} />
          </label>
          <div className="stack" style={{ gap: 0, minWidth: 140, textAlign: 'right' }}>
            <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{fmtMonth(ds.months[playhead])}</span>
            <span className="mono muted" style={{ fontSize: 11 }}>
              rede: {def.formatCompact(series[playhead])}
              {playhead > 0 && Number.isFinite(series[playhead - 1]) ? ` · ${compare(metric, series[playhead], series[playhead - 1])?.label ?? ''} MoM` : ''}
            </span>
          </div>
          <button className="btn btn--sm" onClick={() => setFilters({ range: [playhead, playhead] })} title="Define o período global como este mês">
            Fixar período neste mês
          </button>
        </div>
      </div>

      <section className="grid" style={{ gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)' }} data-cc-hero>
        <div className="panel" style={{ padding: 0, overflow: 'hidden', position: 'relative', minHeight: 440 }}>
          <div className="row between" style={{ position: 'absolute', top: 12, left: 16, right: 16, zIndex: 2, pointerEvents: 'none' }}>
            <span className="meta">Terreno temporal · hub × mês</span>
            <span className="mono muted" style={{ fontSize: 10.5 }}>
              ALTURA = 1 + {amplify} × DESVIO RELATIVO À MÉDIA DO HUB · COR = ACIMA/ABAIXO
            </span>
          </div>
          <div ref={stage} tabIndex={0} style={{ position: 'absolute', inset: 0, outline: 'none' }} aria-label="Terreno 3D de hubs por mês. Clique em uma coluna para selecionar o hub.">
            {webglAvailable() ? (
              <Suspense fallback={<div className="state">Carregando motor 3D…</div>}>
                <TerrainScene rows={rows} months={ds.months.map(fmtMonth)} index={index} playhead={playhead} selectedRow={selection.hubId} onHover={setHover} onSelectRow={(id) => select({ hubId: id })} reducedMotion={reduced} stageRef={stage} />
              </Suspense>
            ) : (
              <div style={{ padding: '44px 16px 16px' }}>
                <Heatmap
                  ariaLabel="Mapa de calor hub por mês"
                  rows={rows.map((r) => ({ key: r.id, label: r.label }))}
                  cols={ds.months.map(fmtMonth)}
                  values={index.map((r) => r.map((v, c) => (c > playhead ? NaN : v)))}
                  color={(v) => divergingColor((v - 1) / 1.2)}
                  format={(v) => v.toFixed(2).replace('.', ',')}
                  onSelectRow={(id) => select({ hubId: id })}
                />
              </div>
            )}
          </div>
          <div className="row" style={{ position: 'absolute', bottom: 12, left: 16, gap: 8, fontSize: 11, pointerEvents: 'none' }}>
            <span className="legend__ramp" style={{ width: 120, background: 'linear-gradient(90deg, rgb(255,73,108), rgb(139,149,167), rgb(0,229,255))' }} />
            <span className="mono muted">abaixo · média · acima</span>
          </div>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel__head">
              <span className="meta">Mudanças relevantes (rede)</span>
              <span className="mono muted" style={{ fontSize: 10.5 }}>|z| ≥ 1,5 na variação mensal</span>
            </div>
            {changes.length === 0 && <div className="muted">Nenhuma variação mensal fora do padrão.</div>}
            <div className="list">
              {changes.slice(0, 6).map((c) => (
                <button key={c.index} className="list__row" style={{ gridTemplateColumns: '64px 1fr auto' }} onClick={() => { setPlaying(false); setPlayhead(c.index); }}>
                  <span className="mono">{fmtMonth(ds.months[c.index])}</span>
                  <span className={c.kind === 'pico' ? 'good' : 'bad'} style={{ fontSize: 13 }}>
                    {c.kind === 'pico' ? '▲ Alta' : '▼ Queda'} de {fmtChange(c.change)} vs mês anterior
                  </span>
                  <span className="mono muted" style={{ fontSize: 11 }}>{c.z > 0 ? '+' : '−'}{Math.abs(c.z).toFixed(1).replace('.', ',')}σ</span>
                </button>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Alta/queda é estatística, não causal. Meses de pico sazonal (nov/dez) aparecem aqui por construção.</div>
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="meta">Tendência histórica × resultado atual</span>
            </div>
            <div className="row between">
              <span className="muted" style={{ fontSize: 12 }}>{fmtMonth(ds.months[last])} observado</span>
              <b className="mono">{def.format(series[last])}</b>
            </div>
            <div className="row between">
              <span className="muted" style={{ fontSize: 12 }}>Projeção da tendência ({fmtRange(ds.months, [0, Math.max(1, cmpA[1])])})</span>
              <b className="mono">{def.format(trend[last])}</b>
            </div>
            <div className="row between">
              <span className="muted" style={{ fontSize: 12 }}>Diferença</span>
              {trendGap ? <span className="delta" data-s={trendGap.sentiment}>{trendGap.label}</span> : <span className="muted">—</span>}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Tendência linear (mínimos quadrados) ajustada até o fim do período A; não considera sazonalidade.</div>
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel__head">
          <div className="panel__title">
            <span className="meta">Série mensal · {def.name}</span>
          </div>
          <span className="row wrap" style={{ gap: 12, fontSize: 11 }}>
            <span className="row" style={{ gap: 6 }}><span className="swatch" style={{ background: 'var(--cyan)' }} /> observado</span>
            <span className="row" style={{ gap: 6 }}><span className="swatch" style={{ background: 'var(--violet)', height: 0, borderTop: '2px dashed var(--violet)' }} /> tendência</span>
            <span className="row" style={{ gap: 6 }}><span className="good">▲</span>/<span className="bad">▼</span> mudanças relevantes</span>
          </span>
        </div>
        <LineChart
          ariaLabel={`Série mensal de ${def.name}`}
          series={[
            { id: 'obs', label: def.name, color: 'var(--cyan)', values: series, area: true },
            { id: 'trend', label: 'Tendência', color: 'var(--violet)', values: trend, dashed: true },
          ]}
          xLabels={ds.months.map(fmtMonth)}
          format={def.formatCompact}
          highlight={filters.range}
          compare={cmpA}
          markers={markers}
          cursor={playhead}
          onSelectIndex={(i) => { setPlaying(false); setPlayhead(i); }}
          height={240}
        />
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel__head" style={{ flexWrap: 'wrap' }}>
          <span className="meta">Comparação entre períodos</span>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="badge" style={{ color: 'var(--violet)', borderColor: 'rgba(155,92,255,.4)' }}>A</span>
            <select className="select" value={cmpA[0]} onChange={(e) => setCmpA([Number(e.target.value), Math.max(Number(e.target.value), cmpA[1])])} aria-label="Início do período A">
              {ds.months.map((m, i) => <option key={m} value={i}>{fmtMonth(m)}</option>)}
            </select>
            <select className="select" value={cmpA[1]} onChange={(e) => setCmpA([Math.min(cmpA[0], Number(e.target.value)), Number(e.target.value)])} aria-label="Fim do período A">
              {ds.months.map((m, i) => <option key={m} value={i}>{fmtMonth(m)}</option>)}
            </select>
            <span className="badge" style={{ color: 'var(--cyan)', borderColor: 'rgba(0,229,255,.4)' }}>B</span>
            <span className="mono" style={{ fontSize: 12 }}>{fmtRange(ds.months, filters.range)} (período global)</span>
            <button className="btn btn--sm btn--ghost" onClick={() => { const yr: [number, number] = [filters.range[0] - 12, filters.range[1] - 12]; if (yr[0] >= 0) setCmpA(yr); }} disabled={filters.range[0] < 12}>
              Mesmo período do ano anterior
            </button>
          </div>
        </div>
        {lenA !== lenB && <div className="warn" style={{ fontSize: 12, marginBottom: 8 }}>! Períodos com durações diferentes ({lenA} vs {lenB} meses): compare as taxas; totais não são diretamente comparáveis.</div>}
        {cmpA[1] >= filters.range[0] && cmpA[0] <= filters.range[1] && <div className="warn" style={{ fontSize: 12, marginBottom: 8 }}>! Os períodos se sobrepõem.</div>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Indicador</th>
                <th className="r">A · {fmtRange(ds.months, cmpA)}</th>
                <th className="r">B · {fmtRange(ds.months, filters.range)}</th>
                <th className="r">B vs A</th>
              </tr>
            </thead>
            <tbody>
              {METRIC_LIST.map((m) => {
                const c = A.rows ? compare(m.id, B[m.id], A[m.id]) : null;
                return (
                  <tr key={m.id}>
                    <td>{m.name}{m.kind === 'volume' && lenA !== lenB ? <span className="warn"> *</span> : null}</td>
                    <td className="r mono">{A.rows ? m.format(A[m.id]) : '—'}</td>
                    <td className="r mono">{m.format(B[m.id])}</td>
                    <td className="r">{c ? <span className="delta" data-s={c.sentiment}>{c.label}</span> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {hover && rows[hover.row] && (
        <div className="tooltip3d" style={{ position: 'fixed', left: Math.min(hover.x, window.innerWidth - 240), top: hover.y, zIndex: 50 }}>
          <div className="meta">{rows[hover.row].id} · {fmtMonth(ds.months[hover.col])}</div>
          <div style={{ fontWeight: 600, margin: '2px 0 4px' }}>{names.hub(rows[hover.row].id)}</div>
          <div className="row between" style={{ gap: 16 }}>
            <span className="muted">{def.name}</span>
            <b className="mono">{def.format(raw[hover.row][hover.col])}</b>
          </div>
          <div className="row between" style={{ gap: 16 }}>
            <span className="muted">vs média do hub</span>
            <b className="mono">{fmtChange(def.kind === 'ratio' ? raw[hover.row][hover.col] - mean(raw[hover.row]) : raw[hover.row][hover.col] / mean(raw[hover.row]) - 1)}</b>
          </div>
        </div>
      )}
    </div>
  );
}
