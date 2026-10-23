import { describe, expect, it, vi } from 'vitest'
import { createEmptyProject, openProject, saveProject } from '../../src/data/projectFile.ts'
import type { Project } from '../../src/data/schema.ts'
import { openJobFile, saveJob, suggestedFileName, type FilePlatform, type SaveQuestion } from '../../src/state/projectFiles.ts'
import type { FileHandleLike, JobFile } from '../../src/state/session.ts'

/** A file on a fake disk, written through the File System Access API shape. */
function fakeHandle(name: string, content: string, lastModified = 1000) {
  let data = content
  let modified = lastModified
  const handle = {
    kind: 'file' as const,
    name,
    writes: 0,
    getFile: async () => new File([data], name, { lastModified: modified }),
    createWritable: async () => ({
      write: async (d: Blob | string) => {
        data = typeof d === 'string' ? d : await d.text()
      },
      close: async () => {
        modified += 1000
        handle.writes++
      },
    }),
    queryPermission: async () => 'granted' as PermissionState,
    content: () => data,
    /** Someone else changes the file. */
    touch: () => {
      modified += 7
    },
  }
  return handle
}

const base = createEmptyProject()
function named(name: string): Project {
  return { ...base, project: { ...base.project, projectName: name } }
}

const abort = () => Object.assign(new Error('cancelled'), { name: 'AbortError' })

function platform(over: Partial<FilePlatform> = {}): FilePlatform {
  return { pickFile: async () => null, download: vi.fn(), ...over }
}

describe('opening a job file', () => {
  it('reads the file picked in Edge/Chrome and keeps its handle', async () => {
    const h = fakeHandle('V-1.axb', saveProject(named('V-1')), 5000)
    const res = await openJobFile(platform({ showOpenFilePicker: async () => [h] }))
    expect(res.status).toBe('opened')
    if (res.status !== 'opened') return
    expect(res.project.project.projectName).toBe('V-1')
    expect(res.file).toEqual({ name: 'V-1.axb', handle: h, lastModified: 5000, writeConfirmed: false })
  })

  it('cancelling the picker opens nothing', async () => {
    const res = await openJobFile(platform({ showOpenFilePicker: async () => Promise.reject(abort()) }))
    expect(res).toEqual({ status: 'cancelled' })
  })

  it('other browsers use the file input and get no handle', async () => {
    const file = new File([saveProject(named('V-2'))], 'V-2.json')
    const res = await openJobFile(platform({ pickFile: async () => file }))
    expect(res.status === 'opened' && res.file.handle).toBeNull()
    expect(await openJobFile(platform())).toEqual({ status: 'cancelled' })
  })

  it('explains files that are not job files', async () => {
    const bad = await openJobFile(platform({ pickFile: async () => new File(['not json'], 'x.axb') }))
    expect(bad).toEqual({ status: 'error', fileName: 'x.axb', errors: ['The file is not a valid AxisBuilder project file (it is not readable JSON).'] })
    const xlsm = await openJobFile(platform({ pickFile: async () => new File(['PK'], 'old.xlsm') }))
    expect(xlsm.status === 'error' && xlsm.errors[0]).toContain('Import old Excel job')
  })
})

