// Folders remembered per job (state/folders.ts): a job that comes back with a new id still finds its photo folder.
import { describe, expect, it } from 'vitest'
import { recallFolder, recallFolderFor, rememberFolder, type DirectoryHandleLike } from '../../src/state/folders.ts'
import { memoryStore } from '../../src/state/storage.ts'

const folder = (name: string) => ({ kind: 'directory', name }) as unknown as DirectoryHandleLike

describe('remembered folders', () => {
  it("this job's folder first, then a job with the same name, then the last one used (only offered)", async () => {
    const store = memoryStore()
    expect(await recallFolderFor(store, 'job-a', 'V-100', 'photos')).toBeNull()
    await rememberFolder(store, 'job-a', 'photos', folder('V-100 photos'), 'V-100')
    expect(await recallFolderFor(store, 'job-a', 'V-100', 'photos')).toMatchObject({ from: 'job', handle: { name: 'V-100 photos' } })
    // The Excel file imported again: a new id, the same name (case and spaces don't matter).
    expect(await recallFolderFor(store, 'job-b', ' v-100 ', 'photos')).toMatchObject({ from: 'name', handle: { name: 'V-100 photos' } })
    // Another job: the last folder used is only offered.
    expect(await recallFolderFor(store, 'job-c', 'T-200', 'photos')).toMatchObject({ from: 'last', handle: { name: 'V-100 photos' } })
    // Kinds are kept apart.
    expect(await recallFolderFor(store, 'job-a', 'V-100', 'job')).toBeNull()
  })

  it('a job with no name is remembered by its id and as the last one only', async () => {
    const store = memoryStore()
    await rememberFolder(store, 'job-a', 'photos', folder('Photos'))
    expect(await recallFolder(store, 'job-a', 'photos')).toMatchObject({ name: 'Photos' })
    expect(await recallFolderFor(store, 'job-b', '', 'photos')).toMatchObject({ from: 'last' })
  })
})
