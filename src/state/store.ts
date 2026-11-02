import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { Filters } from '../analytics/aggregate';
import type { MetricId } from '../analytics/metrics';
import type { AnalysisResult } from '../ai/types';
import type { Dataset } from '../data/schema';

export type ModuleId = 'command' | 'galaxy' | 'temporal' | 'lab' | 'anomaly' | 'bi' | 'explorer';
export type Mode = 'immersive' | 'analytical' | 'executive';
export type GalaxyLayout = 'geo' | 'scatter';
export type GalaxyColor = 'region' | 'growth' | 'onTimeRate' | 'margin' | 'anomaly';

export interface Selection {
  hubId?: string;
  segmentId?: string;
}

export interface Snapshot {
  id: string;
  at: number;
  label: string;
  module: ModuleId;
  filters: Filters;
  selection: Selection;
}

export interface Favorite {
  id: string;
  kind: 'kpi' | 'finding' | 'view' | 'analysis';
  label: string;
  detail?: string;
  snapshot: Snapshot;
}

export interface Toast {
  id: number;
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

interface State {
  dataset: Dataset | null;
  module: ModuleId;
  mode: Mode;
  filters: Filters;
  selection: Selection;
  focusMetric: MetricId;
  galaxy: { layout: GalaxyLayout; colorBy: GalaxyColor; flows: boolean };
  /** Incremented to ask 3D scenes to restore their initial camera. */
  cameraResetToken: number;
  favorites: Favorite[];
  history: Snapshot[];
  missionsDone: Record<string, number>;
  activeMission: string | null;
  labHistory: AnalysisResult[];
  introSeen: boolean;
  paletteOpen: boolean;
  /** KPI whose detail drawer is open (any module can open it). */
  kpiOpen: MetricId | null;
  /** Text search handed to the Data Explorer from the global search. */
  explorerQuery: string;
  toasts: Toast[];

  setDataset(ds: Dataset): void;
  setModule(m: ModuleId): void;
  setMode(m: Mode): void;
  setFilters(p: Partial<Filters>): void;
  resetAll(): void;
  select(s: Selection): void;
  setFocusMetric(m: MetricId): void;
  setGalaxy(p: Partial<State['galaxy']>): void;
  toggleFavorite(f: Omit<Favorite, 'snapshot'>): void;
  isFavorite(id: string): boolean;
  pushHistory(label: string): void;
  restore(s: Snapshot): void;
  completeMission(id: string): void;
  setActiveMission(id: string | null): void;
  addLabResult(r: AnalysisResult): void;
  updateLabResult(id: string, patch: Partial<AnalysisResult>): void;
  clearLab(): void;
  setIntroSeen(v: boolean): void;
  setPaletteOpen(v: boolean): void;
  openKpi(m: MetricId | null): void;
  setExplorerQuery(q: string): void;
  toast(text: string, tone?: Toast['tone']): void;
  dismissToast(id: number): void;
}

/** localStorage can throw (private mode, blocked storage): degrade to in-memory. */
const memory = new Map<string, string>();
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return memory.get(k) ?? null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      memory.set(k, v);
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      memory.delete(k);
    }
  },
};

export const defaultFilters = (ds: Dataset | null): Filters => {
  const n = ds?.months.length ?? 24;
  return { range: [Math.max(0, n - 6), n - 1], regions: [], segments: [], services: [], hubs: [] };
};

let toastId = 0;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      dataset: null,
      module: 'command',
      mode: 'analytical',
      filters: defaultFilters(null),
      selection: {},
      focusMetric: 'revenue',
      galaxy: { layout: 'geo', colorBy: 'region', flows: true },
      cameraResetToken: 0,
      favorites: [],
      history: [],
      missionsDone: {},
      activeMission: null,
      labHistory: [],
      introSeen: false,
      paletteOpen: false,
      kpiOpen: null,
      explorerQuery: '',
      toasts: [],

      setDataset: (ds) => set({ dataset: ds, filters: defaultFilters(ds) }),
      setModule: (module) => set({ module }),
      setMode: (mode) => set({ mode }),
      setFilters: (p) => {
        const f = { ...get().filters, ...p };
        if (f.range[0] > f.range[1]) f.range = [f.range[1], f.range[0]];
        set({ filters: f });
      },
      resetAll: () =>
        set((s) => ({
          filters: defaultFilters(s.dataset),
          selection: {},
          galaxy: { layout: 'geo', colorBy: 'region', flows: true },
          cameraResetToken: s.cameraResetToken + 1,
        })),
      select: (selection) => set({ selection }),
      setFocusMetric: (focusMetric) => set({ focusMetric }),
      setGalaxy: (p) => set((s) => ({ galaxy: { ...s.galaxy, ...p } })),
      toggleFavorite: (f) =>
        set((s) => {
          if (s.favorites.some((x) => x.id === f.id)) return { favorites: s.favorites.filter((x) => x.id !== f.id) };
          return { favorites: [{ ...f, snapshot: snapshotOf(s, f.label) }, ...s.favorites].slice(0, 50) };
        }),
      isFavorite: (id) => get().favorites.some((f) => f.id === id),
      pushHistory: (label) =>
        set((s) => {
          const snap = snapshotOf(s, label);
          const last = s.history[0];
          if (last && JSON.stringify([last.module, last.filters, last.selection]) === JSON.stringify([snap.module, snap.filters, snap.selection]))
            return {};
          return { history: [snap, ...s.history].slice(0, 40) };
        }),
      restore: (snap) =>
        set((s) => ({ module: snap.module, filters: snap.filters, selection: snap.selection, cameraResetToken: s.cameraResetToken + 1 })),
      completeMission: (id) => set((s) => ({ missionsDone: { ...s.missionsDone, [id]: Date.now() } })),
      setActiveMission: (activeMission) => set({ activeMission }),
      addLabResult: (r) => set((s) => ({ labHistory: [r, ...s.labHistory].slice(0, 25) })),
      updateLabResult: (id, patch) => set((s) => ({ labHistory: s.labHistory.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      clearLab: () => set({ labHistory: [] }),
      setIntroSeen: (introSeen) => set({ introSeen }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      openKpi: (kpiOpen) => set({ kpiOpen }),
      setExplorerQuery: (explorerQuery) => set({ explorerQuery }),
      toast: (text, tone = 'ok') => {
        const id = ++toastId;
        set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
        setTimeout(() => get().dismissToast(id), tone === 'error' ? 7000 : 3800);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'adu-state-v1',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        mode: s.mode,
        favorites: s.favorites,
        history: s.history,
        missionsDone: s.missionsDone,
        labHistory: s.labHistory,
        introSeen: s.introSeen,
        galaxy: s.galaxy,
      }),
    },
  ),
);

function snapshotOf(s: State, label: string): Snapshot {
  return {
    id: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    at: Date.now(),
    label,
    module: s.module,
    filters: s.filters,
    selection: s.selection,
  };
}

/** Non-null dataset accessor for components rendered after loading. */
export function useDataset(): Dataset {
  const ds = useStore((s) => s.dataset);
  if (!ds) throw new Error('Dataset not loaded');
  return ds;
}
