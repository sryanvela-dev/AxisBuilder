// Writing finished files into the job folder for the Export step: files already there are only replaced
// after asking (one question for all of them).

import { createElement as h } from 'react'
import { listFiles, type DirectoryHandleLike } from '../state/folders.ts'
import { plural } from '../state/steps.ts'
import type { useApp } from './appContext.ts'

type App = ReturnType<typeof useApp>

export interface OutFile {
  name: string
  data: Blob | string | Uint8Array
}

/** Names of the files already in the folder (ignoring case). */
export async function existingNames(dir: DirectoryHandleLike, names: readonly string[]): Promise<string[]> {
  const present = new Set((await listFiles(dir)).map((n) => n.toLowerCase()))
  return names.filter((n) => present.has(n.toLowerCase()))
}

/** Asks before replacing files that are already there; true = go ahead (also when there are none). */
export async function okToReplace(app: App, dir: DirectoryHandleLike, names: readonly string[]): Promise<boolean> {
  const existing = await existingNames(dir, names)
  if (existing.length === 0) return true
  const shown = existing.slice(0, 12).map((n) => h('li', { key: n }, n))
  if (existing.length > 12) shown.push(h('li', { key: 'more' }, `...and ${existing.length - 12} more`))
  const answer = await app.ask<'replace' | 'cancel'>({
    title: existing.length === 1 ? `Replace ${existing[0]}?` : `Replace ${plural(existing.length, 'file')}?`,
    message: h('div', null, h('p', null, `${existing.length === 1 ? 'This file is' : 'These files are'} already in ${dir.name}:`), h('ul', { className: 'paste-list' }, shown)),
    buttons: [
      { id: 'replace', label: existing.length === 1 ? 'Replace it' : 'Replace them', primary: true },
      { id: 'cancel', label: 'Cancel' },
    ],
    cancelId: 'cancel',
  })
  return answer === 'replace'
}

export async function writeFile(dir: DirectoryHandleLike, f: OutFile): Promise<void> {
  const w = await (await dir.getFileHandle(f.name, { create: true })).createWritable()
  await w.write(f.data instanceof Uint8Array ? new Blob([f.data as BlobPart]) : f.data)
  await w.close()
}

/** Writes the files after asking about any already there; null when the user cancelled (nothing written). */
export async function writeFilesAsking(app: App, dir: DirectoryHandleLike, files: OutFile[]): Promise<string[] | null> {
  if (!(await okToReplace(app, dir, files.map((f) => f.name)))) return null
  for (const f of files) await writeFile(dir, f)
  return files.map((f) => f.name)
}
