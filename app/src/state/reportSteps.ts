// The Report workspace's steps and their status (done / needs attention / not started), like state/steps.ts for the
// drawing: issues come from the report checks (report/checks.ts: a component on Setup, a scan on AUT results, a reading
// on Manual UT) and from typed values on a report step that are not valid yet (drafts). Pure functions, no React.
//
// Every step is built (R4): the checks of design section 9 and 14 land on the step whose page fixes them; notes (a
// redaction waiting for R5, marks outside the crop) are listed with the warnings and never block.

import { checkReport, sectionStep, type ReportCheck } from '../report/checks.ts'
import { calibrationSchema } from '../report/schema.ts'
import { templateOf } from '../report/templates/registry.ts'
import type { ReportTemplate } from '../report/templates/types.ts'
import { REPORT_STEP_IDS, type Job, type ReportStepId } from './session.ts'
import { plural, type StepState } from './steps.ts'

export interface ReportStepInfo {
  id: ReportStepId
  title: string
  intro: string
  /** Not built yet: the step shows "Coming later". */
  later?: boolean
}

export const REPORT_STEPS: readonly ReportStepInfo[] = [
  { id: 'setup', title: 'Setup', intro: 'Template, the report’s own job fields, examiners, components and which sections are in the report.' },
  { id: 'calibration', title: 'Calibration', intro: 'Calibration block, AUT system, transducers and scanner, the scan increments and temperature correction.' },
  { id: 'results', title: 'AUT results', intro: 'Results per scan from the scansheet, the comment for each scan and its data-page screenshot.' },
  { id: 'manual', title: 'Manual UT', intro: 'UTT and MUT scan readings: the drawing’s MUT rows and readings of your own, such as nozzles.' },
  { id: 'pages', title: 'Photos and pages', intro: 'Photos, custom sheets, reference pages and which drawings go in.' },
  { id: 'summary', title: 'Summary', intro: 'Number tiles, the scope and the summary text.' },
  { id: 'reportReview', title: 'Review', intro: 'Everything still open before the report can be made.' },
  { id: 'reportExport', title: 'Export', intro: 'Make the report PDF.' },
]

export function reportStepInfo(id: ReportStepId): ReportStepInfo {
  return REPORT_STEPS.find((s) => s.id === id)!
}

export function nextReportStep(id: ReportStepId): ReportStepId | null {
  return REPORT_STEP_IDS[REPORT_STEP_IDS.indexOf(id) + 1] ?? null
}

export interface ReportIssue {
  step: ReportStepId
  text: string
  /** How to fix it (from the check). */
  fix?: string
  /** True when the report PDF refuses until it is fixed. */
  blocksExport: boolean
  /** For information only (listed with the warnings). */
  note?: boolean
  check?: ReportCheck
}

export interface ReportStepStatus {
  state: StepState
  short: string
  issues: ReportIssue[]
}

/** The step whose page shows a report check. */
/** The step that lists a report check. */
export function stepOfReportCheck(c: ReportCheck, t?: ReportTemplate): ReportStepId {
  return c.listOn ?? placeStep(c.place, t)
}

/** The step whose page shows a place (where Go to takes you). */
export function placeStep(pl: ReportCheck['place'], t?: ReportTemplate): ReportStepId {
  switch (pl.kind) {
    case 'picture': {
      const k = pl.at.kind
      return k === 'cover' ? 'setup' : k === 'calibration' ? 'calibration' : k === 'dataImage' ? 'results' : 'pages'
    }
    case 'field': return pl.step
    case 'section': {
      const def = t?.sections.find((d) => d.id === pl.id)
      return def ? sectionStep(def) : 'setup'
    }
    case 'sheet': return 'pages'
    case 'component': return 'setup'
    case 'scan': return 'results'
    case 'reading': return 'manual'
  }
}

const BUILT = ['setup', 'calibration', 'results', 'manual', 'pages', 'summary'] as const

