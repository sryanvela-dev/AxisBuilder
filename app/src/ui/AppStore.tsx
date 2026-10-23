// The app's state in one place: the open job (with undo/redo), recent jobs, the recovery copy,
// file open/save and the question box. Screens read it with useApp().

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { createEmptyProject } from '../data/projectFile.ts'
import { reportTargets } from '../data/reportTargets.ts'
import type { Project } from '../data/schema.ts'
import { canRedo, canUndo, redoLabel, undoLabel } from '../state/history.ts'
import {
  browserFilePlatform,
  openJobFile,
  pickWithInput,
  readJobFile,
  saveJob,
  suggestedFileName,
  type OpenJobResult,
  type SaveAnswer,
  type SaveQuestion,
} from '../state/projectFiles.ts'
import {
  addRecent,
  discardRecovery,
  listRecent,
  listRecoveries,
  readRecovery,
  removeRecent,
  writeRecovery,
  type RecentJob,
  type RecoveryRecord,
} from '../state/recovery.ts'
import { initialSession, isDirty, jobTitle, newJobId, sessionReducer, type StepId } from '../state/session.ts'
import { indexedDbStore, memoryStore } from '../state/storage.ts'
import { AppContext, type AppApi, type Notice, type PendingImport } from './appContext.ts'
import { DialogView, type DialogRequest } from './Dialog.tsx'
import { errorDetails } from './errorDetails.ts'
import { isStaleCodeError, reloadAfterUpdate } from './reloadAfterUpdate.ts'

/** Each page load is one "tab" for the recovery copy. A reload gets a new id, so its old copy is offered. */
const TAB_ID = newJobId()
const LOCK_PREFIX = 'axisbuilder-tab:'

