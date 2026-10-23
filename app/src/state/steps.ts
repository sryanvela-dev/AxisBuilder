// The six steps of a job and their status (done / needs attention / not started), computed from
// the project's checks (data/checks.ts: missing values, repeated names, values outside the shell,
// ...), typed values that are not valid yet (drafts) and the import report. Pure functions, no React.

import { checkProject, checkSentence, type Check } from '../data/checks.ts'
import type { ListKey, Project } from '../data/schema.ts'
import { fieldDef } from '../data/settings.ts'
import type { ReportEntry } from '../data/xlsmImport.ts'
import { STEP_IDS, type Job, type StepId, type WorkbookImport } from './session.ts'

export interface StepInfo {
  id: StepId
  title: string
  /** One line under the title on the step page. */
  intro: string
}

export const STEPS: readonly StepInfo[] = [
  { id: 'project', title: 'Project', intro: 'Job information and the size and orientation of the shell.' },
  { id: 'fieldData', title: 'Field data', intro: 'Welds, nozzles, objects and MUT readings from the field form.' },
  { id: 'scans', title: 'AUT scans', intro: 'Scan positions from the AUT CSV.' },
  { id: 'images', title: 'Images', intro: 'A photo for each AUT scan.' },
  { id: 'review', title: 'Review', intro: 'Everything still open before the drawing can be made.' },
  { id: 'export', title: 'Export', intro: 'Make the CAD drawing file.' },
]

export function stepInfo(id: StepId): StepInfo {
  return STEPS.find((s) => s.id === id)!
}

export function nextStep(id: StepId): StepId | null {
  const i = STEP_IDS.indexOf(id)
  return STEP_IDS[i + 1] ?? null
}

export type StepState = 'done' | 'attention' | 'notStarted'

export interface Issue {
  step: StepId
  text: string
  /** True when export refuses until it is fixed (missing values, repeated names). */
  blocksExport: boolean
  /** The check behind this issue, when it comes from one. */
  check?: Check
}

export interface StepStatus {
  state: StepState
  /** Short text for the step bar, e.g. "3 to fix". */
  short: string
  issues: Issue[]
}

const FIELD_LISTS: ListKey[] = ['circWelds', 'longSeams', 'shellNozzles', 'objects', 'shellMut', 'headNozzles', 'headMut']

/** Workbook sheet -> step whose data it holds. */
const SHEET_STEP: Record<string, StepId> = {
  'Project Settings': 'project',
  'Drawing Information': 'project',
  'Shell Features': 'fieldData',
  'Head Features': 'fieldData',
  'Scan Import': 'scans',
  'Scan Images': 'images',
}

/** Every report entry about the data of this step. */
export function reportEntriesForStep(wb: WorkbookImport | null, step: StepId): ReportEntry[] {
  return wb ? wb.report.filter((e) => (SHEET_STEP[e.sheet] ?? 'project') === step) : []
}

/** Report entries that need a person to look at them (unusable or REVIEW/highlighted values), until marked as checked. */
export function reportEntriesToCheck(wb: WorkbookImport | null, step: StepId): ReportEntry[] {
  if (!wb || wb.checkedSteps.includes(step)) return []
  return reportEntriesForStep(wb, step).filter((e) => e.kind === 'invalid' || e.kind === 'review')
}

/** The step whose page holds each list. */
export const STEP_OF_LIST: Record<ListKey, StepId> = {
  circWelds: 'fieldData', longSeams: 'fieldData', shellNozzles: 'fieldData', objects: 'fieldData', shellMut: 'fieldData',
  headNozzles: 'fieldData', headMut: 'fieldData', scans: 'scans', scanImages: 'images',
}
const STEP_OF_APP_STEP: Record<string, StepId> = { Project: 'project', 'Field data': 'fieldData', 'AUT scans': 'scans', Images: 'images', Export: 'export' }

/** The step whose page shows the check. */
export function stepOfCheck(c: Check): StepId {
  if (c.place.kind === 'photo') return 'images'
  if (c.place.kind !== 'setting') return STEP_OF_LIST[c.place.list]
  const def = fieldDef(c.place.section, c.place.key)
  return def ? STEP_OF_APP_STEP[def.step] : 'project'
}

