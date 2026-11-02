import { useMemo, useState } from 'react';
import { create } from 'zustand';
import type { Metrics } from '../../analytics/aggregate';
import { breakdown } from '../../analytics/breakdown';
import type { Entity } from '../../analytics/entities';
import { compare, METRICS, type MetricId } from '../../analytics/metrics';
import { buildMissions, checkMission } from '../../analytics/missions';
import { ShareBar } from '../../charts/Bars';
import { Delta, FavButton } from '../../components/Kpi';
import { Icon } from '../../components/Icon';
import { fmtMonth } from '../../lib/format';
import { useNames, useOverview } from '../../state/derived';
import { useDataset, useStore, type GalaxyColor } from '../../state/store';
import { REGION_COLORS } from '../../styles/tokens';
import { colorValueLabel, COLOR_MODES } from './encoding';

/** Hover state lives outside React's tree for the 3D scene, so moving the cursor never re-renders the canvas. */
export const useHover = create<{ h: { kind: 'entity' | 'hub'; id: string; x: number; y: number } | null; set: (h: { kind: 'entity' | 'hub'; id: string; x: number; y: number } | null) => void }>((set) => ({
  h: null,
  set: (h) => set({ h }),
}));

export function Tooltip({ entities, colorBy, network }: { entities: Entity[]; colorBy: GalaxyColor; network: Metrics }) {
  const h = useHover((s) => s.h);
  const names = useNames();
  const o = useOverview();
  if (!h) return null;
  const left = Math.min(h.x, window.innerWidth - 260);
  if (h.kind === 'hub') {
    const g = o.hubs.find((x) => x.key === h.id);
    if (!g) return null;
    return (
      <div className="tooltip3d" style={{ position: 'fixed', left, top: h.y, zIndex: 50 }}>
        <div className="meta">HUB · {h.id}</div>
        <div style={{ fontWeight: 600, margin: '2px 0 6px' }}>{g.label}</div>
        <Row k="Receita" v={METRICS.revenue.formatCompact(g.metrics.revenue)} />
        <Row k="Envios" v={METRICS.shipments.formatCompact(g.metrics.shipments)} />
        <Row k="Pontualidade" v={METRICS.onTimeRate.format(g.metrics.onTimeRate)} />
        <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>Altura do feixe = receita · clique para inspecionar</div>
      </div>
    );
  }
  const e = entities.find((x) => x.id === h.id);
  if (!e) return null;
  const extra = colorValueLabel(e, colorBy, network);
  return (
    <div className="tooltip3d" style={{ position: 'fixed', left, top: h.y, zIndex: 50 }}>
      <div className="meta">{e.hubId} · {e.segmentId}</div>
      <div style={{ fontWeight: 600, margin: '2px 0 6px' }}>
        {names.hub(e.hubId)} · {names.segment(e.segmentId)}
      </div>
      <Row k="Receita" v={METRICS.revenue.formatCompact(e.m.revenue)} />
      <Row k="Pontualidade" v={METRICS.onTimeRate.format(e.m.onTimeRate)} />
      <Row k="Margem" v={METRICS.margin.format(e.m.margin)} />
      <Row k="Ticket" v={METRICS.ticket.format(e.m.ticket)} />
      {extra && <div style={{ marginTop: 6, color: 'var(--text-2)' }}>{extra}</div>}
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="row between" style={{ gap: 16 }}>
    <span className="muted">{k}</span>
    <b className="mono" style={{ fontWeight: 500 }}>{v}</b>
  </div>
);

export function Legend({
  layout,
  colorBy,
  isolate,
  setIsolate,
}: {
  layout: 'geo' | 'scatter';
  colorBy: GalaxyColor;
  isolate: { kind: 'region' | 'segment'; id: string } | null;
  setIsolate: (v: { kind: 'region' | 'segment'; id: string } | null) => void;
}) {
  const ds = useDataset();
  const [open, setOpen] = useState(true);
  const mode = COLOR_MODES.find((m) => m.id === colorBy)!;
  return (
    <div className="panel panel--float" style={{ width: 300, padding: 14 }}>
      <button className="row between" style={{ width: '100%', background: 'none', border: 0, padding: 0, color: 'var(--text)' }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="meta">Legenda · como ler</span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', display: 'inline-flex' }}><Icon name="chevron" size={12} /></span>
      </button>
      {open && (
        <div className="legend" style={{ marginTop: 10 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Cada esfera = <b style={{ color: 'var(--text)' }}>hub × segmento</b> no período filtrado. Área da esfera ≈ proporcional à receita (com raio mínimo).
          </div>
          {layout === 'geo' ? (
            <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--text-2)', fontSize: 12 }}>
              <li>Posição: geografia do hub (lat/lon); esferas em anel, ângulo = segmento.</li>
              <li>Feixe vertical: receita total do hub.</li>
              <li>Arcos: rotas; espessura e densidade de partículas ∝ volume.</li>
              <li>Anel vermelho pulsante: hub com observações atípicas.</li>
            </ul>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--text-2)', fontSize: 12 }}>
              <li>X = pontualidade · Y = margem · Z = ticket médio.</li>
              <li>Linhas tracejadas = média da rede (quadrantes).</li>
            </ul>
          )}
          <div className="divider" />
          <div className="meta">Cor · {mode.label}</div>
          {colorBy === 'region' ? (
            <div className="stack" style={{ gap: 2 }}>
              {ds.regions.map((r) => (
                <button
                  key={r.id}
                  className="dropdown__opt"
                  style={{ padding: '4px 6px' }}
                  aria-pressed={isolate?.id === r.id}
                  onClick={() => setIsolate(isolate?.id === r.id ? null : { kind: 'region', id: r.id })}
                  title="Clique para isolar"
                >
                  <span className="swatch swatch--box" style={{ background: REGION_COLORS[r.id] }} />
                  <span style={{ color: isolate && isolate.id !== r.id ? 'var(--faint)' : undefined }}>{r.name}</span>
                  {isolate?.id === r.id && <span className="badge" style={{ marginLeft: 'auto' }}>isolado</span>}
                </button>
              ))}
            </div>
          ) : colorBy === 'anomaly' ? (
            <div className="stack" style={{ gap: 4, fontSize: 12 }}>
              <span className="row"><span className="swatch swatch--box" style={{ background: 'var(--bad)' }} /> com observações atípicas</span>
              <span className="row"><span className="swatch swatch--box" style={{ background: '#3a4150' }} /> sem ocorrências</span>
            </div>
          ) : (
            <div className="stack" style={{ gap: 4 }}>
              <div className="legend__ramp" style={{ width: '100%', background: 'linear-gradient(90deg, rgb(255,73,108), rgb(139,149,167), rgb(0,229,255))' }} />
              <div className="row between mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                <span>▼ abaixo</span>
                <span>rede</span>
                <span>acima ▲</span>
              </div>
            </div>
          )}
          <div className="muted" style={{ fontSize: 11.5 }}>{mode.description}</div>
          <div className="divider" />
          <div className="meta">Isolar segmento</div>
          <div className="row wrap" style={{ gap: 4 }}>
            {ds.segments.map((s) => (
              <button key={s.id} className="chip" style={{ height: 24, fontSize: 11 }} aria-pressed={isolate?.id === s.id} onClick={() => setIsolate(isolate?.id === s.id ? null : { kind: 'segment', id: s.id })}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const PANEL_METRICS: MetricId[] = ['revenue', 'shipments', 'ticket', 'onTimeRate', 'margin', 'avgTransit', 'claimsPer1k'];

export function SelectionPanel({ entities, onFocus }: { entities: Entity[]; onFocus: (hubId: string) => void }) {
  const ds = useDataset();
  const names = useNames();
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const setModule = useStore((s) => s.setModule);
  const o = useOverview();

  const hub = selection.hubId ? ds.hubs.find((h) => h.id === selection.hubId) : undefined;
  const ent = selection.hubId && selection.segmentId ? entities.find((e) => e.hubId === selection.hubId && e.segmentId === selection.segmentId) : undefined;
  const hubGroup = hub ? o.hubs.find((g) => g.key === hub.id) : undefined;
  const segs = useMemo(() => (hub ? breakdown(ds, { ...filters, hubs: [hub.id] }, 'segment') : []), [ds, filters, hub]);

  if (!hub) {
    return (
      <div className="panel panel--float panel--hud" style={{ width: 300 }}>
        <div className="meta">Recorte atual</div>
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          {(['revenue', 'onTimeRate', 'margin'] as MetricId[]).map((id) => (
            <div key={id} className="row between">
              <span className="muted" style={{ fontSize: 12 }}>{METRICS[id].name}</span>
              <span className="row" style={{ gap: 8 }}>
                <b className="mono" style={{ fontWeight: 500 }}>{METRICS[id].formatCompact(o.current[id])}</b>
                <Delta id={id} current={o.current[id]} previous={o.previous?.[id]} />
              </span>
            </div>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          {entities.length} objetos visíveis. Clique em uma esfera ou feixe para inspecionar; a seleção atualiza este painel e é compartilhada com os demais módulos.
        </div>
      </div>
    );
  }

  const m = ent ? ent.m : hubGroup?.metrics;
  const prev = ent ? ent.prev : hubGroup?.previous;
  const hubAnoms = o.anomalies.filter((a) => a.hubId === hub.id).slice(0, 3);
  const label = ent ? `${hub.name} · ${names.segment(ent.segmentId)}` : hub.name;

  return (
    <div className="panel panel--float panel--hud" style={{ width: 320, maxHeight: '100%', overflowY: 'auto' }} aria-live="polite">
      <div className="row between">
        <span className="meta">{ent ? 'Objeto' : 'Hub'} · {hub.id}{ent ? `·${ent.segmentId}` : ''}</span>
        <div className="row" style={{ gap: 2 }}>
          <FavButton id={`view:galaxy:${hub.id}:${ent?.segmentId ?? ''}`} kind="view" label={label} detail="Data Galaxy" />
          <button className="icon-btn" style={{ border: 0, background: 'none', height: 26, minWidth: 26, padding: 0 }} onClick={() => select({})} aria-label="Fechar seleção">
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>
      <h3 className="h2" style={{ margin: '4px 0 2px' }}>{label}</h3>
      <div className="mono muted" style={{ fontSize: 11 }}>
        {names.region(hub.region)} · {hub.uf} · {Math.abs(hub.lat).toFixed(2)}°S {Math.abs(hub.lon).toFixed(2)}°W
      </div>
      {m ? (
        <div className="stack" style={{ gap: 5, marginTop: 12 }}>
          {PANEL_METRICS.map((id) => (
            <div key={id} className="row between">
              <span className="muted" style={{ fontSize: 12 }}>{METRICS[id].name}</span>
              <span className="row" style={{ gap: 8 }}>
                <b className="mono" style={{ fontWeight: 500, fontSize: 12.5 }}>{METRICS[id].formatCompact(m[id])}</b>
                <span style={{ minWidth: 76, textAlign: 'right' }}>
                  <Delta id={id} current={m[id]} previous={prev?.[id]} />
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted" style={{ marginTop: 12 }}>Sem dados para este objeto no recorte.</div>
      )}
      {!ent && segs.length > 0 && hubGroup && (
        <div style={{ marginTop: 14 }}>
          <div className="meta" style={{ marginBottom: 6 }}>Receita por segmento</div>
          <ShareBar
            ariaLabel="Participação por segmento"
            parts={segs.sort((a, b) => b.metrics.revenue - a.metrics.revenue).map((g, i) => ({ key: g.key, label: g.label, value: g.metrics.revenue, display: METRICS.revenue.formatCompact(g.metrics.revenue), color: ['#00E5FF', '#356BFF', '#9B5CFF', '#5c7290', '#3a4458'][i] }))}
          />
        </div>
      )}
      {hubAnoms.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="meta" style={{ marginBottom: 6 }}>Observações atípicas do hub</div>
          {hubAnoms.map((a) => (
            <div key={a.id} className="row between" style={{ fontSize: 12, padding: '3px 0' }}>
              <span>
                <span className={`badge badge--${a.priority}`} style={{ marginRight: 6 }}>{a.priority}</span>
                {METRICS[a.metric].name} · {fmtMonth(ds.months[a.monthIndex])}
              </span>
              <span className="mono">{a.scoreLabel}</span>
            </div>
          ))}
        </div>
      )}
      {prev && m && (
        <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
          Variações contra o período anterior equivalente. {compare('revenue', m.revenue, prev.revenue)?.label} em receita.
        </div>
      )}
      <div className="row wrap" style={{ gap: 6, marginTop: 14 }}>
        <button className="btn btn--sm" onClick={() => onFocus(hub.id)}>
          <Icon name="target" size={13} /> Aproximar
        </button>
        <button className="btn btn--sm" onClick={() => setFilters({ hubs: [hub.id], ...(ent ? { segments: [ent.segmentId] } : {}) })}>
          <Icon name="filter" size={13} /> Filtrar
        </button>
        <button className="btn btn--sm" onClick={() => setModule('temporal')}>Série temporal</button>
        <button className="btn btn--sm" onClick={() => setModule('lab')}>Analisar no AI Lab</button>
      </div>
    </div>
  );
}

export function MissionsPanel({ onClose }: { onClose: () => void }) {
  const ds = useDataset();
  const missions = useMemo(() => buildMissions(ds), [ds]);
  const done = useStore((s) => s.missionsDone);
  const complete = useStore((s) => s.completeMission);
  const active = useStore((s) => s.activeMission);
  const setActive = useStore((s) => s.setActiveMission);
  const selection = useStore((s) => s.selection);
  const names = useNames();
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean | null } | null>(null);
  const doneCount = missions.filter((m) => done[m.id]).length;
  const current = missions.find((m) => m.id === active);

  const check = () => {
    if (!current) return;
    const r = checkMission(ds, current, selection);
    setFeedback({ id: current.id, ok: r });
    if (r) complete(current.id);
  };

  const selLabel = [selection.hubId && names.hub(selection.hubId), selection.segmentId && names.segment(selection.segmentId)].filter(Boolean).join(' · ');

  return (
    <div className="panel panel--float" style={{ width: 340, maxHeight: '100%', overflowY: 'auto' }}>
      <div className="row between">
        <span className="meta">Missões analíticas · {doneCount}/{missions.length}</span>
        <button className="icon-btn" style={{ border: 0, background: 'none', height: 24, minWidth: 24, padding: 0 }} onClick={onClose} aria-label="Fechar missões">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="bar-track" style={{ margin: '10px 0 12px' }}>
        <div className="bar-fill" style={{ width: `${(doneCount / missions.length) * 100}%` }} />
      </div>
      {!current &&
        missions.map((m) => (
          <button key={m.id} className="list__row" style={{ gridTemplateColumns: '18px 1fr' }} onClick={() => { setActive(m.id); setFeedback(null); }}>
            <span className={done[m.id] ? 'good' : 'muted'}>{done[m.id] ? '✓' : '○'}</span>
            <span style={{ fontSize: 13 }}>{m.title}</span>
          </button>
        ))}
      {current && (
        <div className="stack" style={{ gap: 10 }}>
          <button className="btn btn--sm btn--ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setActive(null)}>← Todas as missões</button>
          <h3 className="h3">{current.title}</h3>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>{current.brief}</p>
          <div className="mono muted" style={{ fontSize: 11 }}>Critério: {current.criterion}</div>
          <div className="muted" style={{ fontSize: 12 }}>Dica: {current.hint}</div>
          <div className="panel" style={{ padding: 10 }}>
            <div className="meta">Sua resposta (seleção atual)</div>
            <div style={{ marginTop: 4 }}>{selLabel || <span className="muted">Selecione um objeto na Galaxy</span>}</div>
          </div>
          <button className="btn btn--primary btn--sm" onClick={check} disabled={!selection.hubId && !selection.segmentId}>
            Verificar resposta
          </button>
          {feedback?.id === current.id && feedback.ok === true && (
            <div className="good" role="status">✓ Correto — {current.answerLabel}. {current.evidence}</div>
          )}
          {feedback?.id === current.id && feedback.ok === false && (
            <div className="bad" role="status">Ainda não. {current.target === 'segment' ? 'O segmento' : current.target === 'region' ? 'A região' : 'O hub'} selecionado não atende ao critério.</div>
          )}
          {feedback?.id === current.id && feedback.ok === null && <div className="warn" role="status">Selecione um objeto antes de verificar.</div>}
          {done[current.id] && feedback?.id !== current.id && <div className="good">✓ Concluída anteriormente — {current.answerLabel}.</div>}
        </div>
      )}
    </div>
  );
}
