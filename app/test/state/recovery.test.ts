import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../../src/data/projectFile.ts'
import type { Project } from '../../src/data/schema.ts'
import { addRecent, discardRecovery, listRecent, listRecoveries, readRecovery, RECENT_LIMIT, removeRecent, writeRecovery } from '../../src/state/recovery.ts'
import { sessionReducer, type Job } from '../../src/state/session.ts'
import { memoryStore } from '../../src/state/storage.ts'

function job(name: string, saved = false): Job {
  const p = createEmptyProject()
  const project: Project = { ...p, project: { ...p.project, projectName: name } }
  return sessionReducer({ job: null }, { type: 'openJob', project, source: 'new', saved }).job!
}

describe('recovery copy', () => {
  it('keeps a copy while there are unsaved changes and offers it after the tab is gone', async () => {
    const store = memoryStore()
    const j = { ...job('V-1'), step: 'scans' as const }
    await writeRecovery(store, 'tab-a', j, 100)
    expect(await listRecoveries(store, new Set(['tab-a']))).toEqual([]) // that tab is still open
    const [r] = await listRecoveries(store, new Set())
    expect(r).toMatchObject({ tabId: 'tab-a', jobId: j.id, title: 'V-1', savedAt: 100, step: 'scans' })
    const restored = readRecovery(r)
    expect(restored.ok && restored.project).toEqual(j.history.present)
  })

  it('removes the copy when the job is saved or closed', async () => {
    const store = memoryStore()
    await writeRecovery(store, 't', job('V-1'))
    await writeRecovery(store, 't', job('V-1', true))
    expect(await store.keys('recovery:')).toEqual([])
    await writeRecovery(store, 't', job('V-1'))
    await writeRecovery(store, 't', null)
    expect(await store.keys('recovery:')).toEqual([])
  })

  it('lists copies from several closed tabs, newest first; discard removes one', async () => {
    const store = memoryStore()
    await writeRecovery(store, 'old', job('A'), 1)
    await writeRecovery(store, 'new', job('B'), 2)
    expect((await listRecoveries(store, new Set())).map((r) => r.title)).toEqual(['B', 'A'])
    await discardRecovery(store, 'new')
    expect((await listRecoveries(store, new Set())).map((r) => r.title)).toEqual(['A'])
  })

  it('a damaged copy is reported, not opened', () => {
    const res = readRecovery({ tabId: 't', jobId: 'j', savedAt: 0, title: 'X', projectJson: '{', source: 'new', file: null, workbookImport: null, step: 'project' })
    expect(res.ok).toBe(false)
  })
})

describe('recent jobs', () => {
  const entry = (fileName: string, openedAt: number) => ({ title: fileName, fileName, handle: null, openedAt })

  it('newest first, one entry per file, at most RECENT_LIMIT', async () => {
    const store = memoryStore()
    await addRecent(store, entry('A.axb', 1))
    await addRecent(store, entry('B.axb', 2))
    await addRecent(store, entry('a.axb', 3))
    expect((await listRecent(store)).map((r) => r.fileName)).toEqual(['a.axb', 'B.axb'])
    for (let i = 0; i < RECENT_LIMIT + 3; i++) await addRecent(store, entry(`J${i}.axb`, 10 + i))
    expect((await listRecent(store)).length).toBe(RECENT_LIMIT)
  })

  it('can remove an entry', async () => {
    const store = memoryStore()
    await addRecent(store, entry('A.axb', 1))
    const list = await addRecent(store, entry('B.axb', 2))
    expect((await removeRecent(store, list[1])).map((r) => r.fileName)).toEqual(['B.axb'])
  })
})
