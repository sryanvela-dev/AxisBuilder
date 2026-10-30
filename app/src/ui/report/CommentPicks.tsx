// The comment builder's picks for a scan result or a manual reading (design 4.3.1): severity (the ladder's, or chosen
// by hand: flagged), form, cause, surface, mid-wall indication, and a free-text comment instead of the built one
// (flagged). The choices and their wording come from the job's template.

import { useState } from 'react'
import type { Project } from '../../data/schema.ts'
import { setPicksForAll } from '../../report/edits.ts'
import { useApp } from '../appContext.ts'
import type { BuiltComment, CommentPicks as Picks } from '../../report/calc/ladder.ts'
import type { LadderDef } from '../../report/templates/types.ts'
import type { ReportStepId } from '../../state/session.ts'
import { Flag, ReportBox, ReportSelect } from './boxes.tsx'

/** "Keep each" in the for-all choices (no choice id is this). */
const KEEP = '\u0000keep'

export function CommentPicks(props: {
  ladder: LadderDef
  picks: Picks
  /** The comment as built now (null when there is no wall loss yet). */
  comment: BuiltComment | null
  /** The ladder's own severity for the row (null without a wall loss). */
  ladderSeverity: string | null
  set: (p: Project, change: Partial<Picks>) => Project
  boxKey: string
  step: ReportStepId
  /** "SCAN 3", "Nozzle 3 North": for the list of problems. */
  name: string
}) {
  const { ladder, picks } = props
  const ladderLabel = props.ladderSeverity === null ? 'no wall loss yet' : (ladder.severity.find((s) => s.id === props.ladderSeverity)?.label ?? '')
  const common = { step: props.step, compact: false }
  return (
    <div className="comment-picks">
      <div className="field-grid">
        <ReportSelect {...common} label="Severity" where={`${props.name}, severity`}
          value={picks.severityOverride ?? ''}
          options={[{ value: '', label: `From the ladder (${ladderLabel})` }, ...ladder.severity.map((s) => ({ value: s.id, label: s.label }))]}
          set={(q, v: string) => props.set(q, { severityOverride: v === '' ? null : v })} boxKey={`${props.boxKey}.severityOverride`}
          tag={props.comment?.severityOverridden ? <Flag title="Chosen by hand: differs from the ladder">flagged</Flag> : undefined}
          help="Set by the wall loss; choose one only to override it." />
        <ReportSelect {...common} label="Form" where={`${props.name}, form`} value={picks.form} options={ladder.forms.map((c) => ({ value: c.id, label: c.label }))}
          set={(q, v: string) => props.set(q, { form: v })} boxKey={`${props.boxKey}.form`} />
        <ReportSelect {...common} label="Cause" where={`${props.name}, cause`} value={picks.cause} options={ladder.causes.map((c) => ({ value: c.id, label: c.label }))}
          set={(q, v: string) => props.set(q, { cause: v })} boxKey={`${props.boxKey}.cause`} help="The comment never names a cause you didn't pick." />
        <ReportSelect {...common} label="Surface" where={`${props.name}, surface`} value={picks.surface} options={ladder.surfaces.map((c) => ({ value: c.id, label: c.label }))}
          set={(q, v: string) => props.set(q, { surface: v })} boxKey={`${props.boxKey}.surface`} />
        <ReportSelect {...common} label="Mid-wall indication" where={`${props.name}, mid-wall`} value={picks.midWall} options={ladder.midWall.map((c) => ({ value: c.id, label: c.label }))}
          set={(q, v: string) => props.set(q, { midWall: v })} boxKey={`${props.boxKey}.midWall`} />
        <ReportBox {...common} wide multiline kind="optText" label="Comment written by hand" where={`${props.name}, comment`} value={picks.commentOverride}
          placeholder={props.comment && !props.comment.freeText ? props.comment.text : 'The built comment'}
          set={(q, v: string | null) => props.set(q, { commentOverride: v })} boxKey={`${props.boxKey}.commentOverride`}
          tag={picks.commentOverride ? <Flag title="Replaces the built comment; listed on Review">flagged</Flag> : undefined}
          help="Leave blank to use the built comment. Text here replaces it in the report." />
      </div>
    </div>
  )
}

/** The comment as the table shows it, with its flags. */
export function CommentText({ comment }: { comment: BuiltComment | null }) {
  if (!comment) return <span className="muted">–</span>
  return (
    <span className="comment-text">
      {comment.text}
      {comment.freeText && <Flag title="Written by hand">by hand</Flag>}
      {comment.severityOverridden && <Flag title="Severity chosen by hand">severity</Flag>}
    </span>
  )
}

/** Wall loss in its ladder color (Moderate amber, Significant red). */
export function WallLoss({ value, color }: { value: number | null; color: string | null }) {
  if (value === null) return <span className="muted">–</span>
  return <span className={`wall-loss ladder-${color ?? 'normal'}`}>{value.toFixed(2)}%</span>
}

/**
 * One form and cause for every scan and every manual reading at once (one undo step); each row can still be changed on
 * its own afterwards. "Keep each" leaves that pick as it is on every row.
 */
export function PicksForAll({ ladder }: { ladder: LadderDef }) {
  const app = useApp()
  const p = app.state.job!.history.present
  const [form, setForm] = useState(KEEP)
  const [cause, setCause] = useState(KEEP)
  const [done, setDone] = useState('')
  const rows = p.scans.length + (p.report?.readings.length ?? 0)
  const chosen = form !== KEEP || cause !== KEEP
  function apply() {
    const picks = { ...(form !== KEEP && { form }), ...(cause !== KEEP && { cause }) }
    app.edit('Set form and cause for all', (q) => setPicksForAll(q, picks))
    setDone(`Set on ${p.scans.length} scans and ${p.report?.readings.length ?? 0} manual readings. Change any row on its own, or Ctrl+Z to undo.`)
    setForm(KEEP)
    setCause(KEEP)
  }
  return (
    <div className="picks-for-all">
      <span className="field-label">For every scan and manual reading:</span>
      <label>
        <span className="muted">Form </span>
        <select value={form} onChange={(e) => { setForm(e.target.value); setDone('') }}>
          <option value={KEEP}>Keep each</option>
          {ladder.forms.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <label>
        <span className="muted">Cause </span>
        <select value={cause} onChange={(e) => { setCause(e.target.value); setDone('') }}>
          <option value={KEEP}>Keep each</option>
          {ladder.causes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <button type="button" className="btn" disabled={!chosen || rows === 0} onClick={apply}
        title="Sets the form and cause on every scan (AUT results) and every manual reading (Manual UT)">
        Apply to all
      </button>
      {done && <span className="muted" role="status">{done}</span>}
    </div>
  )
}
