import type { RegionId } from '../data/schema';
import { fmtMonth } from '../lib/format';
import { useNames } from '../state/derived';
import { useDataset, useStore } from '../state/store';
import { REGION_COLORS } from '../styles/tokens';
import { Icon } from './Icon';
import { MultiSelect } from './MultiSelect';

/** Global filters. Every module reads the same filter state from the store. */
export function FilterRail() {
  const ds = useDataset();
  const names = useNames();
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const resetAll = useStore((s) => s.resetAll);
  const n = ds.months.length;
  const [a, b] = filters.range;
  const len = b - a + 1;

  const preset = (k: number) => setFilters({ range: [Math.max(0, n - k), n - 1] });
  const toggleRegion = (r: RegionId) =>
    setFilters({ regions: filters.regions.includes(r) ? filters.regions.filter((x) => x !== r) : [...filters.regions, r] });

  return (
    <div className="rail" role="region" aria-label="Filtros globais">
      <div className="rail__group">
        <span className="meta desktop-only">Período</span>
        <label className="sr-only" htmlFor="f-start">Mês inicial</label>
        <select id="f-start" className="select" value={a} onChange={(e) => setFilters({ range: [Number(e.target.value), b] })}>
          {ds.months.map((m, i) => (
            <option key={m} value={i} disabled={i > b}>
              {fmtMonth(m)}
            </option>
          ))}
        </select>
        <span className="muted">→</span>
        <label className="sr-only" htmlFor="f-end">Mês final</label>
        <select id="f-end" className="select" value={b} onChange={(e) => setFilters({ range: [a, Number(e.target.value)] })}>
          {ds.months.map((m, i) => (
            <option key={m} value={i} disabled={i < a}>
              {fmtMonth(m)}
            </option>
          ))}
        </select>
        <div className="seg" role="group" aria-label="Atalhos de período">
          {[3, 6, 12, n].map((k) => (
            <button key={k} aria-pressed={len === k && b === n - 1} onClick={() => preset(k)}>
              {k === n ? 'Tudo' : `${k}M`}
            </button>
          ))}
        </div>
      </div>
      <span className="rail__sep" />
      <div className="rail__group" role="group" aria-label="Regiões">
        {ds.regions.map((r) => (
          <button key={r.id} className="chip" aria-pressed={filters.regions.includes(r.id)} onClick={() => toggleRegion(r.id)}>
            <span className="chip__dot" style={{ background: REGION_COLORS[r.id] }} />
            {r.name}
          </button>
        ))}
      </div>
      <span className="rail__sep" />
      <div className="rail__group">
        <MultiSelect label="Segmento" options={ds.segments} value={filters.segments} onChange={(v) => setFilters({ segments: v })} />
        <MultiSelect label="Serviço" options={ds.services} value={filters.services} onChange={(v) => setFilters({ services: v })} />
        <MultiSelect label="Hub" options={ds.hubs.map((h) => ({ id: h.id, name: `${h.name} · ${h.uf}`, color: REGION_COLORS[h.region] }))} value={filters.hubs} onChange={(v) => setFilters({ hubs: v })} />
      </div>
      {(selection.hubId || selection.segmentId) && (
        <>
          <span className="rail__sep" />
          <button className="chip chip--x" aria-pressed="true" onClick={() => select({})} title="Limpar seleção">
            <Icon name="target" size={12} />
            {[selection.hubId && names.hub(selection.hubId), selection.segmentId && names.segment(selection.segmentId)].filter(Boolean).join(' · ')}
          </button>
        </>
      )}
      <span style={{ flex: 1 }} />
      <button className="btn btn--sm btn--ghost" onClick={resetAll} title="Restaura filtros, seleção e câmera">
        <Icon name="reset" size={14} /> Redefinir
      </button>
    </div>
  );
}
