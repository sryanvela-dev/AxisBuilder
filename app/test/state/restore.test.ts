// The job's files in this browser (state/restore.ts): where each stands, Restore files (one click for everything waiting
// for the browser's OK) and Find files (search a folder and its subfolders by name).
import { describe, expect, it } from 'vitest'
import { recallFile, rememberFile } from '../../src/state/files.ts'
import { recallFolder, rememberFolder, type DirectoryHandleLike } from '../../src/state/folders.ts'
import { findFiles, itemsToRestore, jobFiles, missingNames, reportFileSlots, restoreItems } from '../../src/state/restore.ts'
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
    getFile: async () => new File(['x'], name),
  }
  return h as typeof h & (K extends 'file' ? FileHandleLike : DirectoryHandleLike)
}

/** A made-up folder tree: { name: [files], sub: tree }. */
type Tree = { [name: string]: string[] | Tree }
function folder(name: string, tree: Tree): DirectoryHandleLike {
  const files = Object.entries(tree).flatMap(([, v]) => (Array.isArray(v) ? v : []))
  const subs = Object.entries(tree).filter(([, v]) => !Array.isArray(v)) as [string, Tree][]
  return {
    kind: 'directory',
    name,
    queryPermission: async () => 'granted',
    async *values() {
      for (const f of files) yield { kind: 'file' as const, name: f }
      for (const [s] of subs) yield { kind: 'directory' as const, name: s }
    },
    getFileHandle: async (n: string) => {
      if (!files.includes(n)) throw new Error('NotFoundError')
      return { kind: 'file', name: n, getFile: async () => new File(['x'], n), queryPermission: async () => 'granted' } as never
    },
    getDirectoryHandle: async (n: string) => {
      const s = subs.find(([x]) => x === n)
      if (!s) throw new Error('NotFoundError')
      return folder(n, s[1])
    },
  } as DirectoryHandleLike
}

const job = () =>
  sampleWithReport((q) => {
    q.scanImages = q.scans.map((s, i) => ({ scanId: s.id, imageFile: `S${i + 1}.jpg`, processedImage: '', include: true }))
    q.report!.coverPhoto = 'cover.jpg'
    q.report!.photos = [photoSchema.parse({ file: 'boot.jpg' })]
    // The fixture's data-page screenshots are tested by the folder rule below; left out here.
    for (const r of q.report!.scanResults) r.dataImage = null
  })

describe('job files', () => {
  it('lists what waits for the OK, and nothing already allowed or remembered for another file', async () => {
    const p = job()
    const store = memoryStore()
    await rememberFolder(store, p.jobId, 'photos', handle('directory', 'Scan photos', 'prompt'))
    await rememberFolder(store, p.jobId, 'job', folder('Job', {}))
    await rememberFile(store, p.jobId, 'coverPhoto', handle('file', 'cover.jpg', 'prompt'))
    await rememberFile(store, p.jobId, 'photo:boot.jpg', handle('file', 'boot.jpg', 'prompt'))
    // Picked before the calibration screenshot was changed to another file: not asked about.
    await rememberFile(store, p.jobId, 'dynamicImage', handle('file', 'old.png', 'prompt'))
    const items = await itemsToRestore(store, p)
    expect(items.map((i) => `${i.what}: ${i.name}`)).toEqual(['Photo folder: Scan photos', 'Photo: boot.jpg', 'Cover photo: cover.jpg'])
    const groups = await jobFiles(store, p)
    expect(groups.find((g) => g.id === 'photos')).toMatchObject({ state: 'waiting', folder: 'waiting', folderName: 'Scan photos' })
    expect(groups.find((g) => g.id === 'job')).toMatchObject({ state: 'ok', folder: 'ready' })
  })

  it('a job opened where nothing was chosen: every file is missing, the job folder only not chosen', async () => {
    const p = job()
    const groups = await jobFiles(memoryStore(), p)
    expect(groups.map((g) => [g.id, g.state])).toEqual([['photos', 'missing'], ['reportPhotos', 'missing'], ['cover', 'missing'], ['job', 'notChosen']])
    expect(missingNames(groups).length).toBe(p.scans.length + 2)
  })

  it('the photo group only while the drawing uses photos; report groups only with a report', async () => {
    const p = job()
    const off = { ...p, settings: { ...p.settings, generateOverlayDrawing: false }, report: null }
    expect((await jobFiles(memoryStore(), off)).map((g) => g.id)).toEqual(['job'])
    expect(reportFileSlots(off)).toEqual([])
  })

  it('a readable folder that lacks some files: those are missing; one that cannot be opened is lost', async () => {
    const p = job()
    const store = memoryStore()
    await rememberFolder(store, p.jobId, 'photos', folder('Shots', { files: ['S1.jpg', 's2.JPG'] }))
    const g = (await jobFiles(store, p)).find((x) => x.id === 'photos')!
    expect(g.files.filter((f) => f.state === 'ok').map((f) => f.name)).toEqual(['S1.jpg', 'S2.jpg'])
    expect(g.state).toBe('missing')
    const broken = { ...folder('Gone', {}), values: () => ({ [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error('NotFoundError')) }) }) }
    await rememberFolder(store, p.jobId, 'photos', broken as DirectoryHandleLike)
    expect((await jobFiles(store, p)).find((x) => x.id === 'photos')).toMatchObject({ folder: 'lost', state: 'missing' })
  })
})