/** Checks and typed-but-invalid values of one step, as issues. Errors and drafts block export. */
function stepIssues(job: Job, checks: Check[], step: StepId): Issue[] {
  const p = job.history.present
  const out: Issue[] = checks
    .filter((c) => stepOfCheck(c) === step)
    .map((c) => ({ step, text: checkSentence(p, c), blocksExport: c.severity === 'error', check: c }))
  for (const d of Object.values(job.drafts)) {
    if (d.step === step) out.push({ step, text: `${d.where}: "${d.text}" is not stored. ${d.problem}`, blocksExport: true })
  }
  return out
}

function reportIssue(wb: WorkbookImport | null, step: StepId): Issue[] {
  const n = reportEntriesToCheck(wb, step).length
  if (n === 0) return []
  return [{ step, text: `${plural(n, 'imported value')} from the Excel job ${n === 1 ? 'needs' : 'need'} checking (see the import report).`, blocksExport: false }]
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function status(started: boolean, issues: Issue[]): StepStatus {
  const fix = issues.filter((i) => i.blocksExport).length
  const check = issues.length - fix
  if (issues.length > 0) {
    const short = fix > 0 ? `${fix} to fix` : `${check} to check`
    return { state: 'attention', short, issues }
  }
  return started ? { state: 'done', short: 'Done', issues } : { state: 'notStarted', short: 'Not started', issues }
}

/** Status of every step, in order. */
export function stepStatuses(job: Job): Record<StepId, StepStatus> {
  const p = job.history.present
  const wb = job.workbookImport
  const checks = checkProject(p)

  const projectIssues = [...stepIssues(job, checks, 'project'), ...reportIssue(wb, 'project')]
  const projectStarted = p.project.projectName.trim() !== '' || p.vessel.length !== null || p.vessel.height !== null
  const project = status(projectStarted, projectStarted || wb ? projectIssues : [])

  const fieldStarted = FIELD_LISTS.some((k) => p[k].length > 0)
  const fieldData = status(fieldStarted, [...stepIssues(job, checks, 'fieldData'), ...reportIssue(wb, 'fieldData')])

  const scansStarted = p.scans.length > 0
  const scans = status(scansStarted, [...stepIssues(job, checks, 'scans'), ...reportIssue(wb, 'scans')])

  const images = imageStatus(p, wb, stepIssues(job, checks, 'images'))

  const before = [project, fieldData, scans, images]
  const open = before.flatMap((s) => s.issues)
  const todo: Issue[] = []
  if (!scansStarted) todo.push({ step: 'scans', text: 'No AUT scans yet.', blocksExport: false })
  const anyStarted = before.some((s) => s.state !== 'notStarted')
  const review = status(anyStarted, anyStarted ? [...open, ...todo] : [])

  const exportBlockers = open.filter((i) => i.blocksExport)
  const exportStatus: StepStatus =
    exportBlockers.length > 0
      ? { state: 'attention', short: `${exportBlockers.length} to fix`, issues: exportBlockers }
      : { state: 'notStarted', short: 'Not started', issues: [] }

  return { project, fieldData, scans, images, review, export: exportStatus }
}

function imageStatus(p: Project, wb: WorkbookImport | null, checkIssues: Issue[]): StepStatus {
  if (p.scans.length === 0) return { state: 'notStarted', short: 'Not started', issues: [] }
  // Missing photos come from the checks (data/checks.ts, v5.0's rule).
  return status(p.scanImages.length > 0, [...checkIssues, ...reportIssue(wb, 'images')])
}

/** Short lines for the "before export" banner: what is left, grouped by step. Empty when ready. */
export function whatsLeft(statuses: Record<StepId, StepStatus>): { step: StepId; text: string }[] {
  const out: { step: StepId; text: string }[] = []
  for (const id of ['project', 'fieldData', 'scans', 'images'] as const) {
    const s = statuses[id]
    const fix = s.issues.filter((i) => i.blocksExport).length
    const check = s.issues.length - fix
    const title = stepInfo(id).title
    if (fix > 0) out.push({ step: id, text: `${title}: ${plural(fix, 'thing')} to fix` })
    if (check > 0) out.push({ step: id, text: `${title}: ${plural(check, 'thing')} to check` })
    if (id === 'scans' && s.state === 'notStarted') out.push({ step: id, text: 'AUT scans: not imported yet' })
  }
  return out
}
