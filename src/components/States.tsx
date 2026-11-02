import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useStore } from '../state/store';

export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="state" role="status">
      <div className="state__icon">∅</div>
      <div className="h3" style={{ color: 'var(--text)' }}>{title}</div>
      {detail && <div style={{ maxWidth: 420 }}>{detail}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <div className="state__icon">!</div>
      <div className="h3" style={{ color: 'var(--text)' }}>{title}</div>
      {detail && <div className="mono" style={{ maxWidth: 520, fontSize: 12 }}>{detail}</div>}
      {onRetry && (
        <button className="btn btn--sm" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

/** Shown when filters exclude every row — offers the one action that fixes it. */
export function NoResults() {
  const resetAll = useStore((s) => s.resetAll);
  return (
    <EmptyState
      title="Nenhum registro para os filtros atuais"
      detail="A combinação de período, região, segmento, serviço e hub selecionada não possui dados."
      action={
        <button className="btn btn--sm" onClick={resetAll}>
          Redefinir filtros
        </button>
      }
    />
  );
}

/** Contains a module failure so one broken view never takes down the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}]`, error, info.componentStack);
  }
  render() {
    if (this.state.error)
      return (
        <ErrorState
          title={`Falha ao renderizar ${this.props.label}`}
          detail={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    return this.props.children;
  }
}

export function Skeleton({ h = 120 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h }} aria-hidden="true" />;
}
