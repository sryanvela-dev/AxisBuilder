// Single files remembered per job in the browser (state/files.ts): the report's cover photo and calibration screenshot.
import { describe, expect, it } from 'vitest'
import { forgetFile, recallFile, rememberFile } from '../../src/state/files.ts'
import type { FileHandleLike } from '../../src/state/session.ts'
import { memoryStore } from '../../src/state/storage.ts'

const handle = (name: string): FileHandleLike => ({ kind: 'file', name, getFile: async () => new File(['x'], name) })

describe('remembered files', () => {
  it('keeps one file per job and slot, and forgets it', async () => {
    const store = memoryStore()
    expect(await recallFile(store, 'job1', 'coverPhoto')).toBeNull()
    await rememberFile(store, 'job1', 'coverPhoto', handle('IMG_2041.jpg'))
    await rememberFile(store, 'job1', 'dynamicImage', handle('cal.png'))
    await rememberFile(store, 'job2', 'coverPhoto', handle('other.jpg'))
    expect((await recallFile(store, 'job1', 'coverPhoto'))?.name).toBe('IMG_2041.jpg')
    expect((await recallFile(store, 'job1', 'dynamicImage'))?.name).toBe('cal.png')
    await forgetFile(store, 'job1', 'coverPhoto')
    expect(await recallFile(store, 'job1', 'coverPhoto')).toBeNull()
    expect((await recallFile(store, 'job2', 'coverPhoto'))?.name).toBe('other.jpg')
  })
})
