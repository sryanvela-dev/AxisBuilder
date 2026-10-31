// The bar under the top bar, in the drawing and the report (ui/useJobFiles.ts): shown while files the job uses are
// waiting for the browser's OK after a reopen or restore ("Restore files": one click asks for all of them), or are not
// found in this browser ("Find files...": pick any folder, it and its subfolders are searched by name).

import { useJobFiles } from './useJobFiles.ts'

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

export function RestoreFilesBar() {
  const f = useJobFiles()
  if (!f.groups || (f.waitingCount === 0 && f.missingCount === 0)) return null
  const waiting = f.groups.filter((g) => g.waiting.length)
  return (
    <div className="restore-bar" role="status">
      <span>
        {f.waitingCount > 0 ? (
          <>
            <strong>Waiting for the browser&apos;s OK</strong> (it asks again each time a job is reopened):{' '}
            {waiting.map((g) => g.what.toLowerCase()).join(', ')}.
          </>
        ) : (
          <>
            <strong>{plural(f.missingCount, 'file')} this job uses {f.missingCount === 1 ? 'is' : 'are'} not found in this browser.</strong> Pick
            the folder they are in, or one above it: its subfolders are searched too.
          </>
        )}
        {f.busy && f.searched > 0 && <> Searching... {plural(f.searched, 'folder')} so far.</>}
        {f.note && <> {f.note}</>}
      </span>
      <span className="button-row">
        {f.waitingCount > 0 && (
          <button type="button" className="btn btn-primary btn-small" disabled={f.busy} onClick={() => void f.restore()}
            title="The browser asks once for each folder and each file picked on its own; choose Allow (or Allow on every visit)">
            Restore files
          </button>
        )}
        {f.waitingCount === 0 && f.missingCount > 0 && (
          <button type="button" className="btn btn-primary btn-small" disabled={f.busy} onClick={() => void f.find()}
            title="Searches the folder you pick and its subfolders for the files by name">
            Find files...
          </button>
        )}
      </span>
    </div>
  )
}
