import { useState } from 'react';
import { useWidth } from './scale';

interface Props {
  rows: { key: string; label: string }[];
  cols: string[];
  /** values[row][col]; NaN renders as an empty cell. */
  values: number[][];
  color: (v: number) => string;
  format: (v: number) => string;
  onSelectRow?: (key: string) => void;
  highlightCols?: [number, number] | null;
  ariaLabel: string;
}

/** Row × month heatmap with per-cell hover tooltip. */
export function Heatmap({ rows, cols, values, color, format, onSelectRow, highlightCols, ariaLabel }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<[number, number] | null>(null);
  const labelW = 112;
  const cell = Math.max(8, (width - labelW) / Math.max(1, cols.length));
  const rowH = 18;
  const height = rows.length * rowH + 22;
  const every = Math.max(1, Math.ceil(cols.length / Math.max(2, Math.floor((width - labelW) / 48))));
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {highlightCols && (
            <rect x={labelW + highlightCols[0] * cell - 1} y={0} width={(highlightCols[1] - highlightCols[0] + 1) * cell + 2} height={rows.length * rowH} fill="none" stroke="var(--cyan)" strokeOpacity={0.6} />
          )}
          {rows.map((r, ri) => (
            <g key={r.key}>
              <text
                x={labelW - 8}
                y={ri * rowH + rowH / 2}
                textAnchor="end"
                dominantBaseline="middle"
                style={{ cursor: onSelectRow ? 'pointer' : 'default', fill: hover?.[0] === ri ? 'var(--text)' : undefined }}
                onClick={() => onSelectRow?.(r.key)}
              >
                {r.label}
              </text>
              {cols.map((_, ci) => {
                const v = values[ri]?.[ci];
                return (
                  <rect
                    key={ci}
                    x={labelW + ci * cell + 1}
                    y={ri * rowH + 1}
                    width={cell - 2}
                    height={rowH - 2}
                    rx={2}
                    fill={Number.isFinite(v) ? color(v) : 'transparent'}
                    stroke={hover?.[0] === ri && hover?.[1] === ci ? 'var(--text)' : 'none'}
                    onMouseEnter={() => setHover([ri, ci])}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onSelectRow?.(r.key)}
                    style={{ cursor: onSelectRow ? 'pointer' : 'default' }}
                  />
                );
              })}
            </g>
          ))}
          {cols.map((c, ci) =>
            ci % every === 0 ? (
              <text key={c} x={labelW + ci * cell + cell / 2} y={rows.length * rowH + 14} textAnchor="middle">
                {c}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {hover && (
        <div className="chart-tip" style={{ left: Math.min(labelW + hover[1] * cell + cell, width - 180), top: hover[0] * rowH - 4 }}>
          <div className="meta">{rows[hover[0]].label} · {cols[hover[1]]}</div>
          <b className="mono">{format(values[hover[0]][hover[1]])}</b>
        </div>
      )}
    </div>
  );
}
