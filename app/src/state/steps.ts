// The six steps of a job and their status (done / needs attention / not started), computed from
// the project, its import reports, missing values (findMissingData) and repeated names
// (findDuplicateIds). Pure functions, no React.

import { findDuplicateIds, findMissingData, type ListKey, type Project } from '../data/schema.ts'
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
}

export interface StepStatus {
  state: StepState
  /** Short text for the step bar, e.g. "3 to fix". */
  short: string
  issues: Issue[]
}

const FIELD_LISTS: ListKey[] = ['circWelds', 'longSeams', 'shellNozzles', 'objects', 'shellMut', 'headNozzles', 'headMut']
const SCAN_LISTS: ListKey[] = ['scans']
const ALL_LISTS: ListKey[] = [...FIELD_LISTS, 'scans', 'scanImages']

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

/** The project with only the given lists kept (and the vessel size filled when not wanted). */
function only(project: Project, lists: ListKey[], withVessel: boolean): Project {
  const out: Project = { ...project }
  for (const key of ALL_LISTS) if (!lists.includes(key)) (out[key] as unknown[]) = []
  if (!withVessel) out.vessel = { ...project.vessel, length: 1, height: 1 }
  return out
}

function blockers(project: Project, step: StepId, lists: ListKey[], withVessel: boolean): Issue[] {
  const part = only(project, lists, withVessel)
  return [...findMissingData(part), ...findDuplicateIds(part)].map((text) => ({ step, text, blocksExport: true }))
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

  const projectIssues = [...blockers(p, 'project', [], true), ...reportIssue(wb, 'project')]
  if (p.project.projectName.trim() === '') projectIssues.push({ step: 'project', text: 'Project name is not entered yet.', blocksExport: false })
  const projectStarted = p.project.projectName.trim() !== '' || p.vessel.length !== null || p.vessel.height !== null
  const project = status(projectStarted, projectStarted || wb ? projectIssues : [])

  const fieldStarted = FIELD_LISTS.some((k) => p[k].length > 0)
  const fieldData = status(fieldStarted, [...blockers(p, 'fieldData', FIELD_LISTS, false), ...reportIssue(wb, 'fieldData')])

  const scansStarted = p.scans.length > 0
  const scans = status(scansStarted, [...blockers(p, 'scans', SCAN_LISTS, false), ...reportIssue(wb, 'scans')])

  const images = imageStatus(p, wb)

  const before = [project, fieldData, scans, images]
  const open = before.flatMap((s) => s.issues)
  const todo: Issue[] = []
  if (!scansStarted) todo.push({ step: 'scans', text: 'No AUT scans yet.', blocksExport: false })
  else if (images.state === 'notStarted') todo.push({ step: 'images', text: 'No photos linked yet.', blocksExport: false })
  const anyStarted = before.some((s) => s.state !== 'notStarted')
  const review = status(anyStarted, anyStarted ? [...open, ...todo] : [])

  const exportBlockers = open.filter((i) => i.blocksExport)
  const exportStatus: StepStatus =
    exportBlockers.length > 0
      ? { state: 'attention', short: `${exportBlockers.length} to fix`, issues: exportBlockers }
      : { state: 'notStarted', short: 'Not started', issues: [] }

  return { project, fieldData, scans, images, review, export: exportStatus }
}

/** Included scans that have no photo chosen yet (a link switched off counts as dealt with). */
export function scansWithoutImage(project: Project): string[] {
  const links = new Map(project.scanImages.map((l) => [l.scanId.trim().toLowerCase(), l]))
  return project.scans
    .filter((s) => s.include)
    .filter((s) => {
      const link = links.get(s.id.trim().toLowerCase())
      return !link || (link.include && link.imageFile.trim() === '')
    })
    .map((s) => s.id)
}

function imageStatus(p: Project, wb: WorkbookImport | null): StepStatus {
  if (p.scans.length === 0) return { state: 'notStarted', short: 'Not started', issues: [] }
  const missing = scansWithoutImage(p)
  const started = p.scanImages.length > 0
  const issues = [...blockers(p, 'images', ['scanImages'], false), ...reportIssue(wb, 'images')]
  if (started && missing.length > 0) {
    issues.unshift({ step: 'images', text: `${plural(missing.length, 'scan')} ${missing.length === 1 ? 'has' : 'have'} no photo yet.`, blocksExport: false })
  }
  return status(started, issues)
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
    if (id === 'images' && s.state === 'notStarted' && statuses.scans.state !== 'notStarted') {
      out.push({ step: id, text: 'Images: no photos linked yet' })
    }
  }
  return out
}
