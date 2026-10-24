// The AUT scans step (CSV import, scan table, scan settings) and the Images step (photo folder,
// matching, which photo each scan uses, and making the processed images).

import { useState, type DragEvent } from 'react'
import { importAutCsv, replaceScans } from '../data/autCsvImport.ts'
import { reversedScans, swapReversedScans, syncScanImages } from '../data/columns.ts'
import { formatNumber } from '../data/parse.ts'
import type { Scan } from '../data/schema.ts'
import { circumference, scanXRange } from '../engine/wrap.ts'
import { pickWithInput } from '../state/projectFiles.ts'
import type { StepStatus } from '../state/steps.ts'
import { plural } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { DataTable, type DerivedColumn } from './DataTable.tsx'
import { PhotoPanel } from './PhotoPanel.tsx'
import { ProcessPanel } from './ProcessPanel.tsx'
import { AutReportTable } from './reports.tsx'
import { SettingsGroup } from './SettingsForm.tsx'
import { ImportReportPart, StepIssues } from './stepParts.tsx'
import { useJobFolders } from './foldersContext.ts'

type StepProps = { status: StepStatus }

const size = (a: number | null, b: number | null) => (a === null || b === null ? '–' : formatNumber(Math.abs(b - a)))
/** Width and height columns; a scan marked across the seam runs from X start on past X = 0 to X stop. */
const scanSizes = (C: number | null): DerivedColumn[] => [
  {
    title: 'Width (in)',
    value: (s) => {
      const sc = s as unknown as Scan
      if (sc.xStart === null || sc.xStop === null) return size(sc.xStart, sc.xStop)
      const { a, b } = scanXRange(sc, C)
      return size(a, b)
    },
  },
  { title: 'Height (in)', value: (s) => size(s.yStart as number | null, s.yStop as number | null) },
]

export function ScansStep({ status }: StepProps) {
  const app = useApp()
  const job = app.state.job!
  const p = job.history.present
  const last = job.autImport
  const [dragging, setDragging] = useState(false)
  const reversed = reversedScans(p)

  async function importFile(file: File) {
    if (!/\.csv$/i.test(file.name)) {
      await app.ask({
        title: 'Not a CSV file',
        message: <p>{file.name} is not a CSV file. Export the scan list from the AUT software as CSV and use that.</p>,
        buttons: [{ id: 'ok', label: 'OK', primary: true }],
        cancelId: 'ok',
      })
      return
    }
    const result = importAutCsv(await file.arrayBuffer(), { circumference: p.vessel.height })
    app.dispatch({ type: 'setAutImport', fileName: file.name, result })
    if (!result.ok) return
    if (p.scans.length > 0) {
      const linked = p.scanImages.filter((l) => l.imageFile.trim() !== '').length
      const answer = await app.ask({
        title: 'Replace the AUT scans?',
        message: (
          <p>
            The job has {plural(p.scans.length, 'scan')}. Importing {file.name} replaces them with {plural(result.scans.length, 'scan')}
            {linked > 0 ? `, and the photos chosen for the old scans (${linked}) are removed` : ''}. You can undo this.
          </p>
        ),
        buttons: [
          { id: 'replace', label: 'Replace the scans', primary: true },
          { id: 'cancel', label: 'Cancel' },
        ],
        cancelId: 'cancel',
      })
      if (answer !== 'replace') return
    }
    app.edit(`Import AUT scans from ${file.name}`, (proj) => replaceScans(proj, result.scans))
    app.dispatch({ type: 'clearDrafts', prefix: 'scans.' })
  }

  async function pick() {
    const file = await pickWithInput('.csv,text/csv')
    if (file) await importFile(file)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void importFile(file)
  }

  return (
    <>
      <StepIssues status={status} />
      <section
        className={`drop-zone${dragging ? ' drop-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-label="AUT CSV import"
      >
        <button type="button" className="btn btn-primary" onClick={() => void pick()}>
          Import AUT CSV
        </button>
        <span className="muted">or drop the CSV file here. The scans are read in this browser; nothing is uploaded.</span>
      </section>
      {last && (
        <section>
          <h2>Last import: {last.fileName}</h2>
          <p className={last.result.ok ? '' : 'error'}>
            {last.result.ok
              ? `${plural(last.result.summary.imported, 'scan')} read from ${plural(last.result.summary.rowsRead, 'row')}` +
                (last.result.summary.calibrationRowsSkipped ? `, ${plural(last.result.summary.calibrationRowsSkipped, 'calibration row')} skipped` : '') +
                '.'
              : 'The import stopped and nothing was imported. Fix the CSV and import it again.'}
          </p>
          <AutReportTable entries={last.result.report} />
        </section>
      )}
      <section className="list-section" id="list-scans">
        <h2>
          AUT scans <span className="muted">({p.scans.length})</span>
        </h2>
        <p className="muted">X runs around the shell, Y along it, in inches.</p>
        {reversed.length > 0 && (
          <div className="notice">
            <p>
              {plural(reversed.length, 'scan')} {reversed.length === 1 ? 'has' : 'have'} a start larger than its stop ({reversed.slice(0, 6).join(', ')}
              {reversed.length > 6 ? ', ...' : ''}). The drawing swaps them anyway; swap them here so the table shows them the right way round.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                app.edit(`Swap reversed starts and stops (${plural(reversed.length, 'scan')})`, swapReversedScans)
                app.dispatch({ type: 'clearDrafts', prefix: 'scans.' })
              }}
            >
              Swap reversed starts and stops
            </button>
          </div>
        )}
        <DataTable list="scans" step="scans" derived={scanSizes(circumference(p))} afterEdit={syncScanImages} />
      </section>
      <SettingsGroup group="scans" step="scans" />
      <ImportReportPart step="scans" />
    </>
  )
}

export function ImagesStep({ status }: StepProps) {
  const app = useApp()
  const p = app.state.job!.history.present
  const { photos, jobFolder } = useJobFolders()
  if (p.scans.length === 0) {
    return (
      <>
        <p>Import the AUT scans first; then choose the folder with the scan photos here.</p>
        <div className="button-row">
          <button type="button" className="btn" onClick={() => app.goToStep('scans')}>
            Go to AUT scans
          </button>
        </div>
      </>
    )
  }
  return (
    <>
      <StepIssues status={status} />
      {p.settings.generateOverlayDrawing ? (
        <>
          <PhotoPanel photos={photos} />
          <ProcessPanel photos={photos} jobFolder={jobFolder} />
        </>
      ) : (
        <p className="coming-soon">"Use scan images" is off (below), so the drawing is made without photos.</p>
      )}
      <SettingsGroup group="images" step="images" />
      <ImportReportPart step="images" />
    </>
  )
}