describe('saving a job file', () => {
  const never = async (): Promise<never> => {
    throw new Error('should not ask')
  }

  it('a job never saved asks where to save (Save as), then Save writes there without asking', async () => {
    const target = fakeHandle('V-1.axb', '')
    const picker = vi.fn(async () => target as FileHandleLike)
    const pf = platform({ showSaveFilePicker: picker })
    const res = await saveJob(pf, { project: named('V-1'), file: null, saveAs: false, suggestedName: 'V-1.axb', ask: never })
    expect(res.status).toBe('saved')
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'V-1.axb' }))
    const saved = openProject(target.content())
    expect(saved.ok && saved.project.project.projectName).toBe('V-1')
    if (res.status !== 'saved') return
    expect(res.file.writeConfirmed).toBe(true)

    const again = await saveJob(pf, { project: named('V-1b'), file: res.file, saveAs: false, suggestedName: 'V-1.axb', ask: never })
    expect(again.status).toBe('saved')
    expect(picker).toHaveBeenCalledTimes(1)
    expect(target.writes).toBe(2)
  })

  it('the first Save over an opened file asks before replacing it', async () => {
    const h = fakeHandle('Job.axb', saveProject(named('old')))
    const file: JobFile = { name: 'Job.axb', handle: h, lastModified: 1000, writeConfirmed: false }
    const asked: SaveQuestion[] = []

    const cancelled = await saveJob(platform(), { project: named('new'), file, saveAs: false, suggestedName: 'Job.axb', ask: async (q) => (asked.push(q), 'cancel') })
    expect(cancelled.status).toBe('cancelled')
    expect(asked).toEqual([{ kind: 'replaceOpened', fileName: 'Job.axb' }])
    expect(h.writes).toBe(0)

    const replaced = await saveJob(platform(), { project: named('new'), file, saveAs: false, suggestedName: 'Job.axb', ask: async () => 'replace' })
    expect(replaced.status).toBe('saved')
    expect(h.writes).toBe(1)
    expect(replaced.status === 'saved' && replaced.file.writeConfirmed).toBe(true)
  })

  it('"Save as a new file" leaves the opened file alone', async () => {
    const h = fakeHandle('Job.axb', 'original')
    const copy = fakeHandle('Job copy.axb', '')
    const file: JobFile = { name: 'Job.axb', handle: h, lastModified: 1000, writeConfirmed: false }
    const res = await saveJob(platform({ showSaveFilePicker: async () => copy }), {
      project: named('new'), file, saveAs: false, suggestedName: 'Job.axb', ask: async () => 'saveAs',
    })
    expect(res.status === 'saved' && res.file.name).toBe('Job copy.axb')
    expect(h.content()).toBe('original')
    expect(copy.writes).toBe(1)
  })

  it('asks when the file was changed elsewhere since it was opened or saved', async () => {
    const h = fakeHandle('Job.axb', 'x')
    const file: JobFile = { name: 'Job.axb', handle: h, lastModified: 1000, writeConfirmed: true }
    h.touch()
    const asked: SaveQuestion[] = []
    await saveJob(platform(), { project: named('a'), file, saveAs: false, suggestedName: 'Job.axb', ask: async (q) => (asked.push(q), 'cancel') })
    expect(asked).toEqual([{ kind: 'changedElsewhere', fileName: 'Job.axb' }])
    expect(h.writes).toBe(0)
  })

  it('Save as always asks for a place', async () => {
    const h = fakeHandle('Job.axb', 'original')
    const picker = vi.fn(async () => fakeHandle('Other.axb', '') as FileHandleLike)
    const file: JobFile = { name: 'Job.axb', handle: h, lastModified: 1000, writeConfirmed: true }
    await saveJob(platform({ showSaveFilePicker: picker }), { project: named('a'), file, saveAs: true, suggestedName: 'Job.axb', ask: never })
    expect(picker).toHaveBeenCalledTimes(1)
    expect(h.writes).toBe(0)
  })

  it('cancelling the save picker saves nothing', async () => {
    const res = await saveJob(platform({ showSaveFilePicker: async () => Promise.reject(abort()) }), {
      project: named('a'), file: null, saveAs: false, suggestedName: 'a.axb', ask: never,
    })
    expect(res).toEqual({ status: 'cancelled' })
  })

  it('browsers without the File System Access API download a copy', async () => {
    const pf = platform()
    const res = await saveJob(pf, { project: named('a'), file: null, saveAs: false, suggestedName: 'a.axb', ask: never })
    expect(res).toEqual({ status: 'downloaded', file: { name: 'a.axb', handle: null, lastModified: null, writeConfirmed: false } })
    expect(pf.download).toHaveBeenCalledWith('a.axb', saveProject(named('a')))
  })

  it('an invalid project is not written', async () => {
    const target = fakeHandle('a.axb', '')
    const bad = { ...createEmptyProject(), vessel: { ...createEmptyProject().vessel, length: -5 } }
    const res = await saveJob(platform({ showSaveFilePicker: async () => target }), { project: bad, file: null, saveAs: false, suggestedName: 'a.axb', ask: never })
    expect(res.status).toBe('error')
    expect(res.status === 'error' && res.message).toContain('Shell length (Y)')
    expect(target.writes).toBe(0)
  })

  it('suggests a file name from the project name', () => {
    expect(suggestedFileName('V-101 / Unit 3', null)).toBe('V-101 _ Unit 3.axb')
    expect(suggestedFileName('  ', null)).toBe('Untitled job.axb')
    expect(suggestedFileName('x', { name: 'Old.json', handle: null, lastModified: null, writeConfirmed: false })).toBe('Old.axb')
  })
})