describe('restore files', () => {
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

describe('find files', () => {
  it('searches subfolders by name (case ignored): folders for the photo groups, single files where they are', async () => {
    const p = job()
    const n = p.scans.length
    const store = memoryStore()
    const root = folder('Jobs', {
      files: ['notes.txt'],
      'V-100': {
        files: ['COVER.JPG'],
        Field: { files: Array.from({ length: n }, (_, i) => `S${i + 1}.jpg`) },
        Report: { files: ['boot.jpg'] },
      },
      Other: { files: ['S1.jpg'] },
    })
    const before = await jobFiles(store, p)
    let folders = 0
    const res = await findFiles(store, p, before, root, (c) => (folders = c))
    expect(res).toEqual({ found: n + 2, notFound: [], complete: true })
    expect(folders).toBe(5)
    expect((await recallFolder(store, p.jobId, 'photos'))!.name).toBe('Field')
    expect((await recallFolder(store, p.jobId, 'reportPhotos'))!.name).toBe('Report')
    expect((await recallFile(store, p.jobId, 'coverPhoto'))!.name).toBe('COVER.JPG')
    const after = await jobFiles(store, p)
    expect(after.filter((g) => g.id !== 'job').every((g) => g.state === 'ok')).toBe(true)
  })

  it('keeps a folder that already holds more of the files; lists what it could not find', async () => {
    const p = job()
    const store = memoryStore()
    await rememberFolder(store, p.jobId, 'photos', folder('Mine', { files: ['S1.jpg', 'S2.jpg'] }))
    const res = await findFiles(store, p, await jobFiles(store, p), folder('Elsewhere', { files: ['S3.jpg'] }))
    expect((await recallFolder(store, p.jobId, 'photos'))!.name).toBe('Mine')
    expect(res.found).toBe(0)
    expect(res.notFound).toContain('S3.jpg')
    expect(res.notFound).toContain('cover.jpg')
  })

  it('skips system folders and stops at the depth limit', async () => {
    const p = job()
    const store = memoryStore()
    const deep: Tree = { files: ['cover.jpg'] }
    let t: Tree = deep
    for (let i = 0; i < 8; i++) t = { [`d${i}`]: t }
    const res = await findFiles(store, p, await jobFiles(store, p), folder('Root', { ...t, AppData: { files: ['boot.jpg'] } }))
    expect(res.complete).toBe(false)
    expect(res.notFound).toContain('cover.jpg')
    expect(res.notFound).toContain('boot.jpg')
  })
})
