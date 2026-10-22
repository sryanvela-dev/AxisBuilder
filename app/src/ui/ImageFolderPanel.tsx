// Scan image folder step (test screen): pick a folder, check the naming format against example
// thumbnails, resolve scans with several candidate files, then save the choices into the project.
// Files are read in this browser only (names, plus thumbnails on screen); nothing is uploaded.

import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import type { Project } from '../data/schema.ts'
import { applyImageChoices, matchScanImages, resolveImageFile, type ScanMatchStatus } from '../data/imageMatch.ts'

const STATUS_LABEL: Record<ScanMatchStatus, string> = { matched: 'Matched', choose: 'Choose', noMatch: 'No match' }
const STATUS_KIND: Record<ScanMatchStatus, string> = { matched: 'changed', choose: 'review', noMatch: 'invalid' }
const SKIP = '\u0000skip'

interface Folder {
  name: string
  names: string[]
  getFile: (name: string) => Promise<File | null>
}

interface FileEntry {
  kind: 'file' | 'directory'
  name: string
  getFile?: () => Promise<File>
}

/** Chrome/Edge folder picker; top-level files only, like v5.0. Returns undefined if not supported. */
async function pickWithDirectoryPicker(): Promise<Folder | null | undefined> {
  const picker = (window as unknown as {
    showDirectoryPicker?: () => Promise<{ name: string; values(): AsyncIterable<FileEntry> }>
  }).showDirectoryPicker
  if (!picker) return undefined
  let dir
  try {
    dir = await picker()
  } catch {
    return null // cancelled
  }
  const entries = new Map<string, FileEntry>()
  for await (const e of dir.values()) if (e.kind === 'file') entries.set(e.name, e)
  return {
    name: dir.name,
    names: [...entries.keys()].sort(),
    getFile: async (n) => (await entries.get(n)?.getFile?.()) ?? null,
  }
}

function folderFromInput(files: FileList): Folder {
  const top = [...files].filter((f) => (f as File & { webkitRelativePath: string }).webkitRelativePath.split('/').length === 2)
  const byName = new Map(top.map((f) => [f.name, f]))
  const first = (files[0] as (File & { webkitRelativePath: string }) | undefined)?.webkitRelativePath.split('/')[0] ?? ''
  return { name: first, names: [...byName.keys()].sort(), getFile: async (n) => byName.get(n) ?? null }
}

/** Thumbnail of one file; a new file name mounts a fresh image. */
function Thumb({ folder, name }: { folder: Folder; name: string | null }) {
  return <ThumbImage key={name ?? ''} folder={folder} name={name} />
}

function ThumbImage({ folder, name }: { folder: Folder; name: string | null }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true
    let made = ''
    if (name) {
      void folder.getFile(name).then((f) => {
        if (alive && f) {
          made = URL.createObjectURL(f)
          setUrl(made)
        }
      })
    }
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [folder, name])
  if (!name) return <span className="thumb thumb-empty" />
  return url ? <img className="thumb" src={url} alt={name} loading="lazy" /> : <span className="thumb thumb-empty" />
}