/** Notes are listed (Review, the step's own list) but don't make a step need attention. */
function status(started: boolean, issues: ReportIssue[]): ReportStepStatus {
  const fix = issues.filter((i) => i.blocksExport).length
  const counted = issues.filter((i) => !i.note).length
  if (counted > 0) return { state: 'attention', short: fix > 0 ? `${fix} to fix` : `${counted - fix} to check`, issues }
  return started ? { state: 'done', short: 'Done', issues } : { state: 'notStarted', short: 'Not started', issues }
}

const DEFAULT_CALIBRATION = JSON.stringify(calibrationSchema.parse({}))

/** Status of every report step, in order. A job without a report has nothing started. */
export function reportStepStatuses(job: Job): Record<ReportStepId, ReportStepStatus> {
  const p = job.history.present
  const report = p.report
  const t = report ? templateOf(report.templateId) : undefined
  const issues: ReportIssue[] = checkReport(p).map((c) => ({
    step: stepOfReportCheck(c, t), text: c.text, fix: c.fix, blocksExport: c.severity === 'error', check: c, ...(c.severity === 'note' && { note: true }),
  }))
  for (const d of Object.values(job.drafts)) {
    if ((REPORT_STEP_IDS as readonly string[]).includes(d.step)) {
      issues.push({ step: d.step as ReportStepId, text: `${d.where}: "${d.text}" is not stored. ${d.problem}`, blocksExport: true })
    }
  }
  const on = (step: ReportStepId) => issues.filter((i) => i.step === step)
  const started: Record<(typeof BUILT)[number], boolean> = {
    setup: report !== null,
    calibration: report !== null && JSON.stringify(report.calibration) !== DEFAULT_CALIBRATION,
    results: (report?.scanResults.length ?? 0) > 0,
    manual: (report?.readings.length ?? 0) > 0,
    pages: report !== null && report.photos.length + report.customSheets.length + report.uploads.length > 0,
    // The tiles and text are there as soon as there are results; the user's own text or switches count too.
    summary: report !== null && (report.scanResults.length > 0 || report.text.scope.edited !== null || report.text.summary.edited !== null),
  }
  const built = Object.fromEntries(BUILT.map((s) => [s, status(started[s], on(s))])) as Record<(typeof BUILT)[number], ReportStepStatus>
  const anyStarted = report !== null
  return {
    ...built,
    reportReview: status(anyStarted, anyStarted ? issues : []),
    reportExport: exportStatus(anyStarted ? issues : []),
  }
}

/** Export: what blocks the PDF (the Review list's errors), else ready. */
function exportStatus(issues: ReportIssue[]): ReportStepStatus {
  const fix = issues.filter((i) => i.blocksExport)
  return fix.length ? { state: 'attention', short: `${fix.length} to fix`, issues: fix } : { state: 'notStarted', short: 'Ready', issues: [] }
}

export interface ReportReviewGroup {
  step: ReportStepId
  issues: ReportIssue[]
}

/** The report Review list: what blocks the PDF first, then warnings, each grouped by step in step order. */
export function reportReviewList(review: ReportStepStatus): { errors: ReportReviewGroup[]; warnings: ReportReviewGroup[] } {
  const group = (list: ReportIssue[]) =>
    REPORT_STEP_IDS.map((step) => ({ step, issues: list.filter((i) => i.step === step) })).filter((g) => g.issues.length > 0)
  return { errors: group(review.issues.filter((i) => i.blocksExport)), warnings: group(review.issues.filter((i) => !i.blocksExport)) }
}

/** Short lines for the report's "before export" banner. Empty when nothing is left. */
export function reportWhatsLeft(statuses: Record<ReportStepId, ReportStepStatus>): { step: ReportStepId; text: string }[] {
  const out: { step: ReportStepId; text: string }[] = []
  for (const id of BUILT) {
    const s = statuses[id]
    const fix = s.issues.filter((i) => i.blocksExport).length
    const check = s.issues.filter((i) => !i.note).length - fix
    const title = reportStepInfo(id).title
    if (fix > 0) out.push({ step: id, text: `${title}: ${plural(fix, 'thing')} to fix` })
    if (check > 0) out.push({ step: id, text: `${title}: ${plural(check, 'thing')} to check` })
  }
  return out
}
