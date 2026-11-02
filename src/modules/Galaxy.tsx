import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { applyFilters, groupTotals } from '../analytics/aggregate';
import { METRICS } from '../analytics/metrics';
import { laneRoutes } from '../data/synthetic';
import { Icon } from '../components/Icon';
import { EmptyState, NoResults } from '../components/States';
import { deviceTier, useIsMobile, useReducedMotion, webglAvailable } from '../lib/env';
import { fmtBRL0, fmtPct } from '../lib/format';
import { useEntities, useOverview } from '../state/derived';
import { useDataset, useStore } from '../state/store';
import { REGION_COLORS } from '../styles/tokens';
import type { CameraGoal } from '../three/common';
import { hubPositions } from '../three/common';
import { COLOR_MODES, domainOf, entityColor, SCATTER, sizeScale } from './galaxy/encoding';
import { Galaxy2D } from './galaxy/Galaxy2D';
import { Legend, MissionsPanel, SelectionPanel, Tooltip, useHover } from './galaxy/Hud';

const GalaxyScene = lazy(() => import('../three/GalaxyScene'));

const HOME = {
  geo: { position: [0.6, 19.5, 15.5] as [number, number, number], target: [0.6, 0, 2.4] as [number, number, number] },
  scatter: { position: [11, 8.5, 12] as [number, number, number], target: [0, 3, 0] as [number, number, number] },
};

interface TourStep {
  title: string;
  text: string;
  hubId?: string;
  layout: 'geo' | 'scatter';
  colorBy: 'region' | 'growth' | 'onTimeRate' | 'margin' | 'anomaly';
}

