/** pt-BR formatting helpers. All numbers shown in the UI go through here. */

const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const fmtInt = (v: number) => nf0.format(v);
export const fmt1 = (v: number) => nf1.format(v);
export const fmt2 = (v: number) => nf2.format(v);
export const fmtBRL = (v: number) => brl.format(v);
export const fmtBRL0 = (v: number) => brl0.format(v);
export const fmtPct = (ratio: number, digits = 1) =>
  `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ratio * 100)}%`;

/** Compact form: 1,2 mi / 345 mil. */
export function fmtCompact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${nf2.format(v / 1e9)} bi`;
  if (a >= 1e6) return `${nf2.format(v / 1e6)} mi`;
  if (a >= 1e4) return `${nf1.format(v / 1e3)} mil`;
  return nf0.format(v);
}

export function fmtBRLCompact(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}R$ ${nf2.format(a / 1e9)} bi`;
  if (a >= 1e6) return `${sign}R$ ${nf2.format(a / 1e6)} mi`;
  if (a >= 1e3) return `${sign}R$ ${nf1.format(a / 1e3)} mil`;
  return `${sign}${brl.format(a)}`;
}

/** Signed relative change: +4,2% / −1,0%. Uses a true minus sign. */
export function fmtDelta(ratio: number, digits = 1): string {
  const s = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    Math.abs(ratio * 100),
  );
  return `${ratio > 0 ? '+' : ratio < 0 ? '−' : '±'}${s}%`;
}

/** Signed percentage-point change for rates: +1,3 p.p. */
export function fmtPP(diff: number, digits = 1): string {
  const s = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    Math.abs(diff * 100),
  );
  return `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${s} p.p.`;
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2025-11" → "nov/25" */
export function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS_PT[Number(m) - 1]}/${y.slice(2)}`;
}

export function fmtRange(months: string[], [a, b]: [number, number]): string {
  return a === b ? fmtMonth(months[a]) : `${fmtMonth(months[a])} – ${fmtMonth(months[b])}`;
}
