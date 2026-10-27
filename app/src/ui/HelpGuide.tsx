// The Help button (job top bar and start screen) and the quick guide it opens: the steps, the export files, the keys
// and Report a problem. The words are in helpText.ts.

import { useEffect, useRef, useState } from 'react'
import { STEPS } from '../state/steps.ts'
import { appVersion, problemDetails } from './errorDetails.ts'
import { GUIDE_FILES, GUIDE_KEYS, GUIDE_STEPS, GUIDE_THEME } from './helpText.ts'
import { ReportProblem } from './ReportProblem.tsx'
import { ThemeSwitch } from './ThemeSwitch.tsx'

/** where: the screen, for the problem report (e.g. "Start screen", "Drawing step"). */
export function HelpButton({ where, className = 'btn' }: { where: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} title="Quick guide: the steps, the export files and the keys">
        Help
      </button>
      {open && <HelpGuide where={where} onClose={() => setOpen(false)} />}
    </>
  )
}

function HelpGuide({ where, onClose }: { where: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLButtonElement>('.help-close')?.focus()
    return () => previous?.focus?.()
  }, [])
  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="dialog help-guide" role="dialog" aria-modal="true" aria-labelledby="help-title" ref={box}>
        <div className="help-head">
          <h2 id="help-title">Quick guide</h2>
          <button type="button" className="btn help-close" onClick={onClose} title="Close the guide (Esc)">
            Close
          </button>
        </div>
        <div className="help-body">
          <p>
            AxisBuilder turns the field form, the AUT CSV and the scan photos into the AUT coverage drawing. Everything
            stays on this computer, and it works offline once it has been opened. Work through the steps in the bar at
            the top; each shows Done, Needs attention or Not started, and Next takes you on.
          </p>
          <h3>The steps</h3>
          <ol className="help-steps">
            {STEPS.map((s) => (
              <li key={s.id}>
                <strong>{s.title}.</strong> {GUIDE_STEPS[s.id]}
              </li>
            ))}
          </ol>
          <h3>The export files</h3>
          <dl className="help-files">
            {GUIDE_FILES.map((f) => (
              <div key={f.name}>
                <dt>{f.name}</dt>
                <dd>{f.text}</dd>
              </div>
            ))}
          </dl>
          <h3>Keys</h3>
          {GUIDE_KEYS.map((g) => (
            <table key={g.where} className="help-keys">
              <caption>{g.where}</caption>
              <tbody>
                {g.keys.map(([k, what]) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td>{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          <p className="muted">Every setting has a short description under it; Find a setting in the top bar finds one by name.</p>
          <div className="help-theme">
            <ThemeSwitch />
            <p className="muted">{GUIDE_THEME}</p>
          </div>
          <h3>Something not right?</h3>
          <p>
            Report a problem copies the app version, the browser, the screen and the last error (no job data, no client
            names) and opens an email with them. Add a line about what you were doing.
          </p>
          <div className="button-row">
            <ReportProblem details={() => problemDetails(where)} />
          </div>
          <p className="muted help-version">AxisBuilder version {appVersion()}</p>
        </div>
      </div>
    </div>
  )
}
