import { lazy, Suspense, useMemo, useState } from 'react';
import { summarize } from '../analytics/insights';
import { METRICS, type MetricId } from '../analytics/metrics';
import { LineChart } from '../charts/LineChart';
import { FindingList } from '../components/Findings';
import { Icon } from '../components/Icon';
import { KpiInstrument } from '../components/Kpi';
import { NoResults } from '../components/States';
import { deviceTier, useReducedMotion, webglAvailable } from '../lib/env';
import { fmtMonth, fmtPct, fmtRange } from '../lib/format';
import { useMonthly, useNames, useOverview } from '../state/derived';
import { useDataset, useStore } from '../state/store';
import { HEALTH_SPEC } from '../analytics/health';

const CoreScene = lazy(() => import('../three/CoreScene'));
const BAND_COLORS = { forte: 'var(--good)', estável: 'var(--cyan)', atenção: 'var(--warn)', crítico: 'var(--bad)' } as const;

const KPIS: MetricId[] = ['shipments', 'ticket', 'onTimeRate', 'margin', 'avgTransit', 'costPerShipment', 'claimsPer1k', 'grossProfit'];

export default function CommandCenter() {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  const openKpi = useStore((s) => s.openKpi);
  const kpiOpen = useStore((s) => s.kpiOpen);
  const setModule = useStore((s) => s.setModule);
  const o = useOverview();
  const monthly = useMonthly();
  const names = useNames();
  const reduced = useReducedMotion();
  const tier = useMemo(() => deviceTier(), []);
  const summary = useMemo(() => summarize(ds, filters, o), [ds, filters, o]);
  const period = fmtRange(ds.months, filters.range);
  const [how, setHow] = useState(false);

  if (o.empty) return <div className="page"><NoResults /></div>;

  const h = o.health;
  const risks = o.findings.filter((f) => f.kind === 'risk' || f.kind === 'alert');
  const opps = o.findings.filter((f) => f.kind === 'opportunity' || f.kind === 'trend');

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__title">
          <span className="meta">01 · Command Center · {period}</span>
          <h1 className="h1">Estado da operação</h1>
        </div>
        <div className="page__actions">
          <button className="btn btn--sm" onClick={() => setModule('galaxy')}>
            Explorar na Data Galaxy →
          </button>
        </div>
      </div>

      <section className="grid" style={{ gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)', alignItems: 'stretch' }} data-cc-hero>
        {/* ---- health nucleus ---- */}
        <div className="panel panel--hud" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 440 }}>
          <div className="row between" style={{ padding: '16px 16px 0' }}>
            <div className="stack" style={{ gap: 4 }}>
              <span className="meta">Índice de saúde operacional</span>
              <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                <span className="kpi__value kpi__value--xl">{Number.isFinite(h.score) ? Math.round(h.score) : '—'}</span>
                <span className="mono muted">/100</span>
                <span className="badge" style={{ color: BAND_COLORS[h.band], borderColor: 'currentColor' }}>{h.band}</span>
              </div>
            </div>
            <button className="icon-btn" aria-pressed={how} aria-expanded={how} aria-label="Como o índice é calculado" onClick={() => setHow((v) => !v)}>
              <Icon name="info" size={14} />
            </button>
          </div>
          {how && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)', padding: '8px 16px 0', lineHeight: 1.6 }}>
              Cada componente é reescalado linearmente entre um piso (0) e uma meta (100) e ponderado:
              {HEALTH_SPEC.map((s) => (
                <div key={s.id}>
                  · {s.label} ×{Math.round(s.weight * 100)}% — 0 em {s.id === 'quality' ? `${s.floor}‰` : s.id === 'growth' ? `${s.floor * 100}%` : fmtPct(s.floor, 0)}, 100 em {s.id === 'quality' ? `${s.target}‰` : s.id === 'growth' ? `+${s.target * 100}%` : fmtPct(s.target, 0)}
                </div>
              ))}
              Arco de cada órbita = pontuação do componente. Cor do núcleo = faixa do índice.
            </div>
          )}
          <div style={{ flex: 1, minHeight: 240, position: 'relative' }}>
            {webglAvailable() ? (
              <Suspense fallback={null}>
                <CoreScene health={h} reducedMotion={reduced} tier={tier} />
              </Suspense>
            ) : (
              <div className="state">Visualização 3D indisponível — componentes listados abaixo.</div>
            )}
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <div className="grid grid--2" style={{ gap: '8px 16px' }}>
              {h.components.map((c, i) => {
                const spec = HEALTH_SPEC[i];
                return (
                  <div key={c.id} title={`Peso ${Math.round(c.weight * 100)}% · 0 pts em ${spec.floor} · 100 pts em ${spec.target}`}>
                    <div className="row between" style={{ fontSize: 12 }}>
                      <span className="muted">{c.label} <span className="mono" style={{ fontSize: 10 }}>×{Math.round(c.weight * 100)}%</span></span>
                      <span className="mono">{c.available ? Math.round(c.score) : 'n/d'}</span>
                    </div>
                    <div className="bar-track" style={{ marginTop: 4 }}>
                      <div className="bar-fill" style={{ width: `${c.available ? c.score : 0}%`, background: ['var(--cyan)', 'var(--blue)', 'var(--violet)', 'var(--text)'][i] }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {!h.components.find((c) => c.id === 'growth')?.available && (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Crescimento indisponível (sem período anterior equivalente); pesos redistribuídos.</div>
            )}
          </div>
        </div>

        {/* ---- KPI instruments ---- */}
        <div className="stack" style={{ gap: 12 }}>
          <KpiInstrument id="revenue" current={o.current} previous={o.previous} size="xl" onOpen={openKpi} active={kpiOpen === 'revenue'} />
          <div className="grid grid--4" style={{ gap: 8 }}>
            {KPIS.map((id) => (
              <KpiInstrument key={id} id={id} current={o.current} previous={o.previous} onOpen={openKpi} active={kpiOpen === id} />
            ))}
          </div>
          <div className="panel" style={{ flex: 1 }}>
            <div className="panel__head">
              <div className="panel__title">
                <span className="meta">Tendência de receita</span>
                <span className="mono muted" style={{ fontSize: 11 }}>{fmtMonth(ds.months[0])} – {fmtMonth(ds.months[ds.months.length - 1])}</span>
              </div>
              <span className="row" style={{ gap: 12, fontSize: 11 }}>
                <span className="row" style={{ gap: 6 }}><span className="swatch swatch--box" style={{ background: 'rgba(0,229,255,.25)' }} /> período</span>
                {o.previousRange && <span className="row" style={{ gap: 6 }}><span className="swatch swatch--box" style={{ background: 'rgba(155,92,255,.3)' }} /> comparação</span>}
              </span>
            </div>
            <LineChart
              ariaLabel="Receita mensal"
              series={[{ id: 'rev', label: 'Receita', color: 'var(--cyan)', values: monthly.map((m) => m.revenue), area: true }]}
              xLabels={ds.months.map(fmtMonth)}
              format={METRICS.revenue.formatCompact}
              highlight={filters.range}
              compare={o.previousRange}
              height={170}
            />
          </div>
        </div>
      </section>

      <section className="grid" style={{ gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)', marginTop: 16 }} data-cc-hero>
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel panel--hud">
            <div className="panel__head">
              <span className="meta">Resumo analítico</span>
              <span className="badge badge--engine" title="Texto gerado por regras determinísticas a partir dos dados; nenhum modelo de linguagem foi consultado.">motor determinístico</span>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {summary.map((l, i) => (
                <p key={i} style={{ margin: 0, color: i === 0 ? 'var(--text)' : 'var(--text-2)', fontSize: 13.5 }}>{l}</p>
              ))}
            </div>
            <button className="btn btn--sm" style={{ marginTop: 12 }} onClick={() => setModule('lab')}>
              Investigar no AI Analytics Lab →
            </button>
          </div>
          <div className="panel">
            <div className="panel__head">
              <span className="meta">Alertas · observações atípicas ({o.anomalies.length})</span>
              <button className="btn btn--sm btn--ghost" onClick={() => setModule('anomaly')}>Detector →</button>
            </div>
            {o.anomalies.length === 0 && <div className="muted">Nenhuma observação acima do limiar no período.</div>}
            <div className="list">
              {o.anomalies.slice(0, 6).map((a) => (
                <div key={a.id} className="list__row" style={{ gridTemplateColumns: '56px 1fr auto' }}>
                  <span className={`badge badge--${a.priority}`}>{a.priority}</span>
                  <span style={{ fontSize: 13 }}>
                    <b style={{ fontWeight: 500 }}>{names.hub(a.hubId)}</b> · {METRICS[a.metric].name}
                    <span className="muted"> · {fmtMonth(ds.months[a.monthIndex])}</span>
                  </span>
                  <span className="mono" style={{ fontSize: 12 }}>{a.scoreLabel}</span>
                </div>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Desvio estatístico ≠ diagnóstico. Cada item merece investigação antes de qualquer conclusão.</div>
          </div>
        </div>
        <div className="grid grid--2">
          <div className="panel">
            <div className="panel__head">
              <span className="meta">Riscos e alertas</span>
              <span className="mono muted" style={{ fontSize: 11 }}>{risks.length}</span>
            </div>
            <FindingList findings={risks} />
          </div>
          <div className="panel">
            <div className="panel__head">
              <span className="meta">Oportunidades e tendências</span>
              <span className="mono muted" style={{ fontSize: 11 }}>{opps.length}</span>
            </div>
            <FindingList findings={opps} />
          </div>
        </div>
      </section>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 16 }}>
        Variações comparam o período selecionado com a janela de mesma duração imediatamente anterior{o.previousRange ? ` (${fmtRange(ds.months, o.previousRange)})` : ' — indisponível para este recorte'}. Margem de rede: {fmtPct(o.current.margin)}.
      </p>
    </div>
  );
}
