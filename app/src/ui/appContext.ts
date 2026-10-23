// What screens can read and do (useApp). The provider is AppStoreProvider in AppStore.tsx.

import { createContext, useContext } from 'react'
import type { Project } from '../data/schema.ts'
import type { ImportResult } from '../data/xlsmImport.ts'
import type { RecentJob, RecoveryRecord } from '../state/recovery.ts'
import type { SessionAction, SessionState, StepId } from '../state/session.ts'
import type { DialogRequest } from './Dialog.tsx'

export interface Notice {
  kind: 'info' | 'error'
  text: string
}

export interface PendingImport {
  fileName: string
  result: ImportResult
}

export interface AppApi {
  state: SessionState
  dispatch: (action: SessionAction) => void
  /** Records one change to the project (one undo step; same `group` in a row merges). */
  edit: (label: string, update: (p: Project) => Project, group?: string) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
  dirty: boolean
  goToStep: (step: StepId) => void

  recent: RecentJob[]
  recoveries: RecoveryRecord[]
  /** False when this browser can't keep a recovery copy (no IndexedDB). */
  recoveryAvailable: boolean
  pendingImport: PendingImport | null
  busy: string
  notice: Notice | null
  dismissNotice: () => void
  backgroundError: string | null
  dismissBackgroundError: () => void

  newJob: () => void
  openFromDisk: () => Promise<void>
  openRecent: (r: RecentJob) => Promise<void>
  forgetRecent: (r: RecentJob) => Promise<void>
  openSample: () => Promise<void>
  importExcel: () => Promise<void>
  continueImport: () => void
  cancelImport: () => void
  restore: (r: RecoveryRecord) => void
  discard: (r: RecoveryRecord) => Promise<void>
  save: (saveAs?: boolean) => Promise<boolean>
  closeJob: () => Promise<void>
  ask: <T extends string>(request: DialogRequest<T>) => Promise<T>
}

export const AppContext = createContext<AppApi | null>(null)

export function useApp(): AppApi {
  const api = useContext(AppContext)
  if (!api) throw new Error('useApp must be used inside AppStoreProvider')
  return api
}