export default function Galaxy() {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  const galaxy = useStore((s) => s.galaxy);
  const setGalaxy = useStore((s) => s.setGalaxy);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const resetToken = useStore((s) => s.cameraResetToken);
  const mode = useStore((s) => s.mode);
  const entities = useEntities();
  const o = useOverview();
  const reduced = useReducedMotion();
  const mobile = useIsMobile();
  const setHover = useHover((s) => s.set);
  const stage = useRef<HTMLDivElement>(null);
  const [isolate, setIsolate] = useState<{ kind: 'region' | 'segment'; id: string } | null>(null);
  const [focusHub, setFocusHub] = useState<string | null>(selection.hubId ?? null);
  const [focusKey, setFocusKey] = useState(0);
  const [panel, setPanel] = useState<'none' | 'missions'>('none');
  const [tour, setTour] = useState<number | null>(null);
  const gl = webglAvailable();
  const tier = useMemo(() => deviceTier(), []);

  useEffect(() => () => setHover(null), [setHover]);
  // Global reset (not the initial mount, which may arrive with a hub to focus).
  const lastReset = useRef(resetToken);
  useEffect(() => {
    if (lastReset.current === resetToken) return;
    lastReset.current = resetToken;
    setIsolate(null);
    setFocusHub(null);
    setTour(null);
  }, [resetToken]);

  const network = o.current;
  const colors = useMemo(() => entities.map((e) => entityColor(e, galaxy.colorBy, network)), [entities, galaxy.colorBy, network]);
  const size = useMemo(() => sizeScale(entities), [entities]);
  const domains = useMemo(
    () => ({
      x: domainOf(entities.map((e) => e.m[SCATTER.x.metric])),
      y: domainOf(entities.map((e) => e.m[SCATTER.y.metric])),
      z: domainOf(entities.map((e) => e.m[SCATTER.z.metric])),
    }),
    [entities],
  );
  const hubRevenue = useMemo(() => new Map(o.hubs.map((g) => [g.key, g.metrics.revenue])), [o.hubs]);
  const hubColors = useMemo(() => new Map(ds.hubs.map((h) => [h.id, REGION_COLORS[h.region]])), [ds.hubs]);
  const anomalyHubs = useMemo(() => {
    const m = new Map<string, number>();
    o.anomalies.forEach((a) => m.set(a.hubId, (m.get(a.hubId) ?? 0) + 1));
    return m;
  }, [o.anomalies]);
  // Lane volume = filtered outbound volume of the origin × the route's routing share.
  const lanes = useMemo(() => {
    const out = groupTotals(applyFilters(ds.facts, filters), (r) => r.hubId);
    return laneRoutes()
      .filter((r) => out.has(r.origin) && out.has(r.destination))
      .map((r) => ({ origin: r.origin, destination: r.destination, shipments: Math.round(out.get(r.origin)!.shipments * r.share) }));
  }, [ds, filters]);
  const hubPos = useMemo(() => hubPositions(ds.hubs), [ds.hubs]);

  const tourSteps = useMemo<TourStep[]>(() => {
    const steps: TourStep[] = [
      { title: 'O universo da rede', text: 'Cada esfera é uma combinação hub × segmento posicionada na geografia do hub. O feixe vertical mede a receita do hub e os arcos são rotas — mais espessos e com mais partículas quando carregam mais volume.', layout: 'geo', colorBy: 'region' },
    ];
    const biggest = [...o.hubs].sort((a, b) => b.metrics.revenue - a.metrics.revenue)[0];
    if (biggest) steps.push({ title: `${biggest.label}: o maior hub`, text: `${biggest.label} concentra ${fmtPct(biggest.metrics.revenue / o.current.revenue)} da receita do recorte (${fmtBRL0(biggest.metrics.revenue)}). Repare na convergência de rotas.`, hubId: biggest.key, layout: 'geo', colorBy: 'region' });
    const growth = o.findings.find((f) => f.id.startsWith('growth-'));
    if (growth?.hubId) steps.push({ title: growth.title, text: `${growth.fact} A cor agora codifica crescimento: ciano = alta, vermelho = queda.`, hubId: growth.hubId, layout: 'geo', colorBy: 'growth' });
    const anomaly = o.anomalies[0];
    if (anomaly) steps.push({ title: 'Onde algo fugiu do padrão', text: `${ds.hubs.find((h) => h.id === anomaly.hubId)?.name}: ${METRICS[anomaly.metric].name} com desvio de ${anomaly.scoreLabel}. Anéis vermelhos pulsantes marcam hubs com observações atípicas — merecem investigação, não são diagnóstico.`, hubId: anomaly.hubId, layout: 'geo', colorBy: 'anomaly' });
    steps.push({ title: 'Espaço analítico', text: 'Mesmos objetos, agora posicionados por métricas: X = pontualidade, Y = margem, Z = ticket. As linhas tracejadas marcam a média da rede: o quadrante superior direito reúne combinações com pontualidade e margem acima da média.', layout: 'scatter', colorBy: 'margin' });
    return steps;
  }, [o, ds.hubs]);

  useEffect(() => {
    if (tour == null) return;
    const s = tourSteps[tour];
    if (!s) return;
    setGalaxy({ layout: s.layout, colorBy: s.colorBy });
    setFocusHub(s.hubId ?? null);
    setFocusKey((k) => k + 1);
    select(s.hubId ? { hubId: s.hubId } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour]);

  const goal: CameraGoal = useMemo(() => {
    const home = HOME[galaxy.layout];
    const key = `${galaxy.layout}|${focusHub}|${focusKey}|${resetToken}`;
    if (galaxy.layout === 'geo' && focusHub && hubPos.has(focusHub)) {
      const p = hubPos.get(focusHub)!;
      return { position: [p.x + 1.2, 4.6, p.z + 5], target: [p.x, 0.6, p.z], key };
    }
    // Phones: same framing, further away so the whole map fits the narrow viewport.
    const k = mobile ? 1.7 : 1;
    const position = home.position.map((v, i) => home.target[i] + (v - home.target[i]) * k) as [number, number, number];
    return { position, target: home.target, key };
  }, [galaxy.layout, focusHub, focusKey, resetToken, hubPos, mobile]);

  const focus = (hubId: string) => {
    if (galaxy.layout !== 'geo') setGalaxy({ layout: 'geo' });
    setFocusHub(hubId);
    setFocusKey((k) => k + 1);
  };

  if (o.empty) return <div className="page"><NoResults /></div>;

  const immersive = mode === 'immersive';
  const fmtAxis = {
    x: (v: number) => fmtPct(v, 1),
    y: (v: number) => fmtPct(v, 0),
    z: (v: number) => `R$ ${Math.round(v)}`,
  };

  return (
    <div
      className="stage"
      ref={stage}
      tabIndex={0}
      aria-label="Data Galaxy. Use o mouse para girar e aproximar; W A S D ou setas para mover; mais e menos para zoom."
      style={{ outline: 'none' }}
    >
      {gl ? (
        <Suspense fallback={<div className="state">Carregando motor 3D…</div>}>
          <GalaxyScene
            hubs={ds.hubs}
            hubRevenue={hubRevenue}
            hubColors={hubColors}
            anomalyHubs={anomalyHubs}
            entities={entities}
            colors={colors}
            size={size}
            segmentOrder={ds.segments.map((s) => s.id)}
            layout={galaxy.layout}
            domains={domains}
            axisFormat={fmtAxis}
            network={network}
            lanes={lanes}
            flows={galaxy.flows}
            selection={selection}
            isolate={isolate}
            showAnomalyRings={galaxy.colorBy === 'anomaly' || galaxy.colorBy === 'region'}
            onHover={setHover}
            onSelect={select}
            cameraGoal={goal}
            reducedMotion={reduced}
            tier={tier}
            stageRef={stage}
          />
        </Suspense>
      ) : (
        <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
          <Galaxy2D entities={entities} colors={colors} size={size} domains={domains} format={fmtAxis} selection={selection} onHover={setHover} onSelect={select} />
        </div>
      )}
      {entities.length === 0 && (
        <div className="hud" style={{ inset: 0, display: 'grid', placeItems: 'center' }}>
          <EmptyState title="Nenhum objeto no recorte" />
        </div>
      )}

      {/* ---- HUD: controls (top-left) ---- */}
      <div className="hud" style={{ top: 16, left: 16, right: mobile ? 16 : undefined }}>
        <div className="panel panel--float panel--hud" style={{ padding: 12, width: mobile ? '100%' : 'auto' }}>
          <div className="row wrap" style={{ gap: 10 }}>
            <div className="stack" style={{ gap: 2, marginRight: 8 }}>
              <span className="meta">02 · Data Galaxy</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{entities.length} OBJ · {lanes.length} ROTAS</span>
            </div>
            {gl && (
              <div className="seg" role="group" aria-label="Layout">
                <button aria-pressed={galaxy.layout === 'geo'} onClick={() => { setGalaxy({ layout: 'geo' }); setFocusHub(null); }}>Mapa da rede</button>
                <button aria-pressed={galaxy.layout === 'scatter'} onClick={() => setGalaxy({ layout: 'scatter' })}>Espaço analítico</button>
              </div>
            )}
            <label className="row" style={{ gap: 6 }}>
              <span className="meta">Cor</span>
              <select className="select" value={galaxy.colorBy} onChange={(e) => setGalaxy({ colorBy: e.target.value as typeof galaxy.colorBy })}>
                {COLOR_MODES.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
            {gl && galaxy.layout === 'geo' && (
              <button className="chip" aria-pressed={galaxy.flows} onClick={() => setGalaxy({ flows: !galaxy.flows })}>
                <Icon name="route" size={12} /> Rotas
              </button>
            )}
            <button className="icon-btn" onClick={() => { setFocusHub(null); setFocusKey((k) => k + 1); }} title="Restaurar câmera" aria-label="Restaurar câmera">
              <Icon name="reset" size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ---- HUD: legend (bottom-left) ---- */}
      {!mobile && (
        <div className="hud" style={{ left: 16, bottom: 16 }}>
          <Legend layout={gl ? galaxy.layout : 'scatter'} colorBy={galaxy.colorBy} isolate={isolate} setIsolate={setIsolate} />
        </div>
      )}

      {/* ---- HUD: selection / missions (right) ---- */}
      <div className="hud" style={{ right: 16, top: mobile ? 'auto' : 16, bottom: mobile ? 16 : 96, left: mobile ? 16 : undefined, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, maxHeight: mobile ? '45%' : undefined }}>
        {panel === 'missions' ? (
          <MissionsPanel onClose={() => setPanel('none')} />
        ) : (
          // Phones: keep the map clear until something is selected.
          (!mobile || selection.hubId) && <SelectionPanel entities={entities} onFocus={focus} />
        )}
      </div>

      {/* ---- HUD: tour + missions launcher (bottom-center) ---- */}
      {!mobile && (
        <div className="hud" style={{ left: '50%', bottom: 16, transform: 'translateX(-50%)', maxWidth: 'min(560px, calc(100% - 700px))', minWidth: 380 }}>
          {tour != null && tourSteps[tour] ? (
            <div className="panel panel--float panel--hud">
              <div className="row between">
                <span className="meta">Visita guiada · {tour + 1}/{tourSteps.length}</span>
                <button className="icon-btn" style={{ border: 0, background: 'none', height: 24, minWidth: 24, padding: 0 }} onClick={() => setTour(null)} aria-label="Encerrar visita">
                  <Icon name="close" size={14} />
                </button>
              </div>
              <h3 className="h3" style={{ margin: '6px 0' }}>{tourSteps[tour].title}</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>{tourSteps[tour].text}</p>
              <div className="row between" style={{ marginTop: 12 }}>
                <button className="btn btn--sm" disabled={tour === 0} onClick={() => setTour(tour - 1)}>← Anterior</button>
                {tour < tourSteps.length - 1 ? (
                  <button className="btn btn--sm btn--primary" onClick={() => setTour(tour + 1)}>Próximo →</button>
                ) : (
                  <button className="btn btn--sm btn--primary" onClick={() => setTour(null)}>Concluir</button>
                )}
              </div>
            </div>
          ) : (
            <div className="panel panel--float" style={{ padding: 10 }}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <span className="mono muted" style={{ fontSize: 10.5 }}>
                  {immersive ? 'MODO IMERSIVO · ' : ''}ARRASTAR girar · SCROLL zoom · BOTÃO DIREITO mover · WASD navegar
                </span>
                <div className="row" style={{ gap: 6 }}>
                  {gl && (
                    <button className="btn btn--sm" onClick={() => setTour(0)}>
                      <Icon name="play" size={12} /> Visita guiada
                    </button>
                  )}
                  <button className="btn btn--sm" onClick={() => setPanel(panel === 'missions' ? 'none' : 'missions')} aria-pressed={panel === 'missions'}>
                    <Icon name="flag" size={12} /> Missões
                  </button>
                </div>
              </div>
              <div className="row wrap" style={{ gap: 4, marginTop: 8 }}>
                <span className="meta" style={{ marginRight: 4 }}>Pontos de interesse</span>
                {[...o.hubs].sort((a, b) => b.metrics.revenue - a.metrics.revenue).slice(0, 5).map((g) => (
                  <button key={g.key} className="chip" style={{ height: 24, fontSize: 11 }} onClick={() => { select({ hubId: g.key }); focus(g.key); }}>
                    {g.key}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <Tooltip entities={entities} colorBy={galaxy.colorBy} network={network} />
    </div>
  );
}
