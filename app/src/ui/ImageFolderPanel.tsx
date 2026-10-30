// Matching image files to scans by scan number: the scan photos (Images step) and the report's data-page
// screenshots (report AUT results). Check the naming format against example thumbnails, pick a file for scans with
// several candidates, confirm replacing files already chosen, then hand the choices to the caller to save. The folder
// comes from the step. Files are read in this browser only (names, plus thumbnails on screen); nothing is uploaded.

import { useEffect, useMemo, useState } from 'react'
import type { PhotoFolder } from './photoFolder.ts'
import { matchScanImages, resolveImageFile, type ScanMatchStatus, type ScanToMatch } from '../data/imageMatch.ts'

const STATUS_LABEL: Record<ScanMatchStatus, string> = { matched: 'Matched', choose: 'Choose', noMatch: 'No match' }
const STATUS_KIND: Record<ScanMatchStatus, string> = { matched: 'changed', choose: 'review', noMatch: 'invalid' }
const SKIP = '\u0000skip'

/** Thumbnail of one file; a new file name mounts a fresh image. */
export function Thumb({ folder, name }: { folder: PhotoFolder; name: string | null }) {
  return <ThumbImage key={name ?? ''} folder={folder} name={name} />
}

function ThumbImage({ folder, name }: { folder: PhotoFolder; name: string | null }) {
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

/** What is matched: scan photos or the report's data-page screenshots (only the words differ). */
export type MatchWhat = 'photo' | 'screenshot'

export function ImageFolderPanel(props: {
  /** Each scan with the file it has now. */
  scans: readonly ScanToMatch[]
  folder: PhotoFolder
  /** Saves the chosen file per scan ID (scans not in the map keep theirs). */
  onSave: (choices: ReadonlyMap<string, string>) => void
  onClose: () => void
  what?: MatchWhat
}) {
  const { folder, onClose } = props
  const noun = props.what === 'screenshot' ? 'screenshot' : 'photo'
  const [pattern, setPattern] = useState<string | undefined>(undefined)
  const [picks, setPicks] = useState<Map<string, string>>(new Map())
  const [confirming, setConfirming] = useState<{ scanId: string; from: string; to: string }[] | null>(null)
  const [saved, setSaved] = useState('')

  const current = props.scans

  const result = useMemo(
    () => matchScanImages(current, folder.names, pattern ? { pattern } : {}),
    [folder, current, pattern],
  )

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
    props.onSave(choices)
    setConfirming(null)
    const skipped = result.scans.length - choices.size
    setSaved(`${noun === 'photo' ? 'Photos' : 'Screenshots'} saved for ${choices.size} scan(s)` + (skipped ? `; ${skipped} left as they were.` : '.'))
    onClose()
  }

  return (
    <section className="match-panel">
      <div className="group-head">
        <h2>Match {noun}s to scans</h2>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Close without saving
        </button>
      </div>

      {result && (
        <>
          {result.nothingFits && (
            <div className="notice notice-error" role="alert">
              <strong>No {noun}s in this folder match your scans.</strong> Check that you picked the right folder.
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

          <h3>3. Save to the job</h3>
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
                Use these {noun}s
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
