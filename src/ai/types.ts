import type { Filters } from '../analytics/aggregate';
import type { MetricId } from '../analytics/metrics';

export type IntentId = 'drivers' | 'deviation' | 'opportunities' | 'atypical' | 'compare' | 'investigate' | 'overview';

export interface AnalysisRequest {
  question: string;
  filters: Filters;
  /** Metric selected in the UI; the question text can override it. */
  metric: MetricId;
  /** Explicit comparison window. Defaults to the previous equal-length window. */
  compareRange?: [number, number] | null;
}

export interface Evidence {
  label: string;
  value: string;
}

export interface AnalysisResult {
  id: string;
  question: string;
  intent: IntentId;
  intentLabel: string;
  /** Who produced the text. 'deterministic' = rule-based code in this app, no model consulted. */
  engine: 'deterministic' | 'llm';
  createdAt: number;
  observed: string;
  facts: string[];
  evidence: Evidence[];
  period: string;
  criterion: string;
  interpretations: string[];
  limitations: string[];
  next: string;
  metricsUsed: MetricId[];
  table?: { title: string; columns: string[]; rows: string[][] };
  /** True when the data cannot answer the question; `observed` explains why. */
  insufficient?: boolean;
  /** Present only when a language model was actually called and answered. */
  llm?: { model: string; narrative: string };
  /** Present when an LLM call was attempted and failed. */
  llmError?: string;
}
