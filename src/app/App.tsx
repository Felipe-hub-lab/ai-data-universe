import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createDataSource } from '../data/source';
import { CommandPalette } from '../components/CommandPalette';
import { FilterRail } from '../components/FilterRail';
import { Intro, type BootStep } from '../components/Intro';
import { KpiDrawer } from '../components/Kpi';
import { Library } from '../components/Library';
import { StatusBar, TabBar, Toasts, TopBar } from '../components/Shell';
import { ErrorBoundary, ErrorState, Skeleton } from '../components/States';
import { buildOverview } from '../analytics/insights';
import { useReducedMotion, webglAvailable } from '../lib/env';
import { defaultFilters, useStore, type ModuleId } from '../state/store';
import { MODULES, moduleById } from './modules';

const CommandCenter = lazy(() => import('../modules/CommandCenter'));
const Galaxy = lazy(() => import('../modules/Galaxy'));
const Temporal = lazy(() => import('../modules/Temporal'));
const Lab = lazy(() => import('../modules/Lab'));
const Anomaly = lazy(() => import('../modules/Anomaly'));
const BI = lazy(() => import('../modules/BI'));
const Explorer = lazy(() => import('../modules/Explorer'));
const Executive = lazy(() => import('../modules/Executive'));

const VIEWS: Record<ModuleId, React.LazyExoticComponent<() => JSX.Element>> = {
  command: CommandCenter,
  galaxy: Galaxy,
  temporal: Temporal,
  lab: Lab,
  anomaly: Anomaly,
  bi: BI,
  explorer: Explorer,
};

const initialSteps = (): BootStep[] => [
  { id: 'data', label: 'Gerando conjunto de dados', status: 'pending' },
  { id: 'agg', label: 'Calculando agregados e detecção de anomalias', status: 'pending' },
  { id: 'gl', label: 'Verificando suporte a WebGL', status: 'pending' },
  { id: '3d', label: 'Carregando motor 3D (three.js)', status: 'pending' },
];

const readHash = (): ModuleId | null => {
  const id = location.hash.replace(/^#\/?/, '') as ModuleId;
  return MODULES.some((m) => m.id === id) ? id : null;
};

export function App() {
  const dataset = useStore((s) => s.dataset);
  const module = useStore((s) => s.module);
  const mode = useStore((s) => s.mode);
  const kpiOpen = useStore((s) => s.kpiOpen);
  const introSeen = useStore((s) => s.introSeen);
  const reducedMotion = useReducedMotion();
  const [steps, setSteps] = useState<BootStep[]>(initialSteps);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [library, setLibrary] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const booted = useRef(false);

  const step = (id: string, status: BootStep['status'], detail?: string) =>
    setSteps((s) => s.map((x) => (x.id === id ? { ...x, status, detail } : x)));

  // ---- boot: every step shown on screen is real work ------------------------------
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        setLoadError(null);
        const source = createDataSource();
        step('data', 'running', source.label);
        const t0 = performance.now();
        const ds = await source.load(ctrl.signal);
        if (ctrl.signal.aborted) return;
        step('data', 'done', `${ds.facts.length.toLocaleString('pt-BR')} registros · ${Math.round(performance.now() - t0)} ms`);
        step('agg', 'running');
        await new Promise((r) => setTimeout(r, 0));
        const t1 = performance.now();
        const o = buildOverview(ds, defaultFilters(ds));
        step('agg', 'done', `${o.anomalies.length} observações atípicas · ${Math.round(performance.now() - t1)} ms`);
        useStore.getState().setDataset(ds);
        const hashModule = readHash();
        if (hashModule) useStore.getState().setModule(hashModule);
        const gl = webglAvailable();
        step('gl', 'done', gl ? 'disponível' : 'indisponível — visualizações alternativas em 2D');
        if (gl) {
          step('3d', 'running');
          import('../three/GalaxyScene')
            .then(() => step('3d', 'done'))
            .catch((e) => step('3d', 'error', String(e?.message ?? e)));
        } else step('3d', 'done', 'ignorado');
        booted.current = true;
      } catch (e) {
        if (ctrl.signal.aborted) return;
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
        setSteps((s) => s.map((x) => (x.status === 'running' ? { ...x, status: 'error', detail: msg } : x)));
      }
    })();
    return () => ctrl.abort();
  }, [attempt]);

  // ---- hash routing (works on static hosts without rewrites) ----------------------
  useEffect(() => {
    if (!dataset) return;
    if (readHash() !== module) history.replaceState(null, '', `#/${module}`);
  }, [module, dataset]);
  useEffect(() => {
    const on = () => {
      const m = readHash();
      if (m) useStore.getState().setModule(m);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  // ---- global shortcuts ------------------------------------------------------------
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useStore.getState().setPaletteOpen(!useStore.getState().paletteOpen);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // ---- exploration history: snapshot after the state settles ------------------------
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const unsub = useStore.subscribe((s, p) => {
      if (!s.dataset || (s.module === p.module && s.filters === p.filters && s.selection === p.selection)) return;
      clearTimeout(t);
      t = setTimeout(() => {
        const st = useStore.getState();
        const what = st.module !== p.module ? 'Navegou para' : st.selection !== p.selection ? 'Seleção em' : 'Filtros em';
        st.pushHistory(`${what} ${moduleById(st.module).name}`);
      }, 900);
    });
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

  const finishIntro = useCallback(() => {
    setShowIntro(false);
    useStore.getState().setIntroSeen(true);
  }, []);

  const View = VIEWS[module];
  const executive = mode === 'executive';

  return (
    <>
      {showIntro && (
        <Intro
          steps={steps}
          ready={!!dataset && booted.current}
          onDone={finishIntro}
          reducedMotion={reducedMotion || introSeen}
        />
      )}
      {loadError && (
        <div className="intro" style={{ zIndex: 210 }}>
          <ErrorState title="Não foi possível carregar os dados" detail={loadError} onRetry={() => { setSteps(initialSteps()); setAttempt((a) => a + 1); }} />
        </div>
      )}
      {dataset && (
        <div className="app" data-mode={mode}>
          <TopBar onOpenLibrary={() => setLibrary(true)} />
          <FilterRail />
          <main className="main" id="main" aria-label={executive ? 'Modo executivo' : moduleById(module).name}>
            <ErrorBoundary key={executive ? 'exec' : module} label={executive ? 'Modo executivo' : moduleById(module).name}>
              <Suspense fallback={<div className="page"><Skeleton h={80} /><div style={{ height: 16 }} /><Skeleton h={320} /></div>}>
                {executive ? <Executive /> : <View />}
              </Suspense>
            </ErrorBoundary>
          </main>
          <TabBar />
          <StatusBar />
          <CommandPalette />
          {library && <Library onClose={() => setLibrary(false)} />}
          {kpiOpen && <KpiDrawer id={kpiOpen} onClose={() => useStore.getState().openKpi(null)} />}
          <Toasts />
        </div>
      )}
    </>
  );
}
