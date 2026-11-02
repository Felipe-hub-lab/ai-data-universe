import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';

interface Props {
  label: string;
  options: { id: string; name: string; color?: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}

/** Accessible multi-select popover. Empty selection means "all". */
export function MultiSelect({ label, options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const r = btn.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 220) });
    const onDoc = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    setTimeout(() => panel.current?.querySelector<HTMLButtonElement>('button')?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const summary =
    value.length === 0 ? 'Todos' : value.length === 1 ? options.find((o) => o.id === value[0])?.name ?? value[0] : `${value.length} selecionados`;
  const toggle = (oid: string) => onChange(value.includes(oid) ? value.filter((v) => v !== oid) : [...value, oid]);

  return (
    <div className="dropdown">
      <button
        ref={btn}
        className="chip"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={id}
        aria-pressed={value.length > 0}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="muted">{label}:</span> {summary}
        <Icon name="chevron" size={12} />
      </button>
      {open && (
        <div ref={panel} id={id} className="dropdown__panel" style={{ top: pos.top, left: pos.left }} role="group" aria-label={label}>
          {options.map((o) => {
            const on = value.includes(o.id);
            return (
              <button key={o.id} className="dropdown__opt" role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(o.id)}>
                <span className="check" data-on={on} />
                {o.color && <span className="chip__dot" style={{ background: o.color }} />}
                {o.name}
              </button>
            );
          })}
          <div className="divider" />
          <button className="dropdown__opt" onClick={() => onChange([])}>
            <span className="muted">Limpar seleção (todos)</span>
          </button>
        </div>
      )}
    </div>
  );
}
