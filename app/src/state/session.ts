// The open job and everything the app knows about it, in one place. Pure reducer, no React:
// AppStore (ui/AppStore.tsx) runs it with useReducer.
//
// Only the project itself is in the undo history. Where the job is saved, the current step and
// the import reports are not: undo never "unsaves" a file or jumps between screens.

import type { AutImportResult } from '../data/autCsvImport.ts'
import type { Project } from '../data/schema.ts'
import type { ImportSummary, ReportEntry } from '../data/xlsmImport.ts'
import { canRedo, canUndo, createHistory, record, redo, undo, type History } from './history.ts'

export const STEP_IDS = ['project', 'fieldData', 'scans', 'images', 'review', 'export'] as const
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
  | { type: 'edit'; label: string; group?: string; now?: number; update: (project: Project) => Project }
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
      },
    }
  }
  if (action.type === 'closeJob') return { job: null }

  const job = state.job
  if (!job) return state
  switch (action.type) {
    case 'edit': {
      const next = action.update(job.history.present)
      const history = record(job.history, next, { label: action.label, group: action.group, now: action.now })
      return history === job.history ? state : { job: { ...job, history } }
    }
    case 'undo':
      return canUndo(job.history) ? { job: { ...job, history: undo(job.history) } } : state
    case 'redo':
      return canRedo(job.history) ? { job: { ...job, history: redo(job.history) } } : state
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
export function jobTitle(job: Job): string {
  const name = job.history.present.project.projectName.trim()
  if (name) return name
  if (job.file) return job.file.name.replace(/\.(axb|json)$/i, '')
  return 'Untitled job'
}
