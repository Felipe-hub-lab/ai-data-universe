import type { Finding } from '../analytics/insights';
import { useStore } from '../state/store';
import { FavButton } from './Kpi';

const KIND_LABEL: Record<Finding['kind'], string> = { risk: 'Risco', opportunity: 'Oportunidade', trend: 'Tendência', alert: 'Alerta' };
const KIND_ICON: Record<Finding['kind'], string> = { risk: '▼', opportunity: '▲', trend: '◆', alert: '!' };

/** Finding list: observed fact, evidence and (separately) a hypothesis — never merged. */
export function FindingList({ findings, compact = false, limit }: { findings: Finding[]; compact?: boolean; limit?: number }) {
  const select = useStore((s) => s.select);
  const setModule = useStore((s) => s.setModule);
  const list = limit ? findings.slice(0, limit) : findings;
  if (!list.length) return <div className="muted" style={{ padding: '12px 0' }}>Nenhuma descoberta para o recorte atual.</div>;
  return (
    <div>
      {list.map((f) => (
        <article key={f.id} className="finding">
          <div className="finding__head">
            <span className="row" style={{ gap: 8, minWidth: 0 }}>
              <span className={`badge badge--${f.kind}`}>
                {KIND_ICON[f.kind]} {KIND_LABEL[f.kind]}
              </span>
              <h4 className="h3" style={{ margin: 0 }}>{f.title}</h4>
            </span>
            <FavButton id={`finding:${f.id}`} kind="finding" label={f.title} detail={f.fact} />
          </div>
          <p className="finding__fact" style={{ margin: 0 }}>
            <span className="meta" style={{ marginRight: 6 }}>Fato</span>
            {f.fact}
          </p>
          {!compact && (
            <div className="evidence">
              {f.evidence.map((e) => (
                <span key={e.label} className="evidence__item">
                  <span className="muted">{e.label}</span>
                  <b>{e.value}</b>
                </span>
              ))}
            </div>
          )}
          {!compact && f.hypothesis && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
              <span className="meta" style={{ marginRight: 6 }}>Hipótese</span>
              {f.hypothesis}
            </p>
          )}
          <div className="row between wrap" style={{ gap: 8 }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              <span className="meta" style={{ marginRight: 6 }}>Próximo passo</span>
              {f.action}
            </span>
            {f.hubId && (
              <button
                className="btn btn--sm btn--ghost"
                onClick={() => {
                  select({ hubId: f.hubId, segmentId: undefined });
                  setModule('galaxy');
                  if (useStore.getState().mode === 'executive') useStore.getState().setMode('analytical');
                }}
              >
                Ver na Galaxy →
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
