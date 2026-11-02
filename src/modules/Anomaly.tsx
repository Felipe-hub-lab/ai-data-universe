import { useEffect, useMemo, useState } from 'react';
import { ANOMALY_METRICS, buildHubSeries, detectAnomalies, METHODS, type Anomaly as AnomalyT, type AnomalyMethod } from '../analytics/anomalies';
import { METRICS, type MetricId } from '../analytics/metrics';
import { LineChart } from '../charts/LineChart';
import { Icon } from '../components/Icon';
import { FavButton } from '../components/Kpi';
import { NoResults } from '../components/States';
import { downloadText, toCsv } from '../lib/csv';
import { fmtMonth, fmtRange } from '../lib/format';
import { useNames, useOverview } from '../state/derived';
import { useDataset, useStore } from '../state/store';

export default function Anomaly() {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  const setModule = useStore((s) => s.setModule);
  const setGalaxy = useStore((s) => s.setGalaxy);
  const select = useStore((s) => s.select);
  const toast = useStore((s) => s.toast);
  const names = useNames();
  const o = useOverview();
  const [metric, setMetric] = useState<MetricId>('avgTransit');
  const [method, setMethod] = useState<AnomalyMethod>('zscore');
  const kind = METRICS[metric].kind;
  const spec = METHODS[method].threshold(kind);
  const [threshold, setThreshold] = useState(spec.value);
  const [adjusted, setAdjusted] = useState(true);
  const [scope, setScope] = useState<'range' | 'all'>('all');
  const [activeId, setActiveId] = useState<string | null>(null);

  // Reset the threshold to the method's default whenever the method/metric kind changes.
  useEffect(() => setThreshold(METHODS[method].threshold(kind).value), [method, kind]);
  useEffect(() => {
    if (!METHODS[method].compatible(kind)) setMethod('zscore');
  }, [kind, method]);

  const series = useMemo(() => buildHubSeries(ds, filters), [ds, filters]);
  const range: [number, number] = scope === 'range' ? filters.range : [0, ds.months.length - 1];
  const list = useMemo(() => {
    const all = detectAnomalies(series, ds.months, { metric, method, threshold, networkAdjusted: adjusted, range });
    return filters.hubs.length ? all.filter((a) => filters.hubs.includes(a.hubId)) : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, ds.months, metric, method, threshold, adjusted, range[0], range[1], filters.hubs]);

  const active = list.find((a) => a.id === activeId) ?? list[0] ?? null;
  const counts = { alta: list.filter((a) => a.priority === 'alta').length, média: list.filter((a) => a.priority === 'média').length, baixa: list.filter((a) => a.priority === 'baixa').length };

  if (o.empty) return <div className="page"><NoResults /></div>;

  const exportList = () => {
    const rows = list.map((a) => ({
      hub: a.hubId,
      hub_nome: names.hub(a.hubId),
      mes: ds.months[a.monthIndex],
      metrica: METRICS[a.metric].name,
      metodo: METHODS[a.method].short,
      observado: a.value,
      referencia: a.reference,
      magnitude: a.scoreLabel,
      prioridade: a.priority,
      justificativa: a.justification,
    }));
    const ok = downloadText(
      `anomalias-${metric}-${method}.csv`,
      toCsv(rows, ['hub', 'hub_nome', 'mes', 'metrica', 'metodo', 'observado', 'referencia', 'magnitude', 'prioridade', 'justificativa'], [
        `Período avaliado: ${fmtRange(ds.months, range)}`,
        `Método: ${METHODS[method].name} · limiar ${threshold} ${spec.label} · ajuste de rede ${adjusted ? 'ativo' : 'inativo'}`,
        'Dados sintéticos — demonstração. Anomalia estatística não é diagnóstico.',
      ]),
    );
    toast(ok ? `${rows.length} observações exportadas` : 'O navegador bloqueou o download', ok ? 'ok' : 'error');
  };

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__title">
          <span className="meta">05 · Anomaly Detector</span>
          <h1 className="h1">Comportamentos atípicos</h1>
        </div>
        <div className="page__actions">
          <button className="btn btn--sm" onClick={() => { setGalaxy({ colorBy: 'anomaly', layout: 'geo' }); setModule('galaxy'); }}>
            <Icon name="target" size={13} /> Destacar na Data Galaxy
          </button>
          <button className="btn btn--sm" onClick={exportList} disabled={!list.length}>
            <Icon name="download" size={13} /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="panel panel--hud" style={{ marginBottom: 16 }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'end' }}>
          <label className="field">
            <span className="meta">Variável</span>
            <select className="select" style={{ height: 34 }} value={metric} onChange={(e) => setMetric(e.target.value as MetricId)}>
              {ANOMALY_METRICS.map((m) => <option key={m} value={m}>{METRICS[m].name}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="meta">Método</span>
            <select className="select" style={{ height: 34 }} value={method} onChange={(e) => setMethod(e.target.value as AnomalyMethod)}>
              {Object.values(METHODS).map((m) => (
                <option key={m.id} value={m.id} disabled={!m.compatible(kind)}>
                  {m.short}{!m.compatible(kind) ? ' — incompatível' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="meta">Limiar · {spec.label === 'p.p.' ? `${(threshold * 100).toFixed(1).replace('.', ',')} p.p.` : spec.label === '%' || spec.label === '% a.m.' ? `${(threshold * 100).toFixed(1).replace('.', ',')} ${spec.label}` : `${String(threshold).replace('.', ',')} ${spec.label}`}</span>
            <input type="range" min={spec.min} max={spec.max} step={spec.step} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </label>
          <div className="stack" style={{ gap: 6 }}>
            <label className="row" style={{ gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={adjusted} onChange={(e) => setAdjusted(e.target.checked)} disabled={method === 'iqr' || method === 'yoy'} />
              Ajustar por efeitos comuns da rede
            </label>
            <div className="seg" role="group" aria-label="Janela avaliada">
              <button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>Todo o histórico</button>
              <button aria-pressed={scope === 'range'} onClick={() => setScope('range')}>Período global</button>
            </div>
          </div>
        </div>
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 12.5 }}>
          <b style={{ color: 'var(--text-2)' }}>{METHODS[method].name}.</b> {METHODS[method].description}
        </p>
        {Object.values(METHODS).filter((m) => !m.compatible(kind)).length > 0 && (
          <p className="mono" style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--faint)' }}>
            Indisponível para {METRICS[metric].name.toLowerCase()}: {Object.values(METHODS).filter((m) => !m.compatible(kind)).map((m) => `${m.short} (${m.incompatibleReason})`).join(' ')}
          </p>
        )}
      </div>

      <section className="grid" style={{ gridTemplateColumns: 'minmax(0, 6fr) minmax(0, 6fr)' }} data-cc-hero>
        <div className="panel" style={{ padding: 0 }}>
          <div className="row between" style={{ padding: '14px 16px' }}>
            <span className="meta">{list.length} observações · {fmtRange(ds.months, range)}</span>
            <span className="row" style={{ gap: 6 }}>
              <span className="badge badge--alta">alta {counts.alta}</span>
              <span className="badge badge--média">média {counts.média}</span>
              <span className="badge badge--baixa">baixa {counts.baixa}</span>
            </span>
          </div>
          {list.length === 0 ? (
            <div className="state">Nenhuma observação ultrapassa o limiar com este método. Reduza o limiar ou troque de método.</div>
          ) : (
            <div className="table-wrap" style={{ border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, maxHeight: 520 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Prioridade</th>
                    <th>Hub</th>
                    <th>Mês</th>
                    <th className="r">Observado</th>
                    <th className="r">Referência</th>
                    <th className="r">Desvio</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => (
                    <tr
                      key={a.id}
                      data-clickable="true"
                      tabIndex={0}
                      aria-selected={active?.id === a.id}
                      onClick={() => setActiveId(a.id)}
                      onKeyDown={(e) => e.key === 'Enter' && setActiveId(a.id)}
                      style={{ background: active?.id === a.id ? 'rgba(0,229,255,.06)' : undefined }}
                    >
                      <td><span className={`badge badge--${a.priority}`}>{a.priority}</span></td>
                      <td>{names.hub(a.hubId)}</td>
                      <td className="mono">{fmtMonth(ds.months[a.monthIndex])}</td>
                      <td className="r mono">{METRICS[a.metric].format(a.value)}</td>
                      <td className="r mono muted">{METRICS[a.metric].format(a.reference)}</td>
                      <td className="r mono" style={{ color: a.favourable ? 'var(--good)' : 'var(--bad)' }}>{a.direction === 'up' ? '▲' : '▼'} {a.scoreLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {active ? <Detail a={active} series={series.hubs.get(active.hubId)!.map((m) => m[metric])} peer={series.peers.get(active.hubId)!.map((m) => m[metric])} onGalaxy={() => { select({ hubId: active.hubId }); setGalaxy({ colorBy: 'anomaly', layout: 'geo' }); setModule('galaxy'); }} /> : <div className="panel state">Selecione uma observação.</div>}
      </section>
    </div>
  );
}

function Detail({ a, series, peer: peerRaw, onGalaxy }: { a: AnomalyT; series: number[]; peer: number[]; onGalaxy: () => void }) {
  const ds = useDataset();
  const names = useNames();
  const def = METRICS[a.metric];
  // Volumes differ in scale: rescale the peer aggregate to the hub's mean to compare shape only.
  const avg = (xs: number[]) => xs.filter(Number.isFinite).reduce((s, x) => s + x, 0) / Math.max(1, xs.filter(Number.isFinite).length);
  const peer = def.kind === 'volume' ? peerRaw.map((v) => (v * avg(series)) / avg(peerRaw)) : peerRaw;
  const title = `${names.hub(a.hubId)} · ${def.name} · ${fmtMonth(ds.months[a.monthIndex])}`;
  return (
    <article className="panel panel--hud stack" style={{ gap: 14 }}>
      <div className="row between">
        <span className="row" style={{ gap: 8 }}>
          <span className={`badge badge--${a.priority}`}>prioridade {a.priority}</span>
          <span className="badge">{METHODS[a.method].short}</span>
        </span>
        <FavButton id={`anomaly:${a.id}`} kind="finding" label={title} detail={a.scoreLabel} />
      </div>
      <h2 className="h2">{title}</h2>
      <div className="grid grid--3" style={{ gap: 8 }}>
        <Stat k="Valor observado" v={def.format(a.value)} />
        <Stat k={a.referenceLabel} v={def.format(a.reference)} />
        <Stat k="Magnitude do desvio" v={a.scoreLabel} tone={a.favourable ? 'good' : 'bad'} />
      </div>
      <div>
        <div className="meta" style={{ marginBottom: 6 }}>Série do hub · comparação com os demais hubs</div>
        <LineChart
          ariaLabel={`Série de ${def.name} em ${names.hub(a.hubId)}`}
          series={[
            { id: 'hub', label: names.hub(a.hubId), color: 'var(--cyan)', values: series },
            { id: 'peer', label: def.kind === 'volume' ? 'Demais hubs (reescalado à média do hub)' : 'Demais hubs (agregado)', color: 'var(--muted)', values: peer, dashed: true },
          ]}
          xLabels={ds.months.map(fmtMonth)}
          format={def.formatCompact}
          markers={[{ index: a.monthIndex, label: `Observação atípica (${a.scoreLabel})`, tone: a.favourable ? 'up' : 'down' }]}
          highlight={[a.monthIndex, a.monthIndex]}
          height={200}
        />
        {def.kind === 'volume' && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>A linha tracejada é o agregado dos demais hubs reescalado à média deste hub: mostra o formato esperado (sazonalidade), não um alvo.</div>}
      </div>
      <section>
        <div className="meta" style={{ marginBottom: 4 }}>Justificativa</div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>{a.justification}</p>
      </section>
      <section>
        <div className="meta" style={{ marginBottom: 4 }}>Possíveis próximos passos</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2)' }}>
          {a.nextSteps.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </section>
      <p className="warn" style={{ margin: 0, fontSize: 12 }}>
        ! Esta é uma observação estatística que merece investigação. Ela não indica, por si só, fraude, erro ou falha operacional.
      </p>
      <button className="btn btn--sm" style={{ alignSelf: 'flex-start' }} onClick={onGalaxy}>Ver o hub na Data Galaxy →</button>
    </article>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="kpi" style={{ padding: '10px 12px' }}>
      <span className="muted" style={{ fontSize: 11.5 }}>{k}</span>
      <span className="mono" style={{ fontSize: 16, color: tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : undefined }}>{v}</span>
    </div>
  );
}
