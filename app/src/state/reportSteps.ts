// The Report workspace's steps and their status (done / needs attention / not started), like state/steps.ts for the
// drawing: issues come from the report checks (report/checks.ts: a component on Setup, a scan on AUT results, a reading
// on Manual UT) and from typed values on a report step that are not valid yet (drafts). Pure functions, no React.
//
// R2 builds Setup, Calibration, AUT results, Manual UT and a first Review; Photos and pages, Summary and Export show
// "Coming later" (R3 / R4), and the full Review list comes with R4.

import { checkReport, type ReportCheck } from '../report/checks.ts'
import { calibrationSchema } from '../report/schema.ts'
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
  { id: 'pages', title: 'Photos and pages', intro: 'Photos, custom sheets, reference pages and which drawings go in.', later: true },
  { id: 'summary', title: 'Summary', intro: 'Number tiles, the scope and the summary text.', later: true },
  { id: 'reportReview', title: 'Review', intro: 'Everything still open before the report can be made.' },
  { id: 'reportExport', title: 'Export', intro: 'Make the report PDF.', later: true },
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
  check?: ReportCheck
}

export interface ReportStepStatus {
  state: StepState
  short: string
  issues: ReportIssue[]
}

/** The step whose page shows a report check. */
export function stepOfReportCheck(c: ReportCheck): ReportStepId {
  return c.place.kind === 'component' ? 'setup' : c.place.kind === 'scan' ? 'results' : 'manual'
}

const BUILT = ['setup', 'calibration', 'results', 'manual'] as const

function status(started: boolean, issues: ReportIssue[]): ReportStepStatus {
  const fix = issues.filter((i) => i.blocksExport).length
  if (issues.length > 0) return { state: 'attention', short: fix > 0 ? `${fix} to fix` : `${issues.length - fix} to check`, issues }
  return started ? { state: 'done', short: 'Done', issues } : { state: 'notStarted', short: 'Not started', issues }
}

const LATER: ReportStepStatus = { state: 'notStarted', short: 'Coming later', issues: [] }

const DEFAULT_CALIBRATION = JSON.stringify(calibrationSchema.parse({}))

/** Status of every report step, in order. A job without a report has nothing started. */
export function reportStepStatuses(job: Job): Record<ReportStepId, ReportStepStatus> {
  const p = job.history.present
  const report = p.report
  const issues: ReportIssue[] = checkReport(p).map((c) => ({ step: stepOfReportCheck(c), text: c.text, fix: c.fix, blocksExport: c.severity === 'error', check: c }))
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
  }
  const built = Object.fromEntries(BUILT.map((s) => [s, status(started[s], on(s))])) as Record<(typeof BUILT)[number], ReportStepStatus>
  const anyStarted = report !== null
  return {
    ...built,
    pages: LATER,
    summary: LATER,
    reportReview: status(anyStarted, anyStarted ? issues : []),
    reportExport: LATER,
  }
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
    const check = s.issues.length - fix
    const title = reportStepInfo(id).title
    if (fix > 0) out.push({ step: id, text: `${title}: ${plural(fix, 'thing')} to fix` })
    if (check > 0) out.push({ step: id, text: `${title}: ${plural(check, 'thing')} to check` })
  }
  return out
}
