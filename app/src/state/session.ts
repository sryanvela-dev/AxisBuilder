// The open job and everything the app knows about it, in one place. Pure reducer, no React:
// AppStore (ui/AppStore.tsx) runs it with useReducer.
//
// Only the project itself is in the undo history. Where the job is saved, the current step and
// the import reports are not: undo never "unsaves" a file or jumps between screens.

import type { AutImportResult } from '../data/autCsvImport.ts'
import { syncLabelOverrides } from '../data/overrides.ts'
import { syncReport } from '../report/sync.ts'
import type { ReportTarget } from '../data/reportTargets.ts'
import type { Project } from '../data/schema.ts'
import type { ImportSummary, ReportEntry } from '../data/xlsmImport.ts'
import { canRedo, canUndo, createHistory, endGroup, record, redo, undo, type History } from './history.ts'

export const STEP_IDS = ['project', 'fieldData', 'scans', 'images', 'drawing', 'review', 'export'] as const
export type StepId = (typeof STEP_IDS)[number]

export type JobSource = 'new' | 'file' | 'import' | 'sample' | 'recovery'

/** A file handle from the File System Access API (Edge/Chrome). Kept loose so tests can fake it. */
export interface FileHandleLike {
  readonly kind: 'file'
  readonly name: string
  getFile(): Promise<File>
  createWritable?(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>
  queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

export interface JobFile {
  /** File name, e.g. "V-101.axb". */
  name: string
  /** Where Save writes without asking for a place (Edge/Chrome); null = Save asks where. */
  handle: FileHandleLike | null
  /** The file's last-modified time when it was opened or saved, to notice changes made elsewhere. */
  lastModified: number | null
  /** True once replacing this file was agreed to (or the app made it): Save then writes without asking. */
  writeConfirmed: boolean
}

/** Report of an imported v5.0 workbook. Its "needs checking" entries count until marked as checked. */
export interface WorkbookImport {
  fileName: string
  report: ReportEntry[]
  summary: ImportSummary
  /** Steps whose report entries the user marked as checked. */
  checkedSteps: StepId[]
  /** Per report entry (same order): the setting or row it is about, found when the job was imported. */
  targets?: (ReportTarget | null)[]
}


/** Text typed into a box that is not a valid value yet. It is not stored in the project (and not undone). */
export interface Draft {
  text: string
  problem: string
  step: StepId
  /** Where it is, e.g. "Shell nozzles, row 3 (N3), Diameter". */
  where: string
}

export interface Job {
  /** Stable id of this job in the browser (recent jobs, recovery copy). */
  id: string
  history: History<Project>
  /** The project as it was last opened from or saved to a file; null = never saved. */
  savedProject: Project | null
  source: JobSource
  file: JobFile | null
  workbookImport: WorkbookImport | null
  autImport: { fileName: string; result: AutImportResult } | null
  step: StepId
  /** Typed values that are not valid yet, by box (see draftKey). The first undo (or any redo) clears them. */
  drafts: Record<string, Draft>
}

export interface SessionState {
  job: Job | null
}

export type SessionAction =
  | {
      type: 'openJob'
      project: Project
      source: JobSource
      id?: string
      file?: JobFile | null
      /** True when the project is exactly what the file holds (opened from a file). */
      saved?: boolean
      workbookImport?: WorkbookImport | null
      step?: StepId
    }
  | { type: 'closeJob' }
  | { type: 'edit'; label: string; group?: string; update: (project: Project) => Project }
  /** Leaving a box: the next change is a new undo step. */
  | { type: 'endEditGroup' }
  | { type: 'setDraft'; key: string; draft: Draft | null }
  /** Forgets drafts whose key starts with the prefix (rows moved or deleted). */
  | { type: 'clearDrafts'; prefix: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved'; project: Project; file: JobFile }
  | { type: 'goToStep'; step: StepId }
  | { type: 'setAutImport'; fileName: string; result: AutImportResult }
  | { type: 'markReportChecked'; step: StepId }

export const initialSession: SessionState = { job: null }

export function newJobId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `job-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  if (action.type === 'openJob') {
    return {
      job: {
        id: action.id ?? newJobId(),
        history: createHistory(action.project),
        savedProject: action.saved ? action.project : null,
        source: action.source,
        file: action.file ?? null,
        workbookImport: action.workbookImport ?? null,
        autImport: null,
        step: action.step ?? 'project',
        drafts: {},
      },
    }
  }
  if (action.type === 'closeJob') return { job: null }

  const job = state.job
  if (!job) return state
  switch (action.type) {
    case 'edit': {
      // Labels moved by hand follow renamed nozzles and go with deleted ones (data/overrides.ts); so do the report's
      // scan results and readings (report/sync.ts).
      const prev = job.history.present
      const next = syncReport(prev, syncLabelOverrides(prev, action.update(prev)))
      const history = record(job.history, next, { label: action.label, group: action.group })
      return history === job.history ? state : { job: { ...job, history } }
    }
    case 'endEditGroup': {
      const history = endGroup(job.history)
      return history === job.history ? state : { job: { ...job, history } }
    }
    case 'undo':
      // Text typed but not stored yet is what the user sees last: the first undo throws it away.
      if (Object.keys(job.drafts).length > 0) return { job: { ...job, drafts: {}, history: endGroup(job.history) } }
      return canUndo(job.history) ? { job: { ...job, history: undo(job.history) } } : state
    case 'redo':
      return canRedo(job.history) ? { job: { ...job, history: redo(job.history), drafts: {} } } : state
    case 'setDraft': {
      if (action.draft === null && !(action.key in job.drafts)) return state
      const drafts = { ...job.drafts }
      if (action.draft) drafts[action.key] = action.draft
      else delete drafts[action.key]
      return { job: { ...job, drafts } }
    }
    case 'clearDrafts': {
      const keys = Object.keys(job.drafts).filter((k) => k.startsWith(action.prefix))
      if (keys.length === 0) return state
      const drafts = { ...job.drafts }
      for (const k of keys) delete drafts[k]
      return { job: { ...job, drafts } }
    }
    case 'saved':
      return { job: { ...job, savedProject: action.project, file: action.file } }
    case 'goToStep':
      return job.step === action.step ? state : { job: { ...job, step: action.step } }
    case 'setAutImport':
      return { job: { ...job, autImport: { fileName: action.fileName, result: action.result } } }
    case 'markReportChecked': {
      const wb = job.workbookImport
      if (!wb || wb.checkedSteps.includes(action.step)) return state
      return { job: { ...job, workbookImport: { ...wb, checkedSteps: [...wb.checkedSteps, action.step] } } }
    }
  }
}

/** True when the project has changes that are not in its file (or it was never saved). */
export function isDirty(job: Job): boolean {
  return job.savedProject !== job.history.present
}

/** Name to show for the job: project name, else file name, else "Untitled job". */
/** Key of a box for drafts and undo groups: "vessel.length", "shellNozzles.3.diameter". */
export function draftKey(...parts: (string | number)[]): string {
  return parts.join('.')
}

export function jobTitle(job: Job): string {
  const name = job.history.present.project.projectName.trim()
  if (name) return name
  if (job.file) return job.file.name.replace(/\.(axb|json)$/i, '')
  return 'Untitled job'
}
