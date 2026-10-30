// The comment builder's picks for a scan result or a manual reading (design 4.3.1): severity (the ladder's, or chosen
// by hand: flagged), form, cause, surface, mid-wall indication, and a free-text comment instead of the built one
// (flagged). The choices and their wording come from the job's template.

import type { Project } from '../../data/schema.ts'
import type { BuiltComment, CommentPicks as Picks } from '../../report/calc/ladder.ts'
import type { LadderDef } from '../../report/templates/types.ts'
import type { ReportStepId } from '../../state/session.ts'
import { Flag, ReportBox, ReportSelect } from './boxes.tsx'

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
