// "Report a problem" button (error screen and Help guide): copies the details and opens an email with them.

import { useState } from 'react'
import { copyText } from './errorDetails.ts'
import { SUPPORT_EMAIL, openMail, problemMailto } from './support.ts'

/** details: called on click, so the report holds what happened up to then. */
export function ReportProblem({ details, className = 'btn' }: { details: () => string; className?: string }) {
  const [state, setState] = useState<'' | 'copied' | 'notCopied'>('')
  const [text, setText] = useState('')
  return (
    <>
      <button
        type="button"
        className={className}
        title={`Copy the error details and open an email to ${SUPPORT_EMAIL}`}
        onClick={async () => {
          const d = details()
          setText(d)
          setState((await copyText(d)) ? 'copied' : 'notCopied')
          openMail(problemMailto(d))
        }}
      >
        Report a problem
      </button>
      {state === 'copied' && (
        <span className="muted report-note">
          Details copied. If no email opened, paste them into an email to {SUPPORT_EMAIL}.
        </span>
      )}
      {state === 'notCopied' && (
        <>
          <span className="muted report-note">If no email opened, send these details to {SUPPORT_EMAIL}:</span>
          <textarea className="error-details" readOnly value={text} rows={8} aria-label="Problem details" />
        </>
      )}
    </>
  )
}