interface LockManagerLike {
  request(name: string, callback: () => Promise<void>): Promise<void>
  query(): Promise<{ held?: { name?: string }[] }>
}
const locks = (): LockManagerLike | undefined => (navigator as unknown as { locks?: LockManagerLike }).locks

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialSession)
  const idb = useMemo(() => indexedDbStore(), [])
  const store = useMemo(() => idb ?? memoryStore(), [idb])
  const platform = useMemo(() => browserFilePlatform(), [])
  const [recent, setRecent] = useState<RecentJob[]>([])
  const [recoveries, setRecoveries] = useState<RecoveryRecord[]>([])
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [backgroundError, setBackgroundError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ request: DialogRequest; resolve: (id: string) => void } | null>(null)
  const jobRef = useRef(state.job)
  useLayoutEffect(() => {
    jobRef.current = state.job
  }, [state.job])

  const job = state.job

  // --- Start-up: hold this tab's lock, then look for recovery copies and recent jobs --------------
  useEffect(() => {
    let cancelled = false
    const lm = locks()
    lm?.request(LOCK_PREFIX + TAB_ID, () => new Promise<void>(() => {})).catch(() => {})
    ;(async () => {
      let live = new Set<string>()
      try {
        const q = await lm?.query()
        live = new Set((q?.held ?? []).map((l) => l.name ?? '').filter((n) => n.startsWith(LOCK_PREFIX)).map((n) => n.slice(LOCK_PREFIX.length)))
      } catch {
        // No lock support: every copy is offered.
      }
      live.add(TAB_ID)
      const [rec, recov] = await Promise.all([listRecent(store), listRecoveries(store, live)])
      if (!cancelled) {
        setRecent(rec)
        setRecoveries(recov)
      }
    })().catch((err) => setBackgroundError(errorDetails(err, 'Start-up (reading saved browser data)')))
    return () => {
      cancelled = true
    }
  }, [store])

  // --- Recovery copy: written shortly after every change while there are unsaved changes ---------
  useEffect(() => {
    const t = setTimeout(() => {
      writeRecovery(store, TAB_ID, job).catch((err) => setBackgroundError(errorDetails(err, 'Recovery copy')))
    }, 300)
    return () => clearTimeout(t)
  }, [store, job])

  // Warn before closing the window with unsaved changes (the recovery copy is kept anyway).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const j = jobRef.current
      if (j && isDirty(j)) {
        writeRecovery(store, TAB_ID, j).catch(() => {})
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [store])

  // Unexpected errors outside a screen (for example in a file reader) show a bar instead of nothing.
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (/ResizeObserver loop/.test(e.message)) return
      setBackgroundError(errorDetails(e.error ?? e.message, 'Background task'))
    }
    const onRejection = (e: PromiseRejectionEvent) => setBackgroundError(errorDetails(e.reason, 'Background task'))
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  useEffect(() => {
    if (notice?.kind !== 'info') return
    const t = setTimeout(() => setNotice(null), 8000)
    return () => clearTimeout(t)
  }, [notice])

  useEffect(() => {
    document.title = job ? `${isDirty(job) ? '* ' : ''}${jobTitle(job)} - AxisBuilder` : 'AxisBuilder'
  }, [job])

  // --- Question box ---------------------------------------------------------------------------------
  const ask = useCallback(<T extends string,>(request: DialogRequest<T>) => {
    return new Promise<T>((resolve) => {
      setDialog({ request, resolve: (id) => resolve(id as T) })
    })
  }, [])

  const askSave = useCallback(
    (q: SaveQuestion): Promise<SaveAnswer> =>
      ask<SaveAnswer>({
        title: q.kind === 'changedElsewhere' ? 'The file was changed elsewhere' : 'Replace the file?',
        message:
          q.kind === 'changedElsewhere' ? (
            <p>
              <strong>{q.fileName}</strong> was changed outside AxisBuilder after you opened it (maybe in another window).
              Saving here replaces those changes. Save as a new file to keep both.
            </p>
          ) : (
            <p>
              Saving replaces <strong>{q.fileName}</strong> on your computer with this version of the job. After this, Save
              writes to it without asking again.
            </p>
          ),
        buttons: [
          { id: 'replace', label: 'Replace the file', primary: q.kind === 'replaceOpened' },
          { id: 'saveAs', label: 'Save as a new file', primary: q.kind === 'changedElsewhere' },
          { id: 'cancel', label: 'Cancel' },
        ],
        cancelId: 'cancel',
      }),
    [ask],
  )

  // --- Opening ----------------------------------------------------------------------------------
  const showOpenError = useCallback(
    (fileName: string, errors: string[]) =>
      ask({
        title: `Can't open ${fileName}`,
        message: (
          <ul className="plain-list">
            {errors.slice(0, 12).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {errors.length > 12 && <li>...and {errors.length - 12} more.</li>}
          </ul>
        ),
        buttons: [{ id: 'ok', label: 'OK', primary: true }],
        cancelId: 'ok',
      }),
    [ask],
  )

  const finishOpen = useCallback(
    async (res: OpenJobResult) => {
      if (res.status === 'cancelled') return
      if (res.status === 'error') {
        await showOpenError(res.fileName, res.errors)
        return
      }
      dispatch({ type: 'openJob', project: res.project, source: 'file', file: res.file, saved: res.migratedFrom === undefined })
      setNotice(
        res.migratedFrom === undefined
          ? { kind: 'info', text: `Opened ${res.file.name}.` }
          : { kind: 'info', text: `Opened ${res.file.name}. It was made by an older version of AxisBuilder and is saved in the new format next time.` },
      )
      setRecent(await addRecent(store, { title: res.project.project.projectName || res.file.name, fileName: res.file.name, handle: res.file.handle, openedAt: Date.now() }))
    },
    [showOpenError, store],
  )

  const openFromDisk = useCallback(async () => {
    try {
      await finishOpen(await openJobFile(platform))
    } catch (err) {
      setNotice({ kind: 'error', text: `The file could not be opened: ${err instanceof Error ? err.message : String(err)}` })
    }
  }, [finishOpen, platform])

  const openRecent = useCallback(
    async (r: RecentJob) => {
      if (!r.handle) {
        setNotice({ kind: 'info', text: `Find ${r.fileName} in the window that opens.` })
        await openFromDisk()
        return
      }
      try {
        let perm = (await r.handle.queryPermission?.({ mode: 'read' })) ?? 'granted'
        if (perm !== 'granted') perm = (await r.handle.requestPermission?.({ mode: 'read' })) ?? 'denied'
        if (perm !== 'granted') return
        await finishOpen(await readJobFile(await r.handle.getFile(), r.handle))
      } catch {
        await showOpenError(r.fileName, [
          'The file could not be read. It may have been moved, renamed or deleted. Use "Open job" to find it, or remove it from the list.',
        ])
      }
    },
    [finishOpen, openFromDisk, showOpenError],
  )

  const forgetRecent = useCallback(async (r: RecentJob) => setRecent(await removeRecent(store, r)), [store])

  const newJob = useCallback(() => dispatch({ type: 'openJob', project: createEmptyProject(), source: 'new' }), [])

  const openSample = useCallback(async () => {
    const { sampleProject } = await import('./sampleJob.ts')
    dispatch({ type: 'openJob', project: sampleProject(), source: 'sample' })
    setNotice({ kind: 'info', text: 'This is a made-up sample job. Save it under a new name if you want to keep your changes.' })
  }, [])

  const importExcel = useCallback(async () => {
    const file = await pickWithInput('.xlsm,.xlsx')
    if (!file) return
    setBusy(`Reading ${file.name}...`)
    try {
      const { importWorkbook } = await import('../data/xlsmImport.ts')
      setPendingImport({ fileName: file.name, result: importWorkbook(await file.arrayBuffer()) })
    } catch (err) {
      if (isStaleCodeError(err) && reloadAfterUpdate()) return
      await showOpenError(file.name, [
        `This file could not be imported as an AxisBuilder Excel job: ${err instanceof Error ? err.message : String(err)}`,
      ])
    } finally {
      setBusy('')
    }
  }, [showOpenError])

  const continueImport = useCallback(() => {
    if (!pendingImport) return
    const { fileName, result } = pendingImport
    dispatch({
      type: 'openJob',
      project: result.project,
      source: 'import',
      workbookImport: {
        fileName,
        report: result.report,
        summary: result.summary,
        checkedSteps: [],
        targets: reportTargets(result.report, result.sources, result.project),
      },
    })
    setPendingImport(null)
    setNotice({ kind: 'info', text: `Imported ${fileName}. Save the job to keep it as an AxisBuilder job file.` })
  }, [pendingImport])

  const restore = useCallback(
    (r: RecoveryRecord) => {
      const res = readRecovery(r)
      if (!res.ok) {
        void showOpenError(`the recovered copy of ${r.title}`, res.errors)
        return
      }
      dispatch({ type: 'openJob', project: res.project, source: 'recovery', id: r.jobId, file: r.file, workbookImport: r.workbookImport, step: r.step })
      setRecoveries((list) => list.filter((x) => x.tabId !== r.tabId))
      void discardRecovery(store, r.tabId)
      setNotice({ kind: 'info', text: `Restored ${r.title}. Save the job to keep these changes.` })
    },
    [showOpenError, store],
  )

  const discard = useCallback(
    async (r: RecoveryRecord) => {
      const answer = await ask({
        title: 'Discard the unsaved work?',
        message: <p>The unsaved changes to <strong>{r.title}</strong> are deleted from this browser. This can't be undone.</p>,
        buttons: [
          { id: 'discard', label: 'Discard' },
          { id: 'cancel', label: 'Keep it', primary: true },
        ],
        cancelId: 'cancel',
      })
      if (answer !== 'discard') return
      await discardRecovery(store, r.tabId)
      setRecoveries((list) => list.filter((x) => x.tabId !== r.tabId))
    },
    [ask, store],
  )

  // --- Saving -----------------------------------------------------------------------------------
  const save = useCallback(
    async (saveAs = false): Promise<boolean> => {
      const j = jobRef.current
      if (!j) return false
      const project = j.history.present
      const outcome = await saveJob(platform, {
        project,
        file: j.file,
        saveAs,
        suggestedName: suggestedFileName(project.project.projectName, j.file),
        ask: askSave,
      })
      if (outcome.status === 'cancelled') return false
      if (outcome.status === 'error') {
        await ask({
          title: 'The job was not saved',
          message: <p className="pre-line">{outcome.message}</p>,
          buttons: [{ id: 'ok', label: 'OK', primary: true }],
          cancelId: 'ok',
        })
        return false
      }
      dispatch({ type: 'saved', project, file: outcome.file })
      if (outcome.status === 'saved') {
        setNotice({ kind: 'info', text: `Saved to ${outcome.file.name}.` })
        setRecent(await addRecent(store, { title: project.project.projectName || outcome.file.name, fileName: outcome.file.name, handle: outcome.file.handle, openedAt: Date.now() }))
      } else {
        setNotice({
          kind: 'info',
          text: `Downloaded ${outcome.file.name} to your Downloads folder. This browser can't save back into the same file, so each Save downloads a new copy.`,
        })
      }
      return true
    },
    [ask, askSave, platform, store],
  )

  const closeJob = useCallback(async () => {
    const j = jobRef.current
    if (!j) return
    if (isDirty(j)) {
      const answer = await ask({
        title: 'Save changes before closing?',
        message: <p><strong>{jobTitle(j)}</strong> has changes that are not saved in a job file.</p>,
        buttons: [
          { id: 'save', label: 'Save', primary: true },
          { id: 'discard', label: "Don't save" },
          { id: 'cancel', label: 'Cancel' },
        ],
        cancelId: 'cancel',
      })
      if (answer === 'cancel') return
      if (answer === 'save' && !(await save())) return
    }
    dispatch({ type: 'closeJob' })
  }, [ask, save])

  // --- Editing ----------------------------------------------------------------------------------
  const edit = useCallback((label: string, update: (p: Project) => Project, group?: string) => {
    dispatch({ type: 'edit', label, update, group })
  }, [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const goToStep = useCallback((step: StepId) => dispatch({ type: 'goToStep', step }), [])

  // Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) undo and redo every change; Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || dialog) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        dispatch({ type: 'undo' })
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        dispatch({ type: 'redo' })
      } else if (key === 's' && jobRef.current) {
        e.preventDefault()
        void save(e.shiftKey)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, save])

  const api: AppApi = {
    state,
    dispatch,
    edit,
    undo,
    redo,
    canUndo: job ? canUndo(job.history) || Object.keys(job.drafts).length > 0 : false,
    canRedo: job ? canRedo(job.history) : false,
    undoLabel: job ? (Object.keys(job.drafts).length > 0 ? 'throw away the text that is not stored' : undoLabel(job.history)) : null,
    redoLabel: job ? redoLabel(job.history) : null,
    dirty: job ? isDirty(job) : false,
    goToStep,
    recent,
    recoveries,
    recoveryAvailable: idb !== null,
    pendingImport,
    busy,
    notice,
    dismissNotice: () => setNotice(null),
    backgroundError,
    dismissBackgroundError: () => setBackgroundError(null),
    newJob,
    openFromDisk,
    openRecent,
    forgetRecent,
    openSample,
    importExcel,
    continueImport,
    cancelImport: () => setPendingImport(null),
    restore,
    discard,
    save,
    closeJob,
    ask,
    browserStore: store,
  }

  return (
    <AppContext.Provider value={api}>
      {children}
      {dialog && (
        <DialogView
          request={dialog.request}
          onAnswer={(id) => {
            dialog.resolve(id)
            setDialog(null)
          }}
        />
      )}
    </AppContext.Provider>
  )
}
