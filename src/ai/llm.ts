import type { AnalysisResult } from './types';

/**
 * Optional language-model layer. Active only when VITE_AI_ENDPOINT points to the
 * serverless function in /api. The browser never holds an API key.
 */
export const AI_ENDPOINT = (import.meta.env.VITE_AI_ENDPOINT as string | undefined)?.trim() || '';
export const llmEnabled = () => AI_ENDPOINT.length > 0;

/** Only aggregated, already-computed facts leave the browser. */
function compactContext(r: AnalysisResult) {
  return {
    dataset: 'synthetic demonstration data (fictional carrier)',
    analysis: r.intentLabel,
    period: r.period,
    observed: r.observed,
    facts: r.facts.slice(0, 10),
    evidence: r.evidence.slice(0, 10),
    criterion: r.criterion,
    limitations: r.limitations,
    insufficient: !!r.insufficient,
  };
}

export async function narrate(r: AnalysisResult, signal?: AbortSignal): Promise<{ model: string; narrative: string }> {
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: r.question, context: compactContext(r) }),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as { model?: string; narrative?: string; error?: string };
  if (!res.ok || !data.narrative) throw new Error(data.error ?? `Falha na chamada ao endpoint de IA (HTTP ${res.status}).`);
  return { model: data.model ?? 'desconhecido', narrative: data.narrative };
}
