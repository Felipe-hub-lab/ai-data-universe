import { useState } from 'react';
import { linear, useWidth } from './scale';

export interface BarItem {
  key: string;
  label: string;
  value: number;
  display: string;
  color?: string;
  /** Optional secondary annotation (e.g. variation), rendered in text tokens. */
  note?: { text: string; sentiment: -1 | 0 | 1 };
}

/** Horizontal ranked bars. Clicking a bar cross-filters (when onSelect is given). */
export function BarList({
  items,
  selected = [],
  onSelect,
  max,
  ariaLabel,
}: {
  items: BarItem[];
  selected?: string[];
  onSelect?: (key: string) => void;
  max?: number;
  ariaLabel: string;
}) {
  const top = max ?? Math.max(...items.map((i) => Math.abs(i.value)), 0);
  const dim = selected.length > 0;
  return (
    <div className="stack" style={{ gap: 4 }} role="list" aria-label={ariaLabel}>
      {items.map((it) => {
        const on = selected.includes(it.key);
        const Tag = onSelect ? 'button' : 'div';
        return (
          <Tag
            key={it.key}
            role="listitem"
            {...(onSelect ? { onClick: () => onSelect(it.key), 'aria-pressed': on, type: 'button' as const } : {})}
            className="barrow"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(84px, 128px) 1fr auto',
              alignItems: 'center',
              gap: 10,
              padding: '5px 4px',
              background: on ? 'rgba(0,229,255,.06)' : 'none',
              border: 0,
              borderRadius: 4,
              textAlign: 'left',
              opacity: dim && !on ? 0.5 : 1,
              color: 'var(--text)',
              width: '100%',
            }}
          >
            <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.label}>
              {it.label}
            </span>
            <span className="bar-track" style={{ height: 8 }}>
              <span
                className="bar-fill"
                style={{ display: 'block', width: `${top > 0 ? (Math.abs(it.value) / top) * 100 : 0}%`, background: it.color ?? 'var(--cyan)', borderRadius: '0 4px 4px 0' }}
              />
            </span>
            <span className="row" style={{ gap: 8, justifyContent: 'flex-end', minWidth: 120 }}>
              <span className="mono" style={{ fontSize: 12 }}>{it.display}</span>
              {it.note && (
                <span className="delta" data-s={it.note.sentiment} style={{ minWidth: 64, justifyContent: 'flex-end' }}>
                  {it.note.text}
                </span>
              )}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

/** 100% stacked bar for part-to-whole, with a legend that also carries values. */
export function ShareBar({ parts, ariaLabel }: { parts: { key: string; label: string; value: number; color: string; display: string }[]; ariaLabel: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="stack" aria-label={ariaLabel} role="img">
      <div style={{ display: 'flex', height: 14, gap: 2 }}>
        {parts.map((p) => (
          <div
            key={p.key}
            onMouseEnter={() => setHover(p.key)}
            onMouseLeave={() => setHover(null)}
            title={`${p.label}: ${p.display} (${((p.value / total) * 100).toFixed(1).replace('.', ',')}%)`}
            style={{
              flex: `${p.value} 0 0`,
              background: p.color,
              borderRadius: 2,
              opacity: hover && hover !== p.key ? 0.4 : 1,
              transition: 'opacity 120ms',
              minWidth: 2,
            }}
          />
        ))}
      </div>
      <div className="row wrap" style={{ gap: '6px 16px' }}>
        {parts.map((p) => (
          <span key={p.key} className="row" style={{ gap: 6, fontSize: 12 }} onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}>
            <span className="swatch swatch--box" style={{ background: p.color }} />
            <span className="muted">{p.label}</span>
            <span className="mono">{((p.value / total) * 100).toFixed(1).replace('.', ',')}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Vertical histogram with hover tooltips. */
export function Histogram({
  bins,
  formatX,
  height = 180,
  ariaLabel,
  marker,
}: {
  bins: { x0: number; x1: number; count: number }[];
  formatX: (v: number) => string;
  height?: number;
  ariaLabel: string;
  marker?: { value: number; label: string };
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 8, r: 8, t: 10, b: 24 };
  const maxC = Math.max(1, ...bins.map((b) => b.count));
  const x0 = bins[0]?.x0 ?? 0;
  const x1 = bins[bins.length - 1]?.x1 ?? 1;
  const x = linear(x0, x1, pad.l, Math.max(pad.l + 1, width - pad.r));
  const y = linear(0, maxC, height - pad.b, pad.t);
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <line className="axis-line" x1={pad.l} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} />
          {bins.map((b, i) => (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x(b.x0)} y={pad.t} width={Math.max(1, x(b.x1) - x(b.x0))} height={height - pad.b - pad.t} fill="transparent" />
              <path
                d={roundedTop(x(b.x0) + 1, y(b.count), Math.max(1, x(b.x1) - x(b.x0) - 2), height - pad.b - y(b.count))}
                fill={hover === i ? 'var(--cyan)' : 'rgba(0,229,255,.55)'}
              />
            </g>
          ))}
          {[0, Math.floor(bins.length / 2), bins.length - 1].map((i) =>
            bins[i] ? (
              <text key={i} x={x((bins[i].x0 + bins[i].x1) / 2)} y={height - 8} textAnchor="middle">
                {formatX((bins[i].x0 + bins[i].x1) / 2)}
              </text>
            ) : null,
          )}
          {marker && Number.isFinite(marker.value) && (
            <g>
              <line x1={x(marker.value)} x2={x(marker.value)} y1={pad.t - 4} y2={height - pad.b} stroke="var(--warn)" strokeDasharray="3 3" />
              <text x={x(marker.value) + 4} y={pad.t + 4} style={{ fill: 'var(--warn)' }}>
                {marker.label}
              </text>
            </g>
          )}
        </svg>
      )}
      {hover != null && bins[hover] && (
        <div className="chart-tip" style={{ left: Math.min(x(bins[hover].x0), width - 170), top: 0 }}>
          <div className="mono">
            {formatX(bins[hover].x0)} – {formatX(bins[hover].x1)}
          </div>
          <div className="muted">{bins[hover].count} combinações hub × segmento</div>
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number) {
  const r = Math.min(3, w / 2, h);
  if (h <= 0) return '';
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Sparkline (no axes) — used inside KPI instruments. */
export function Sparkline({ values, color = 'var(--cyan)', width = 120, height = 28, highlight }: { values: number[]; color?: string; width?: number; height?: number; highlight?: [number, number] }) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const x = linear(0, values.length - 1, 1, width - 1);
  const y = linear(lo, hi, height - 2, 2);
  const d = values.map((val, i) => (Number.isFinite(val) ? `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(val).toFixed(1)}` : '')).join('');
  return (
    <svg width={width} height={height} aria-hidden="true">
      {highlight && <rect x={x(highlight[0])} y={0} width={Math.max(2, x(highlight[1]) - x(highlight[0]))} height={height} fill="rgba(0,229,255,.07)" />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.5} fill={color} />
    </svg>
  );
}
