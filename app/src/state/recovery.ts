// Recovery copy and recent jobs, kept in the browser (see storage.ts).
//
// Recovery: while a job has unsaved changes, a copy is written after every change, one per browser
// tab ("recovery:<tabId>"). On the next start, copies from tabs that are no longer open are offered
// for restore. Saving or closing the job removes its copy.
// Recent jobs: the last few jobs opened from or saved to a file, with the file handle where the
// browser allows it (Edge/Chrome), so they reopen with one click.

import { openProject, saveProject } from '../data/projectFile.ts'
import type { Project } from '../data/schema.ts'
import { isDirty, jobTitle, type FileHandleLike, type Job, type JobFile, type JobSource, type StepId, type WorkbookImport } from './session.ts'
import type { KeyValueStore } from './storage.ts'

const RECOVERY_PREFIX = 'recovery:'
const RECENT_KEY = 'recentJobs'
export const RECENT_LIMIT = 8

export interface RecoveryRecord {
  tabId: string
  jobId: string
  savedAt: number
  title: string
  /** The project as a project file (JSON), so restoring goes through the normal file checks. */
  projectJson: string
  source: JobSource
  file: JobFile | null
  workbookImport: WorkbookImport | null
  step: StepId
}

/** Keeps the tab's recovery copy up to date: written while the job has unsaved changes, removed otherwise. */
export async function writeRecovery(store: KeyValueStore, tabId: string, job: Job | null, now = Date.now()): Promise<void> {
  const key = RECOVERY_PREFIX + tabId
  if (!job || !isDirty(job)) {
    await store.delete(key)
    return
  }
  const record: RecoveryRecord = {
    tabId,
    jobId: job.id,
    savedAt: now,
    title: jobTitle(job),
    projectJson: saveProject(job.history.present),
    source: job.source,
    file: job.file,
    workbookImport: job.workbookImport,
    step: job.step,
  }
  await store.set(key, record)
}

/** Recovery copies left by tabs that are not open any more, newest first. */
export async function listRecoveries(store: KeyValueStore, liveTabIds: ReadonlySet<string>): Promise<RecoveryRecord[]> {
  const out: RecoveryRecord[] = []
  for (const key of await store.keys(RECOVERY_PREFIX)) {
    const r = await store.get<RecoveryRecord>(key)
    if (r && !liveTabIds.has(r.tabId)) out.push(r)
  }
  return out.sort((a, b) => b.savedAt - a.savedAt)
}

export async function discardRecovery(store: KeyValueStore, tabId: string): Promise<void> {
  await store.delete(RECOVERY_PREFIX + tabId)
}

export type RestoreResult =
  | { ok: true; project: Project; record: RecoveryRecord }
  | { ok: false; errors: string[] }

/** Reads the project back from a recovery copy (with the same checks as opening a file). */
export function readRecovery(record: RecoveryRecord): RestoreResult {
  const opened = openProject(record.projectJson)
  return opened.ok ? { ok: true, project: opened.project, record } : { ok: false, errors: opened.errors }
}

// --- Recent jobs -----------------------------------------------------------------------------

export interface RecentJob {
  title: string
  fileName: string
  /** Edge/Chrome only: reopens the file without browsing for it. */
  handle: FileHandleLike | null
  openedAt: number
}

export async function listRecent(store: KeyValueStore): Promise<RecentJob[]> {
  return (await store.get<RecentJob[]>(RECENT_KEY)) ?? []
}

async function sameFile(a: RecentJob, b: RecentJob): Promise<boolean> {
  const ha = a.handle as (FileHandleLike & { isSameEntry?: (o: unknown) => Promise<boolean> }) | null
  if (ha?.isSameEntry && b.handle) {
    try {
      return await ha.isSameEntry(b.handle)
    } catch {
      // fall through to the name check
    }
  }
  return a.fileName.toLowerCase() === b.fileName.toLowerCase()
}

/** Puts the job at the top of the recent list (replacing an older entry for the same file). */
export async function addRecent(store: KeyValueStore, entry: RecentJob): Promise<RecentJob[]> {
  const kept: RecentJob[] = []
  for (const r of await listRecent(store)) if (!(await sameFile(r, entry))) kept.push(r)
  const list = [entry, ...kept].slice(0, RECENT_LIMIT)
  await store.set(RECENT_KEY, list)
  return list
}

export async function removeRecent(store: KeyValueStore, entry: RecentJob): Promise<RecentJob[]> {
  const kept: RecentJob[] = []
  for (const r of await listRecent(store)) if (!(r.openedAt === entry.openedAt && r.fileName === entry.fileName)) kept.push(r)
  await store.set(RECENT_KEY, kept)
  return kept
}
