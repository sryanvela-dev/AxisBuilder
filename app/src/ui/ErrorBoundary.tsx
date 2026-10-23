// Catches an unexpected error in a screen and shows a plain message instead of a blank page.
// The job lives outside the boundary (AppStore) and in the recovery copy, so nothing is lost.

import { Component, useState, type ErrorInfo, type ReactNode } from 'react'
import { copyText, errorDetails } from './errorDetails.ts'

interface Props {
  /** Shown in the error details, e.g. "Field data step". */
  where: string
  children: ReactNode
  /** Extra button, e.g. back to the start screen. */
  onLeave?: { label: string; action: () => void }
}

interface State {
  error: unknown
  componentStack: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error ?? new Error('Unknown error') }
  }

  componentDidCatch(_error: unknown, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null })
  }

  render() {
    if (this.state.error === null) return this.props.children
    return (
      <ErrorPanel
        title="Something went wrong on this screen"
        details={errorDetails(this.state.error, this.props.where, this.state.componentStack)}
        onRetry={() => this.setState({ error: null, componentStack: null })}
        onLeave={this.props.onLeave}
      />
    )
  }
}

export function ErrorPanel(props: {
  title: string
  details: string
  onRetry?: () => void
  onLeave?: { label: string; action: () => void }
}) {
  const [copied, setCopied] = useState<'' | 'yes' | 'no'>('')
  return (
    <div className="error-panel" role="alert">
      <h2>{props.title}</h2>
      <p>
        Your work is safe. The job is still open and a copy is kept in this browser, so nothing has been lost. You can
        try again, or go to another step and come back.
      </p>
      <p className="muted">If it keeps happening, copy the error details and send them to whoever looks after AxisBuilder.</p>
      <div className="button-row">
        {props.onRetry && (
          <button type="button" className="btn btn-primary" onClick={props.onRetry}>
            Try again
          </button>
        )}
        <button type="button" className="btn" onClick={async () => setCopied((await copyText(props.details)) ? 'yes' : 'no')}>
          Copy error details
        </button>
        {props.onLeave && (
          <button type="button" className="btn" onClick={props.onLeave.action}>
            {props.onLeave.label}
          </button>
        )}
        {copied === 'yes' && <span className="muted">Copied.</span>}
      </div>
      {copied === 'no' && (
        <textarea className="error-details" readOnly value={props.details} rows={8} aria-label="Error details" />
      )}
    </div>
  )
}
