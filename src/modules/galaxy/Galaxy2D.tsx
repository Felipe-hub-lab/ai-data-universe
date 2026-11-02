import type { Entity } from '../../analytics/entities';
import { useWidth } from '../../charts/scale';
import type { Selection } from '../../state/store';
import { SCATTER, type Domain } from './encoding';

/**
 * WebGL fallback: the analytical layout projected to 2D (X = pontualidade, Y = margem,
 * size = receita), with the same colours, hover and selection behaviour.
 */
export function Galaxy2D({
  entities,
  colors,
  size,
  domains,
  format,
  selection,
  onHover,
  onSelect,
}: {
  entities: Entity[];
  colors: string[];
  size: (r: number) => number;
  domains: { x: Domain; y: Domain };
  format: { x: (v: number) => string; y: (v: number) => string };
  selection: Selection;
  onHover: (h: { kind: 'entity'; id: string; x: number; y: number } | null) => void;
  onSelect: (s: Selection) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = Math.max(320, Math.min(640, width * 0.6));
  const pad = 56;
  const x = (v: number) => pad + ((v - domains.x.min) / (domains.x.max - domains.x.min)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - domains.y.min) / (domains.y.max - domains.y.min)) * (height - pad * 2);
  const anySel = !!(selection.hubId || selection.segmentId);
  const order = entities.map((e, i) => ({ e, i })).sort((a, b) => b.e.m.revenue - a.e.m.revenue);
  return (
    <div ref={ref} style={{ width: '100%', padding: '96px 24px 24px' }}>
      <div className="meta" style={{ marginBottom: 8 }}>
        WebGL indisponível — visualização alternativa 2D ({SCATTER.x.label} × {SCATTER.y.label}; área = receita)
      </div>
      {width > 0 && (
        <svg width={width - 48} height={height} role="img" aria-label="Dispersão de pontualidade por margem" style={{ overflow: 'visible' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const vx = domains.x.min + (domains.x.max - domains.x.min) * t;
            const vy = domains.y.min + (domains.y.max - domains.y.min) * t;
            return (
              <g key={t}>
                <line x1={x(vx)} x2={x(vx)} y1={pad} y2={height - pad} stroke="var(--line)" />
                <line x1={pad} x2={width - pad} y1={y(vy)} y2={y(vy)} stroke="var(--line)" />
                <text x={x(vx)} y={height - pad + 16} textAnchor="middle" fill="var(--muted)" fontSize={10.5} fontFamily="var(--font-mono)">{format.x(vx)}</text>
                <text x={pad - 8} y={y(vy)} textAnchor="end" dominantBaseline="middle" fill="var(--muted)" fontSize={10.5} fontFamily="var(--font-mono)">{format.y(vy)}</text>
              </g>
            );
          })}
          {order.map(({ e, i }) => {
            const on = (!selection.hubId || e.hubId === selection.hubId) && (!selection.segmentId || e.segmentId === selection.segmentId);
            return (
              <circle
                key={e.id}
                cx={x(e.m.onTimeRate)}
                cy={y(e.m.margin)}
                r={size(e.m.revenue) * 60}
                fill={colors[i]}
                fillOpacity={anySel && !on ? 0.15 : 0.75}
                stroke="var(--bg)"
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
                onMouseMove={(ev) => onHover({ kind: 'entity', id: e.id, x: ev.clientX, y: ev.clientY })}
                onMouseLeave={() => onHover(null)}
                onClick={() => onSelect({ hubId: e.hubId, segmentId: e.segmentId })}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}
