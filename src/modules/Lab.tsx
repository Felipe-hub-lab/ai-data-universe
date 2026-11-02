import { useEffect, useRef, useState } from 'react';
import { analyze, INTENTS } from '../ai/engine';
import { llmEnabled, narrate } from '../ai/llm';
import type { AnalysisResult } from '../ai/types';
import { METRIC_LIST, METRICS } from '../analytics/metrics';
import { FavButton } from '../components/Kpi';
import { Icon } from '../components/Icon';
import { downloadText } from '../lib/csv';
import { fmtRange } from '../lib/format';
import { useDataset, useStore } from '../state/store';

export default function Lab() {
  const ds = useDataset();
  const filters = useStore((s) => s.filters);
  const metric = useStore((s) => s.focusMetric);
  const setMetric = useStore((s) => s.setFocusMetric);
  const history = useStore((s) => s.labHistory);
  const add = useStore((s) => s.addLabResult);
  const update = useStore((s) => s.updateLabResult);
  const clear = useStore((s) => s.clearLab);
  const toast = useStore((s) => s.toast);
  const selection = useStore((s) => s.selection);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<'idle' | 'analysis' | 'llm'>('idle');
  const [activeId, setActiveId] = useState<string | null>(history[0]?.id ?? null);
  const abort = useRef<AbortController | null>(null);
  const active = history.find((h) => h.id === activeId) ?? null;
  const llm = llmEnabled();

  useEffect(() => () => abort.current?.abort(), []);

  const run = async (question: string) => {
    const text = question.trim();
    if (!text || busy !== 'idle') return;
    setBusy('analysis');
    // Yield a frame so the processing state is actually painted before the computation.
    await new Promise((r) => setTimeout(r, 30));
    const scoped = selection.hubId && !filters.hubs.length ? { ...filters, hubs: [selection.hubId] } : filters;
    let result: AnalysisResult;
    try {
      result = analyze(ds, { question: text, filters: scoped, metric });
    } catch (e) {
      setBusy('idle');
      toast(`Falha na análise: ${e instanceof Error ? e.message : String(e)}`, 'error');
      return;
    }
    add(result);
    setActiveId(result.id);
    setQ('');
    if (llm && !result.insufficient) {
      setBusy('llm');
      abort.current = new AbortController();
      try {
        const out = await narrate(result, abort.current.signal);
        update(result.id, { llm: out, engine: 'llm' });
      } catch (e) {
        if (!abort.current.signal.aborted) update(result.id, { llmError: e instanceof Error ? e.message : String(e) });
      }
    }
    setBusy('idle');
  };

  const exportTable = (r: AnalysisResult) => {
    if (!r.table) return;
    const rows = r.table.rows.map((row) => Object.fromEntries(r.table!.columns.map((c, i) => [c, row[i]])));
    const ok = downloadText(
      `analise-${r.intent}-${new Date(r.createdAt).toISOString().slice(0, 10)}.csv`,
      [`# ${r.question}`, `# Período: ${r.period}`, `# Critério: ${r.criterion}`, `# Dados sintéticos — demonstração`, r.table.columns.join(',')]
        .concat(rows.map((row) => r.table!.columns.map((c) => `"${String(row[c]).replace(/"/g, '""')}"`).join(',')))
        .join('\n'),
    );
    toast(ok ? 'Tabela exportada' : 'O navegador bloqueou o download', ok ? 'ok' : 'error');
  };

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__title">
          <span className="meta">04 · AI Analytics Lab</span>
          <h1 className="h1">Copiloto analítico</h1>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="badge badge--engine">Motor determinístico · ativo</span>
          <span className={`badge ${llm ? 'badge--opportunity' : ''}`} title={llm ? 'Endpoint configurado em VITE_AI_ENDPOINT' : 'Nenhum endpoint de modelo de linguagem configurado'}>
            Modelo de linguagem · {llm ? 'conectado' : 'não conectado'}
          </span>
        </div>
      </div>

      <section className="grid" style={{ gridTemplateColumns: 'minmax(280px, 4fr) minmax(0, 8fr)' }} data-cc-hero>
        <aside className="stack" style={{ gap: 16 }}>
          <form
            className="panel panel--hud stack"
            style={{ gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              run(q);
            }}
          >
            <label className="meta" htmlFor="lab-q">Pergunta</label>
            <textarea
              id="lab-q"
              className="input"
              style={{ height: 88, padding: 10, resize: 'vertical' }}
              placeholder="Ex.: O que mais contribuiu para a variação da receita?"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  run(q);
                }
              }}
            />
            <div className="row wrap" style={{ gap: 8 }}>
              <label className="row" style={{ gap: 6 }}>
                <span className="meta">Métrica padrão</span>
                <select className="select" value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>
                  {METRIC_LIST.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <span className="grow" />
              <button className="btn btn--primary btn--sm" type="submit" disabled={!q.trim() || busy !== 'idle'}>
                <Icon name="send" size={13} /> Analisar
              </button>
            </div>
            <div className="mono muted" style={{ fontSize: 11 }}>
              Contexto: {fmtRange(ds.months, filters.range)}
              {filters.regions.length + filters.segments.length + filters.services.length + filters.hubs.length > 0 ? ' · filtros globais ativos' : ' · rede inteira'}
              {selection.hubId && !filters.hubs.length ? ` · foco no hub selecionado (${selection.hubId})` : ''}. Nomes de hubs, regiões ou segmentos na pergunta restringem o recorte.
            </div>
          </form>

          <div className="panel">
            <div className="meta" style={{ marginBottom: 8 }}>Sugestões</div>
            <div className="stack" style={{ gap: 4 }}>
              {Object.values(INTENTS).map((i) => (
                <button key={i.example} className="dropdown__opt" style={{ fontSize: 12.5 }} onClick={() => run(i.example)} disabled={busy !== 'idle'}>
                  <span style={{ color: 'var(--cyan)' }}>›</span> {i.example}
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="row between" style={{ marginBottom: 8 }}>
              <span className="meta">Histórico de consultas ({history.length})</span>
              {history.length > 0 && <button className="btn btn--sm btn--ghost" onClick={() => { clear(); setActiveId(null); }}>Limpar</button>}
            </div>
            {history.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>As consultas ficam salvas neste navegador.</div>}
            <div className="list">
              {history.map((h) => (
                <button key={h.id} className="list__row" style={{ gridTemplateColumns: '1fr auto', background: h.id === activeId ? 'rgba(0,229,255,.05)' : undefined }} onClick={() => setActiveId(h.id)}>
                  <span className="stack" style={{ gap: 2 }}>
                    <span style={{ fontSize: 13 }} className="clamp-2">{h.question}</span>
                    <span className="mono muted" style={{ fontSize: 10.5 }}>{h.intentLabel} · {h.period}</span>
                  </span>
                  <span className="mono muted" style={{ fontSize: 10.5 }}>{new Date(h.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="stack" style={{ gap: 16, minWidth: 0 }}>
          {busy === 'analysis' && <Processing label="Executando análise sobre o modelo de dados…" />}
          {!active && busy === 'idle' && (
            <div className="panel state" style={{ minHeight: 360 }}>
              <div className="state__icon">?</div>
              <div className="h3" style={{ color: 'var(--text)' }}>Faça uma pergunta sobre os dados</div>
              <div style={{ maxWidth: 480 }}>
                O motor determinístico identifica o tipo de análise, executa-a sobre o mesmo modelo de dados dos demais módulos e devolve uma resposta estruturada — com evidência, critério e limitações. Nenhum modelo de linguagem é consultado{llm ? ', exceto para redigir a narrativa opcional, identificada como tal' : ''}.
              </div>
            </div>
          )}
          {active && <Answer r={active} onExport={() => exportTable(active)} llmBusy={busy === 'llm' && active.id === history[0]?.id} />}
        </div>
      </section>
    </div>
  );
}

function Processing({ label }: { label: string }) {
  return (
    <div className="panel row" role="status" aria-live="polite" style={{ gap: 12 }}>
      <span className="skeleton" style={{ width: 14, height: 14, borderRadius: '50%' }} />
      <span className="mono" style={{ fontSize: 12 }}>{label}</span>
    </div>
  );
}

function Answer({ r, onExport, llmBusy }: { r: AnalysisResult; onExport: () => void; llmBusy: boolean }) {
  const [inspect, setInspect] = useState(false);
  return (
    <article className="panel panel--hud stack" style={{ gap: 16 }} aria-live="polite">
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="row" style={{ gap: 8 }}>
          <span className="badge badge--engine">{r.intentLabel}</span>
          <span className="badge">{r.engine === 'llm' ? 'regras + narrativa LLM' : 'motor determinístico — sem LLM'}</span>
          {r.insufficient && <span className="badge badge--alert">dados insuficientes</span>}
        </span>
        <FavButton id={`analysis:${r.id}`} kind="analysis" label={r.question} detail={r.observed} />
      </div>

      <Block n="1" title="Pergunta investigada"><span style={{ fontSize: 15 }}>{r.question}</span></Block>
      <Block n="2" title="Resultado observado"><p style={{ margin: 0, fontSize: 15, color: 'var(--text)' }}>{r.observed}</p></Block>

      {r.facts.length > 0 && (
        <Block n="·" title="Fatos observados">
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)', fontSize: 13 }}>
            {r.facts.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </Block>
      )}

      {r.evidence.length > 0 && (
        <Block n="3" title="Evidência numérica">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {r.evidence.map((e) => (
              <div key={e.label} className="kpi" style={{ padding: '8px 10px' }}>
                <span className="muted" style={{ fontSize: 11.5 }}>{e.label}</span>
                <span className="mono" style={{ fontSize: 14 }}>{e.value}</span>
              </div>
            ))}
          </div>
        </Block>
      )}

      <div className="grid grid--2">
        <Block n="4" title="Período analisado"><span className="mono">{r.period}</span></Block>
        <Block n="5" title="Critério utilizado"><span style={{ fontSize: 13, color: 'var(--text-2)' }}>{r.criterion}</span></Block>
      </div>

      {r.interpretations.length > 0 && (
        <Block n="6" title="Possíveis interpretações (hipóteses, não fatos)">
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)', fontSize: 13 }}>
            {r.interpretations.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </Block>
      )}
      <Block n="7" title="Limitações">
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)', fontSize: 13 }}>
          {r.limitations.map((f, i) => <li key={i}>{f}</li>)}
          <li>Dados sintéticos de demonstração — não representam uma empresa real.</li>
        </ul>
      </Block>
      <Block n="8" title="Próxima investigação recomendada"><span style={{ fontSize: 13.5 }}>{r.next}</span></Block>

      {r.metricsUsed.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="meta">Métricas utilizadas</span>
          {r.metricsUsed.map((m) => (
            <span key={m} className="badge" title={METRICS[m].formula}>{METRICS[m].name}</span>
          ))}
        </div>
      )}

      {llmBusy && <Processing label="Aguardando a narrativa do modelo de linguagem…" />}
      {r.llm && (
        <div className="panel" style={{ borderColor: 'rgba(155,92,255,.35)' }}>
          <div className="meta" style={{ marginBottom: 6, color: 'var(--violet)' }}>Narrativa gerada por modelo de linguagem · {r.llm.model}</div>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{r.llm.narrative}</p>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Recebeu apenas os fatos agregados acima. Verifique contra a evidência numérica.</div>
        </div>
      )}
      {r.llmError && <div className="bad" style={{ fontSize: 12.5 }} role="alert">✕ A narrativa do modelo falhou: {r.llmError}. A análise determinística acima permanece válida.</div>}

      {r.table && (
        <div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <button className="btn btn--sm" onClick={() => setInspect((v) => !v)} aria-expanded={inspect}>
              <Icon name="table" size={13} /> {inspect ? 'Ocultar dados' : 'Inspecionar dados que sustentam a resposta'}
            </button>
            {inspect && <button className="btn btn--sm btn--ghost" onClick={onExport}><Icon name="download" size={13} /> CSV</button>}
          </div>
          {inspect && (
            <div className="table-wrap" style={{ maxHeight: 360 }}>
              <table className="table">
                <caption className="sr-only">{r.table.title}</caption>
                <thead>
                  <tr>{r.table.columns.map((c, i) => <th key={c} className={i ? 'r' : ''}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {r.table.rows.map((row, i) => (
                    <tr key={i}>{row.map((v, j) => <td key={j} className={j ? 'r mono' : ''}>{v}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Block({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="stack" style={{ gap: 6 }}>
      <span className="meta"><span style={{ color: 'var(--cyan)' }}>{n}</span> · {title}</span>
      {children}
    </section>
  );
}
