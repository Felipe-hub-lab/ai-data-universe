import { useEffect, useState } from 'react';
import { moduleById } from '../app/modules';
import { fmtRange } from '../lib/format';
import { useDataset, useStore, type Snapshot } from '../state/store';
import { Icon } from './Icon';

/** Favorites and exploration history, both restorable to the exact analysis state. */
export function Library({ onClose }: { onClose: () => void }) {
  const ds = useDataset();
  const favorites = useStore((s) => s.favorites);
  const history = useStore((s) => s.history);
  const restore = useStore((s) => s.restore);
  const toggle = useStore((s) => s.toggleFavorite);
  const toast = useStore((s) => s.toast);
  const [tab, setTab] = useState<'fav' | 'hist'>(favorites.length ? 'fav' : 'hist');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const describe = (s: Snapshot) => {
    const parts = [moduleById(s.module).name, fmtRange(ds.months, s.filters.range)];
    const dims = [...s.filters.regions, ...s.filters.segments, ...s.filters.services, ...s.filters.hubs];
    if (dims.length) parts.push(`${dims.length} filtro(s)`);
    return parts.join(' · ');
  };
  const doRestore = (s: Snapshot) => {
    restore(s);
    toast('Estado de análise restaurado');
    onClose();
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Favoritos e histórico">
        <div className="drawer__head">
          <div className="stack" style={{ gap: 10 }}>
            <span className="meta">Biblioteca de exploração</span>
            <div className="seg" role="tablist">
              <button role="tab" aria-selected={tab === 'fav'} aria-pressed={tab === 'fav'} onClick={() => setTab('fav')}>
                Favoritos ({favorites.length})
              </button>
              <button role="tab" aria-selected={tab === 'hist'} aria-pressed={tab === 'hist'} onClick={() => setTab('hist')}>
                Histórico ({history.length})
              </button>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer__body" style={{ gap: 0 }}>
          {tab === 'fav' && favorites.length === 0 && (
            <div className="state">Marque indicadores, descobertas ou análises com <Icon name="star" size={14} /> para guardá-los aqui. Favoritos persistem neste navegador.</div>
          )}
          {tab === 'fav' &&
            favorites.map((f) => (
              <div key={f.id} className="list__row" style={{ gridTemplateColumns: '1fr auto' }}>
                <button className="stack" style={{ gap: 2, background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => doRestore(f.snapshot)}>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="badge">{f.kind}</span>
                    <b style={{ fontWeight: 500 }}>{f.label}</b>
                  </span>
                  {f.detail && <span className="muted" style={{ fontSize: 12 }}>{f.detail}</span>}
                  <span className="meta" style={{ textTransform: 'none' }}>{describe(f.snapshot)}</span>
                </button>
                <button className="icon-btn" onClick={() => toggle(f)} aria-label={`Remover ${f.label}`}>
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          {tab === 'hist' && history.length === 0 && <div className="state">O histórico registra automaticamente cada mudança de área, filtro ou seleção.</div>}
          {tab === 'hist' &&
            history.map((h) => (
              <button key={h.id} className="list__row" style={{ gridTemplateColumns: '64px 1fr auto' }} onClick={() => doRestore(h)}>
                <span className="mono muted" style={{ fontSize: 11 }}>
                  {new Date(h.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="stack" style={{ gap: 2 }}>
                  <span>{h.label}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{describe(h)}</span>
                </span>
                <span className="muted" style={{ fontSize: 12 }}>Restaurar</span>
              </button>
            ))}
        </div>
      </aside>
    </>
  );
}
