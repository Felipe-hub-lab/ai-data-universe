import { useMemo } from 'react';
import { summarize } from '../analytics/insights';
import { METRICS, type MetricId } from '../analytics/metrics';
import { LineChart } from '../charts/LineChart';
import { FindingList } from '../components/Findings';
import { Delta } from '../components/Kpi';
import { NoResults } from '../components/States';
import { fmtMonth, fmtRange } from '../lib/format';
import { useMonthly, useOverview } from '../state/derived';
import { useDataset, useStore } from '../state/store';

const HEADLINE: MetricId[] = ['revenue', 'shipments', 'onTimeRate', 'margin'];

/** Executive mode: low visual complexity, fastest path to "how are we doing and what next". */
export default function Executive() {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  const setMode = useStore((s) => s.setMode);
  const setModule = useStore((s) => s.setModule);
  const o = useOverview();
  const monthly = useMonthly();
  const lines = useMemo(() => summarize(ds, filters, o), [ds, filters, o]);

  if (o.empty) return <div className="page"><NoResults /></div>;
  const risks = o.findings.filter((f) => f.kind === 'risk' || f.kind === 'alert');
  const opps = o.findings.filter((f) => f.kind === 'opportunity' || f.kind === 'trend');
  const actions = [...new Set(o.findings.slice(0, 5).map((f) => f.action))];

  return (
    <div className="page" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page__head">
        <div className="page__title">
          <span className="meta">Modo executivo · {fmtRange(ds.months, filters.range)}</span>
          <h1 className="h1" style={{ fontSize: 34 }}>Briefing da operação</h1>
        </div>
        <div className="page__actions">
          <button className="btn btn--sm" onClick={() => { setMode('immersive'); setModule('galaxy'); }}>Explorar em 3D →</button>
          <button className="btn btn--sm btn--ghost" onClick={() => setMode('analytical')}>Ver detalhes analíticos</button>
        </div>
      </div>

      <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 0, borderTop: '1px solid var(--line-2)', borderBottom: '1px solid var(--line-2)' }}>
        <div style={{ padding: '18px 16px', borderRight: '1px solid var(--line)' }}>
          <div className="meta">Saúde operacional</div>
          <div className="kpi__value" style={{ fontSize: 'clamp(24px, 2.3vw, 36px)' }}>{Number.isFinite(o.health.score) ? Math.round(o.health.score) : '—'}<span className="mono muted" style={{ fontSize: 14 }}>/100</span></div>
          <div className="muted" style={{ fontSize: 12 }}>faixa: {o.health.band}</div>
        </div>
        {HEADLINE.map((id) => (
          <div key={id} style={{ padding: '18px 16px', borderRight: '1px solid var(--line)' }}>
            <div className="meta">{METRICS[id].name}</div>
            <div className="kpi__value" style={{ fontSize: 'clamp(24px, 2.3vw, 36px)', overflow: 'visible' }}>{METRICS[id].formatCompact(o.current[id])}</div>
            <Delta id={id} current={o.current[id]} previous={o.previous?.[id]} />
          </div>
        ))}
      </section>

      <section className="grid" style={{ gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)', marginTop: 24 }} data-cc-hero>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="meta">Resumo</span>
            <span className="badge badge--engine">motor determinístico</span>
          </div>
          {lines.map((l, i) => (
            <p key={i} style={{ margin: 0, fontSize: i === 0 ? 17 : 14.5, lineHeight: 1.55, color: i === 0 ? 'var(--text)' : 'var(--text-2)' }}>{l}</p>
          ))}
        </div>
        <div>
          <div className="meta" style={{ marginBottom: 6 }}>Receita mensal · área = período</div>
          <LineChart ariaLabel="Receita mensal" series={[{ id: 'r', label: 'Receita', color: 'var(--cyan)', values: monthly.map((m) => m.revenue), area: true }]} xLabels={ds.months.map(fmtMonth)} format={METRICS.revenue.formatCompact} highlight={filters.range} height={180} />
        </div>
      </section>

      <section className="grid grid--3" style={{ marginTop: 24 }}>
        <div>
          <h2 className="h3" style={{ marginBottom: 4, color: 'var(--bad)' }}>▼ Riscos ({risks.length})</h2>
          <FindingList findings={risks} compact limit={3} />
        </div>
        <div>
          <h2 className="h3" style={{ marginBottom: 4, color: 'var(--good)' }}>▲ Oportunidades ({opps.length})</h2>
          <FindingList findings={opps} compact limit={3} />
        </div>
        <div>
          <h2 className="h3" style={{ marginBottom: 12 }}>→ Próximas ações recomendadas</h2>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--text-2)', fontSize: 13.5 }}>
            {actions.map((a) => <li key={a}>{a}</li>)}
          </ol>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>Ações derivadas das descobertas acima; cada uma indica investigação, não uma conclusão causal.</p>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 32 }}>
        <div className="meta" style={{ marginBottom: 8 }}>Sobre este projeto</div>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)' }}>
          AI DATA UNIVERSE é um projeto de portfólio que combina Business Intelligence, visualização 3D (React Three Fiber), detecção estatística de anomalias e um copiloto analítico determinístico — todos sobre um único modelo de dados. Os números acima vêm de um conjunto <b>sintético</b> gerado de forma reproduzível (seed {ds.meta.seed ?? '—'}), sem vínculo com qualquer empresa real.
        </p>
      </section>
    </div>
  );
}
