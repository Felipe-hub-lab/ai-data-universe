import { useEffect, useMemo, useRef, useState } from 'react';
import { MODULES } from '../app/modules';
import { METRIC_LIST } from '../analytics/metrics';
import { useOverview } from '../state/derived';
import { useDataset, useStore } from '../state/store';

interface Item {
  id: string;
  kind: string;
  label: string;
  hint?: string;
  run: () => void;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Global search across modules, indicators, entities, findings and records. */
export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  if (!open) return null;
  return <PaletteBody onClose={() => setOpen(false)} />;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const ds = useDataset();
  const o = useOverview();
  const st = useStore.getState;
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const all = useMemo<Item[]>(() => {
    const go = (m: Parameters<ReturnType<typeof st>['setModule']>[0]) => st().setModule(m);
    return [
      ...MODULES.map((m) => ({ id: `m-${m.id}`, kind: 'Área', label: `${m.index} ${m.name}`, hint: m.description, run: () => go(m.id) })),
      ...METRIC_LIST.map((m) => ({ id: `k-${m.id}`, kind: 'Indicador', label: m.name, hint: m.formula, run: () => st().openKpi(m.id) })),
      ...ds.hubs.map((h) => ({
        id: `h-${h.id}`,
        kind: 'Hub',
        label: `${h.name} · ${h.uf}`,
        hint: 'Selecionar na Data Galaxy',
        run: () => {
          st().select({ hubId: h.id });
          go('galaxy');
        },
      })),
      ...ds.regions.map((r) => ({ id: `r-${r.id}`, kind: 'Região', label: r.name, hint: 'Filtrar região', run: () => st().setFilters({ regions: [r.id] }) })),
      ...ds.segments.map((s) => ({ id: `s-${s.id}`, kind: 'Segmento', label: s.name, hint: 'Filtrar segmento', run: () => st().setFilters({ segments: [s.id] }) })),
      ...ds.services.map((s) => ({ id: `v-${s.id}`, kind: 'Serviço', label: s.name, hint: `SLA ${s.slaDays} dia(s) · filtrar`, run: () => st().setFilters({ services: [s.id] }) })),
      ...o.findings.map((f) => ({ id: `f-${f.id}`, kind: 'Descoberta', label: f.title, hint: f.fact, run: () => go('command') })),
      { id: 'a-reset', kind: 'Ação', label: 'Redefinir filtros, seleção e câmera', run: () => st().resetAll() },
      { id: 'a-exec', kind: 'Ação', label: 'Abrir modo executivo', run: () => st().setMode('executive') },
    ];
  }, [ds, o.findings, st]);

  const items = useMemo(() => {
    const nq = norm(q.trim());
    const base = nq ? all.filter((i) => norm(`${i.kind} ${i.label} ${i.hint ?? ''}`).includes(nq)) : all.slice(0, 14);
    const res = base.slice(0, 40);
    if (nq.length >= 2)
      res.push({
        id: 'rec',
        kind: 'Registros',
        label: `Buscar “${q.trim()}” nos registros de origem`,
        hint: 'Abre o Data Explorer com a busca aplicada',
        run: () => {
          st().setExplorerQuery(q.trim());
          st().setModule('explorer');
        },
      });
    return res;
  }, [q, all, st]);

  const run = (i: Item | undefined) => {
    if (!i) return;
    i.run();
    if (st().mode === 'executive' && i.kind !== 'Ação') st().setMode('analytical');
    onClose();
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Busca global">
        <input
          ref={input}
          className="palette__input"
          placeholder="Buscar áreas, indicadores, hubs, regiões, segmentos, descobertas…"
          value={q}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={items[active] ? `pi-${items[active].id}` : undefined}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            }
            if (e.key === 'Enter') run(items[active]);
          }}
        />
        <div className="palette__list" role="listbox" id="palette-list">
          {items.length === 0 && <div className="state" style={{ minHeight: 100 }}>Nenhum resultado.</div>}
          {items.map((i, idx) => (
            <button
              key={i.id}
              id={`pi-${i.id}`}
              role="option"
              aria-selected={idx === active}
              className="palette__item"
              onMouseEnter={() => setActive(idx)}
              onClick={() => run(i)}
            >
              <span className="meta">{i.kind}</span>
              <span style={{ overflow: 'hidden' }}>
                <span style={{ display: 'block', color: 'var(--text)' }}>{i.label}</span>
                {i.hint && <span className="muted clamp-2" style={{ fontSize: 12 }}>{i.hint}</span>}
              </span>
              <span className="kbd">↵</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
