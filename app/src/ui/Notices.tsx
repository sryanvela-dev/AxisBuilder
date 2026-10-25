// Messages over any screen: the short notice (saved, opened, ...) and the background error with its details.

import { useApp } from './appContext.ts'
import { copyText } from './errorDetails.ts'

export function Notices() {
  const app = useApp()
  return (
    <>
      {app.notice && (
        <div className={`toast toast-${app.notice.kind}`} role={app.notice.kind === 'error' ? 'alert' : 'status'}>
          <span>{app.notice.text}</span>
          <button type="button" className="btn btn-small" onClick={app.dismissNotice}>
            OK
          </button>
        </div>
      )}
      {app.backgroundError && <BackgroundError details={app.backgroundError} onClose={app.dismissBackgroundError} />}
    </>
  )
}

function BackgroundError({ details, onClose }: { details: string; onClose: () => void }) {
  return (
    <div className="toast toast-error" role="alert">
      <span>Something went wrong in the background. Your work is kept; you can carry on.</span>
      <span className="button-row">
        <button
          type="button"
          className="btn btn-small"
          onClick={() => void copyText(details)}
        >
          Copy error details
        </button>
        <button type="button" className="btn btn-small" onClick={onClose}>
          OK
        </button>
      </span>
    </div>
  )
}
