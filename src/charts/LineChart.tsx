import { useMemo, useState } from 'react';
import { linear, niceTicks, useWidth } from './scale';

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
  /** Draw a soft area under the line (only used for the primary series). */
  area?: boolean;
}

export interface Marker {
  index: number;
  label: string;
  tone: 'up' | 'down' | 'neutral';
}

interface Props {
  series: LineSeries[];
  xLabels: string[];
  format: (v: number) => string;
  height?: number;
  /** Shaded month window (e.g. the selected period). */
  highlight?: [number, number] | null;
  /** Secondary shaded window (e.g. comparison period). */
  compare?: [number, number] | null;
  markers?: Marker[];
  /** Vertical playhead (Temporal Engine). */
  cursor?: number | null;
  onSelectIndex?: (i: number) => void;
  ariaLabel: string;
}

const PAD = { top: 16, right: 16, bottom: 26, left: 64 };

export function LineChart({ series, xLabels, format, height = 240, highlight, compare, markers = [], cursor, onSelectIndex, ariaLabel }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = xLabels.length;

  const { y, ticks } = useMemo(() => {
    const all = series.flatMap((s) => s.values).filter(Number.isFinite);
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const ticks = niceTicks(lo, hi, 4);
    return { y: linear(ticks[0] ?? lo, ticks[ticks.length - 1] ?? hi, height - PAD.bottom, PAD.top), ticks };
  }, [series, height]);
  const x = linear(0, Math.max(1, n - 1), PAD.left, Math.max(PAD.left + 10, width - PAD.right));
  const step = n > 1 ? x(1) - x(0) : 0;

  const path = (vals: number[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(width / 64))));
  const tipIndex = hover ?? null;

  const band = (r: [number, number] | null | undefined, cls: string) =>
    r ? <rect className={cls} x={x(r[0]) - step / 2} y={PAD.top} width={Math.max(step, x(r[1]) - x(r[0]) + step)} height={height - PAD.top - PAD.bottom} /> : null;

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <defs>
            {series.filter((s) => s.area).map((s) => (
              <linearGradient key={s.id} id={`grad-${s.id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <style>{`.hl{fill:rgba(0,229,255,.05)} .cmp{fill:rgba(155,92,255,.07)}`}</style>
          {band(compare, 'cmp')}
          {band(highlight, 'hl')}
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid-line" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {format(t)}
              </text>
            </g>
          ))}
          {xLabels.map((l, i) =>
            i % labelEvery === 0 ? (
              <text key={l} x={x(i)} y={height - 8} textAnchor="middle">
                {l}
              </text>
            ) : null,
          )}
          {series.filter((s) => s.area).map((s) => {
            const d = path(s.values);
            const first = s.values.findIndex(Number.isFinite);
            const last = s.values.length - 1 - [...s.values].reverse().findIndex(Number.isFinite);
            return d ? <path key={`a-${s.id}`} d={`${d}L${x(last)},${height - PAD.bottom}L${x(first)},${height - PAD.bottom}Z`} fill={`url(#grad-${s.id})`} /> : null;
          })}
          {series.map((s) => (
            <path key={s.id} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '4 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {markers.map((m) => {
            const v = series[0]?.values[m.index];
            if (!Number.isFinite(v)) return null;
            const col = m.tone === 'up' ? 'var(--good)' : m.tone === 'down' ? 'var(--bad)' : 'var(--warn)';
            const cy = y(v);
            return (
              <g key={`${m.index}-${m.label}`}>
                <circle cx={x(m.index)} cy={cy} r={5} fill="var(--bg)" stroke={col} strokeWidth={2} />
                <path d={m.tone === 'up' ? `M${x(m.index)},${cy - 16}l4,6h-8z` : m.tone === 'down' ? `M${x(m.index)},${cy + 16}l4,-6h-8z` : ''} fill={col} />
              </g>
            );
          })}
          {cursor != null && cursor >= 0 && (
            <line x1={x(cursor)} x2={x(cursor)} y1={PAD.top - 6} y2={height - PAD.bottom} stroke="var(--cyan)" strokeWidth={1.5} />
          )}
          {tipIndex != null && (
            <g pointerEvents="none">
              <line x1={x(tipIndex)} x2={x(tipIndex)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--line-3)" />
              {series.map((s) =>
                Number.isFinite(s.values[tipIndex]) ? (
                  <circle key={s.id} cx={x(tipIndex)} cy={y(s.values[tipIndex])} r={4} fill={s.color} stroke="var(--bg)" strokeWidth={2} />
                ) : null,
              )}
            </g>
          )}
          {/* Hit targets are full-height columns, wider than the marks. */}
          {xLabels.map((_, i) => (
            <rect
              key={i}
              x={x(i) - step / 2}
              y={0}
              width={Math.max(step, 8)}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelectIndex?.(i)}
              style={{ cursor: onSelectIndex ? 'pointer' : 'default' }}
            />
          ))}
        </svg>
      )}
      {tipIndex != null && width > 0 && (
        <div className="chart-tip" style={{ left: Math.min(x(tipIndex) + 12, width - 190), top: 8 }}>
          <div className="meta" style={{ marginBottom: 4 }}>{xLabels[tipIndex]}</div>
          {series.map((s) => (
            <div key={s.id} className="chart-tip__row">
              <span className="row" style={{ gap: 6 }}>
                <span className="swatch" style={{ background: s.color }} />
                <span className="muted">{s.label}</span>
              </span>
              <b className="mono">{Number.isFinite(s.values[tipIndex]) ? format(s.values[tipIndex]) : '—'}</b>
            </div>
          ))}
          {markers.filter((m) => m.index === tipIndex).map((m) => (
            <div key={m.label} className={m.tone === 'up' ? 'good' : m.tone === 'down' ? 'bad' : 'warn'} style={{ marginTop: 4 }}>
              {m.tone === 'up' ? '▲' : m.tone === 'down' ? '▼' : '◆'} {m.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
