import { MODULES } from '../app/modules';
import { fmtMonth, fmtRange } from '../lib/format';
import { useFilteredRows } from '../state/derived';
import { useDataset, useStore, type Mode } from '../state/store';
import { Icon, Logo } from './Icon';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'immersive', label: 'Imersivo', hint: 'Exploração 3D em tela cheia' },
  { id: 'analytical', label: 'Analítico', hint: 'Acesso completo a métricas e dados' },
  { id: 'executive', label: 'Executivo', hint: 'Leitura rápida: indicadores, riscos e ações' },
];

export function TopBar({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const module = useStore((s) => s.module);
  const mode = useStore((s) => s.mode);
  const setModule = useStore((s) => s.setModule);
  const setMode = useStore((s) => s.setMode);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const favCount = useStore((s) => s.favorites.length);

  const changeMode = (m: Mode) => {
    setMode(m);
    if (m === 'immersive' && module !== 'galaxy' && module !== 'temporal') setModule('galaxy');
  };

  return (
    <header className="topbar">
      <button className="brand" onClick={() => setModule('command')} aria-label="AI Data Universe — ir para o Command Center">
        <Logo />
        <span className="brand__word desktop-only">
          AI DATA <b>UNIVERSE</b>
        </span>
      </button>
      {mode !== 'executive' && (
        <nav className="nav desktop-only" aria-label="Módulos">
          {MODULES.map((m) => (
            <button key={m.id} className="nav__item" aria-current={module === m.id ? 'page' : undefined} onClick={() => setModule(m.id)} title={m.description}>
              <span className="nav__idx">{m.index}</span>
              <span className="nav__label">{m.short}</span>
            </button>
          ))}
        </nav>
      )}
      <span className="topbar__spacer" />
      <div className="seg" role="group" aria-label="Modo de visualização">
        {MODES.map((m) => (
          <button key={m.id} aria-pressed={mode === m.id} onClick={() => changeMode(m.id)} title={m.hint}>
            {m.label}
          </button>
        ))}
      </div>
      <button className="icon-btn" onClick={() => setPaletteOpen(true)} aria-label="Busca global (Ctrl+K)">
        <Icon name="search" />
        <span className="kbd desktop-only">Ctrl K</span>
      </button>
      <button className="icon-btn desktop-only" onClick={onOpenLibrary} aria-label="Favoritos e histórico">
        <Icon name="star" />
        {favCount > 0 && <span className="mono" style={{ fontSize: 11 }}>{favCount}</span>}
      </button>
    </header>
  );
}

export function TabBar() {
  const module = useStore((s) => s.module);
  const mode = useStore((s) => s.mode);
  const setModule = useStore((s) => s.setModule);
  if (mode === 'executive') return null;
  return (
    <nav className="tabbar" aria-label="Módulos">
      {MODULES.map((m) => (
        <button key={m.id} aria-current={module === m.id ? 'page' : undefined} onClick={() => setModule(m.id)}>
          <span className="mono" style={{ fontSize: 10 }}>{m.index}</span>
          {m.short}
        </button>
      ))}
    </nav>
  );
}

export function StatusBar() {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  const rows = useFilteredRows();
  return (
    <footer className="status">
      <span className="status__live" title="Instantâneo estático; não há conexão com sistemas em tempo real">
        {ds.meta.synthetic ? 'DEMONSTRATION DATA — FOR PORTFOLIO PURPOSES' : ds.meta.name.toUpperCase()}
      </span>
      <span className="status__hide-sm">SRC · {ds.meta.source.toUpperCase()}{ds.meta.seed != null ? ` · SEED ${ds.meta.seed}` : ''}</span>
      <span className="status__hide-sm">AS-OF · {fmtMonth(ds.meta.asOf).toUpperCase()}</span>
      <span>WINDOW · {fmtRange(ds.months, filters.range).toUpperCase()}</span>
      <span>ROWS · {rows.length.toLocaleString('pt-BR')} / {ds.facts.length.toLocaleString('pt-BR')}</span>
    </footer>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-tone={t.tone} onClick={() => dismiss(t.id)}>
          {t.tone === 'error' ? '✕ ' : t.tone === 'warn' ? '! ' : '✓ '}
          {t.text}
        </div>
      ))}
    </div>
  );
}
