// "Restore files" (state/restore.ts): everything a job uses that waits for the browser's OK, asked for from one click.
import { describe, expect, it } from 'vitest'
import { rememberFile } from '../../src/state/files.ts'
import { rememberFolder, type DirectoryHandleLike } from '../../src/state/folders.ts'
import { itemsToRestore, reportFileSlots, restoreItems } from '../../src/state/restore.ts'
import type { FileHandleLike } from '../../src/state/session.ts'
import { memoryStore } from '../../src/state/storage.ts'
import { photoSchema } from '../../src/report/schema.ts'
import { sampleWithReport } from '../report/pages/fixture.ts'

/** A remembered handle whose permission starts as `perm`; `answer` is what the browser's question returns. */
function handle<K extends 'file' | 'directory'>(kind: K, name: string, perm: PermissionState, answer: PermissionState | 'throw' = 'granted') {
  const h = {
    kind, name, perm, asked: 0,
    queryPermission: async () => h.perm,
    requestPermission: async () => {
      h.asked++
      if (answer === 'throw') throw new Error('Must be handling a user gesture')
      h.perm = answer
      return answer
    },
  }
  return h as typeof h & (K extends 'file' ? FileHandleLike : DirectoryHandleLike)
}

const job = () =>
  sampleWithReport((q) => {
    q.scanImages = q.scans.map((s) => ({ scanId: s.id, imageFile: `${s.id}.jpg`, processedImage: '', include: true }))
    q.report!.coverPhoto = 'cover.jpg'
    q.report!.photos = [photoSchema.parse({ file: 'boot.jpg' })]
  })

describe('restore files', () => {
  it('lists folders and files the job uses that wait for the OK, and nothing already allowed or for another file', async () => {
    const p = job()
    const store = memoryStore()
    await rememberFolder(store, p.jobId, 'photos', handle('directory', 'Scan photos', 'prompt'))
    await rememberFolder(store, p.jobId, 'reportPhotos', handle('directory', 'Report photos', 'granted'))
    await rememberFile(store, p.jobId, 'coverPhoto', handle('file', 'cover.jpg', 'prompt'))
    await rememberFile(store, p.jobId, 'photo:boot.jpg', handle('file', 'boot.jpg', 'prompt'))
    // Picked before the cover was changed to another file: not asked about.
    await rememberFile(store, p.jobId, 'dynamicImage', handle('file', 'old.png', 'prompt'))
    const items = await itemsToRestore(store, p)
    expect(items.map((i) => `${i.what}: ${i.name}`)).toEqual(['Photo folder: Scan photos', 'Cover photo: cover.jpg', 'Photo: boot.jpg'])
  })

  it('the photo folder only while the drawing uses photos; report folders only with a report', async () => {
    const p = job()
    const store = memoryStore()
    await rememberFolder(store, p.jobId, 'photos', handle('directory', 'Scan photos', 'prompt'))
    await rememberFolder(store, p.jobId, 'screenshots', handle('directory', 'Shots', 'prompt'))
    const off = { ...p, settings: { ...p.settings, generateOverlayDrawing: false }, report: null }
    expect(await itemsToRestore(store, off)).toEqual([])
    expect(reportFileSlots(off)).toEqual([])
  })

  it('asks for every item from one click; refused ones and ones the browser would not ask about are left for the next click', async () => {
    const a = handle('directory', 'A', 'prompt')
    const b = handle('file', 'b.jpg', 'prompt', 'denied')
    const c = handle('file', 'c.jpg', 'prompt', 'throw')
    const left = await restoreItems([
      { what: 'Photo folder', name: 'A', handle: a, mode: 'read' },
      { what: 'Photo', name: 'b.jpg', handle: b, mode: 'read' },
      { what: 'Photo', name: 'c.jpg', handle: c, mode: 'read' },
    ])
    expect([a.asked, b.asked, c.asked]).toEqual([1, 1, 1])
    expect(a.perm).toBe('granted')
    expect(left.map((i) => i.name)).toEqual(['b.jpg', 'c.jpg'])
  })
})