export function ImageFolderPanel({ project, onApply }: { project: Project; onApply: (p: Project) => void }) {
  const [folder, setFolder] = useState<Folder | null>(null)
  const [pattern, setPattern] = useState<string | undefined>(undefined)
  const [picks, setPicks] = useState<Map<string, string>>(new Map())
  const [confirming, setConfirming] = useState<{ scanId: string; from: string; to: string }[] | null>(null)
  const [saved, setSaved] = useState('')

  const current = useMemo(() => {
    const links = new Map(project.scanImages.map((l) => [l.scanId.toLowerCase(), l.imageFile]))
    return project.scans.map((s) => ({ id: s.id, imageFile: links.get(s.id.toLowerCase()) }))
  }, [project])

  const result = useMemo(
    () => (folder ? matchScanImages(current, folder.names, pattern ? { pattern } : {}) : null),
    [folder, current, pattern],
  )

  function start(f: Folder) {
    setFolder(f)
    setPattern(undefined)
    setPicks(new Map())
    setConfirming(null)
    setSaved('')
  }

  async function onChoose() {
    const picked = await pickWithDirectoryPicker()
    if (picked === undefined) document.getElementById('folder-input')?.click()
    else if (picked) start(picked)
  }

  function onFolderInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) start(folderFromInput(e.target.files))
    e.target.value = ''
  }

  function changePattern(p: string) {
    setPattern(p)
    setPicks(new Map())
    setConfirming(null)
    setSaved('')
  }

  /** The file each scan will get: matched file, the user's pick, or null (skip / no file). */
  function finalFile(scanId: string): string | null {
    const m = result?.scans.find((s) => s.scanId === scanId)
    if (!m) return null
    const pick = picks.get(scanId)
    if (m.status === 'matched') return m.file
    if (m.status === 'choose' && pick && pick !== SKIP) return pick
    return null
  }

  const unresolved = result?.scans.filter((m) => m.status === 'choose' && !picks.get(m.scanId)).length ?? 0

  function onUse() {
    if (!result || !folder) return
    const changes = result.scans
      .map((m) => ({ m, to: finalFile(m.scanId) }))
      .filter(({ m, to }) => {
        const from = current.find((c) => c.id === m.scanId)?.imageFile?.trim() ?? ''
        return to && from && resolveImageFile(from, folder.names)?.toLowerCase() !== to.toLowerCase()
      })
      .map(({ m, to }) => ({ scanId: m.scanId, from: current.find((c) => c.id === m.scanId)?.imageFile ?? '', to: to! }))
    if (changes.length > 0) setConfirming(changes)
    else save(false)
  }

  function save(keepExisting: boolean) {
    if (!result) return
    const keep = new Set(keepExisting ? (confirming ?? []).map((c) => c.scanId) : [])
    const choices = new Map<string, string>()
    for (const m of result.scans) {
      const f = finalFile(m.scanId)
      if (f && !keep.has(m.scanId)) choices.set(m.scanId, f)
    }
    onApply(applyImageChoices(project, choices))
    setConfirming(null)
    const skipped = result.scans.length - choices.size
    setSaved(`Image files saved to the project for ${choices.size} scan(s)` + (skipped ? `; ${skipped} left as they were.` : '.'))
  }

  return (
    <section>
      <h2>Scan images</h2>
      <div className="actions">
        <button type="button" className="button" onClick={onChoose} disabled={project.scans.length === 0}>
          Choose image folder
        </button>
        <input id="folder-input" type="file" hidden onChange={onFolderInput} {...{ webkitdirectory: '' }} />
        {project.scans.length === 0 && <span className="muted">Open an AUT CSV or a .xlsm job first.</span>}
        {folder && <span className="muted">Folder: {folder.name} ({folder.names.length} files)</span>}
      </div>

      {result && folder && (
        <>
          {result.nothingFits && (
            <div className="notice notice-error" role="alert">
              <strong>No photos in this folder match your scans.</strong> Check that you picked the right folder.
              {folder.names.length > 0 && (
                <span className="muted">
                  {' '}
                  It has {folder.names.length} file(s), e.g. {folder.names.slice(0, 5).join(', ')}
                  {folder.names.length > 5 ? ', ...' : ''}.
                </span>
              )}
            </div>
          )}

          {result.patterns.length > 0 && (
            <>
              <h3>1. Naming format (# = scan number)</h3>
              {result.needsPatternChoice && (
                <p className="muted">Several formats found. The one covering the most scans is selected; check its example.</p>
              )}
              <div className="formats">
                {result.patterns.map((p) => (
                  <label key={p.pattern} className={`format${p.pattern === result.chosenPattern ? ' format-chosen' : ''}`}>
                    <input
                      type="radio"
                      name="format"
                      checked={p.pattern === result.chosenPattern}
                      onChange={() => changePattern(p.pattern)}
                    />
                    <Thumb folder={folder} name={p.example} />
                    <span>
                      <strong>{p.pattern}</strong>
                      <br />
                      <span className="muted">
                        {p.scanCount} of {result.scans.length} scans, {p.fileCount} file(s), e.g. {p.example}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <h3>2. Check each scan</h3>
          <p>
            {result.counts.matched} matched, {result.counts.choose} to choose, {result.counts.noMatch} with no match.
          </p>
          <div className="table-wrap">
            <table className="report">
              <thead>
                <tr>
                  <th>Scan</th>
                  <th>Result</th>
                  <th>Image</th>
                  <th>File</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {result.scans.map((m) => (
                  <tr key={m.scanId}>
                    <td>{m.scanId}</td>
                    <td>
                      <span className={`kind kind-${STATUS_KIND[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                    </td>
                    <td>
                      <Thumb folder={folder} name={finalFile(m.scanId)} />
                    </td>
                    <td className="value">
                      {m.status === 'choose' ? (
                        <select
                          value={picks.get(m.scanId) ?? ''}
                          onChange={(e) => setPicks(new Map(picks).set(m.scanId, e.target.value))}
                        >
                          <option value="">Pick a file...</option>
                          {m.candidates.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                          <option value={SKIP}>Skip this scan</option>
                        </select>
                      ) : (
                        (m.file ?? '')
                      )}
                    </td>
                    <td>{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>3. Save to the project</h3>
          {confirming ? (
            <div className="notice">
              <p>
                {confirming.length} scan(s) already have a different image file. Replace{' '}
                {confirming.length === 1 ? 'it' : 'them'}?
              </p>
              <ul>
                {confirming.slice(0, 5).map((c) => (
                  <li key={c.scanId}>
                    {c.scanId}: {c.from} &rarr; {c.to}
                  </li>
                ))}
                {confirming.length > 5 && <li>...</li>}
              </ul>
              <div className="actions">
                <button type="button" className="button" onClick={() => save(false)}>
                  Replace
                </button>
                <button type="button" className="button button-plain" onClick={() => save(true)}>
                  Keep existing
                </button>
                <button type="button" className="button button-plain" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="actions">
              <button type="button" className="button" onClick={onUse} disabled={unresolved > 0 || result.nothingFits}>
                Use these images
              </button>
              {unresolved > 0 && <span className="muted">Pick a file (or Skip) for {unresolved} scan(s) first.</span>}
              {saved && <span>{saved}</span>}
            </div>
          )}

          {result.ignoredFiles.length > 0 && (
            <>
              <h3>Files not used ({result.ignoredFiles.length})</h3>
              <ul>
                {result.ignoredFiles.map((f) => (
                  <li key={f.name}>
                    {f.name}: {f.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
