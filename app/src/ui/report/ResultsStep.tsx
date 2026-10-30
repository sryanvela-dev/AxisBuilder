// Report step 3, AUT results (design 4.3 and 5): import scansheet.csv (button or drop) or paste a scan sheet from Excel;
// the same file places the scans in the drawing when the job has none, else its results are matched by scan number and
// differing positions are listed for the user to choose (one undo step). The results table has one row per drawing
// scan with its comment built from the ladder; each row opens to the comment picks, increments and its screenshot.
// Screenshots are matched by scan number from a remembered folder (the drawing's ImageFolderPanel).

import { Fragment, useMemo, useState, type DragEvent } from 'react'
import { formatNumber } from '../../data/parse.ts'
import { idKey, type Scan } from '../../data/schema.ts'
import { jobLadder, scanRows, type ScanRow } from '../../report/calc/results.ts'
import { setDataImages, setScanResult } from '../../report/edits.ts'
import { resultOf, scanComponent } from '../../report/report.ts'
import { applyScansheet, importScansheet, type PositionDiff, type ScansheetImport } from '../../report/scansheetImport.ts'
import { pickWithInput } from '../../state/projectFiles.ts'
import { plural } from '../../state/steps.ts'
import { useApp } from '../appContext.ts'
import { ImageFolderPanel } from '../ImageFolderPanel.tsx'
import { Flag, ReportBox, ReportCheckbox, ReportSelect, RowMessages, type Message } from './boxes.tsx'
import { CommentPicks, CommentText, WallLoss } from './CommentPicks.tsx'
import { FilePick, ReportFolderBar } from './FilePick.tsx'
import { reportPlaceId } from './places.ts'
import { useReport } from './reportContext.ts'
import { ReportStepIssues, type ReportStepProps } from './ReportWorkspace.tsx'
import { ScansheetPasteDialog } from './ScansheetPasteDialog.tsx'
import { ScansheetReport } from './ScansheetReport.tsx'

const STEP = 'results' as const
const fmt = (v: number | null) => (v === null ? '–' : formatNumber(v))
const posText = (s: PositionDiff['csv']) => `X ${fmt(s.xStart)} to ${fmt(s.xStop)}, Y ${fmt(s.yStart)} to ${fmt(s.yStop)}`

export function ResultsStep({ status }: ReportStepProps) {
  const app = useApp()
  const p = app.state.job!.history.present
  const report = p.report!
  const { screenshots } = useReport()
  const [dragging, setDragging] = useState(false)
  const [last, setLast] = useState<{ source: string; imp: ScansheetImport } | null>(null)
  const [pending, setPending] = useState<{ source: string; imp: ScansheetImport; useFile: Set<string> } | null>(null)
  const [pasting, setPasting] = useState(false)
  const [matching, setMatching] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())

  function apply(source: string, imp: ScansheetImport, useFile: ReadonlySet<string>) {
    app.edit(`Import results from ${source}`, (q) => applyScansheet(q, imp, { useFilePositions: useFile }))
    app.dispatch({ type: 'clearDrafts', prefix: 'report.scan.' })
    if (imp.mode === 'create') app.dispatch({ type: 'clearDrafts', prefix: 'scans.' })
    setPending(null)
  }

  /** A read CSV or paste: shown, then applied (after the position choice when positions differ). */
  function accept(source: string, imp: ScansheetImport) {
    setLast({ source, imp })
    setPasting(false)
    if (!imp.ok) return
    if (imp.positionDiffs.length > 0) setPending({ source, imp, useFile: new Set() })
    else apply(source, imp, new Set())
  }

  async function importFile(file: File) {
    if (!/\.csv$/i.test(file.name)) {
      await app.ask({
        title: 'Not a CSV file',
        message: <p>{file.name} is not a CSV file. Export the scan sheet (scansheet.csv) from the AUT software and use that.</p>,
        buttons: [{ id: 'ok', label: 'OK', primary: true }],
        cancelId: 'ok',
      })
      return
    }
    accept(file.name, importScansheet(await file.arrayBuffer(), p))
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

  // Every drawing scan is listed, also the ones taken out of the report (so they can be put back in).
  const rows = useMemo(() => {
    const all = { ...report, scanResults: report.scanResults.map((r) => ({ ...r, inReport: true })) }
    return scanRows(p, all, jobLadder(report))
  }, [p, report])
  const ladder = jobLadder(report)
  const messagesOf = (scan: Scan): Message[] =>
    status.issues
      .filter((i) => i.check?.place.kind === 'scan' && idKey(i.check.place.scanId) === idKey(scan.id))
      .map((i) => ({ text: `${i.text} ${i.fix ?? ''}`.trim(), severity: i.blocksExport ? 'error' : 'warning' }))
  const toggle = (id: string) => setOpen((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const withShots = report.scanResults.filter((r) => r.dataImage !== null).length

  return (
    <>
      <ReportStepIssues status={status} />
      <section
        className={`drop-zone${dragging ? ' drop-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-label="Scansheet import"
      >
        <button type="button" className="btn btn-primary" onClick={() => void pick()}>
          Import scansheet.csv
        </button>
        <button type="button" className="btn" onClick={() => setPasting(true)}>
          Paste from Excel
        </button>
        <span className="muted">
          or drop the CSV here. {p.scans.length === 0 ? 'The job has no scans yet: the file places them in the drawing too.' : 'Results are matched to the drawing’s scans by scan number.'}
        </span>
      </section>

      {pending && (
        <section className="notice" aria-labelledby="positions-title">
          <h2 id="positions-title">Positions differ ({pending.imp.positionDiffs.length})</h2>
          <p>
            {pending.source} places {plural(pending.imp.positionDiffs.length, 'scan')} differently from the drawing. Choose which position to keep for
            each; the results are imported either way.
          </p>
          <div className="table-wrap">
            <table className="report">
              <thead>
                <tr>
                  <th>Scan</th>
                  <th>Keep the drawing’s</th>
                  <th>Use the file’s</th>
                </tr>
              </thead>
              <tbody>
                {pending.imp.positionDiffs.map((d) => {
                  const useFile = pending.useFile.has(d.scanId)
                  const set = (v: boolean) => {
                    const n = new Set(pending.useFile)
                    if (v) n.add(d.scanId)
                    else n.delete(d.scanId)
                    setPending({ ...pending, useFile: n })
                  }
                  return (
                    <tr key={d.scanId}>
                      <td>{d.scanId}</td>
                      <td>
                        <label className="switch">
                          <input type="radio" name={`pos-${d.scanId}`} checked={!useFile} onChange={() => set(false)} /> {posText(d.drawing)}
                        </label>
                      </td>
                      <td>
                        <label className="switch">
                          <input type="radio" name={`pos-${d.scanId}`} checked={useFile} onChange={() => set(true)} /> {posText(d.csv)}
                        </label>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="button-row">
            <button type="button" className="btn btn-primary" onClick={() => apply(pending.source, pending.imp, pending.useFile)}>
              Import with these positions
            </button>
            <button type="button" className="btn" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {last && (
        <section>
          <h2>Last import: {last.source}</h2>
          <p className={last.imp.ok ? '' : 'error'}>
            {last.imp.ok
              ? `${plural(last.imp.rows.filter((r) => r.scanId !== null).length, 'scan')} read${last.imp.mode === 'create' ? ' and placed in the drawing' : ''}.`
              : 'The import stopped and nothing was imported. Fix the file and import it again.'}
          </p>
          <details open={!last.imp.ok}>
            <summary>Import report ({last.imp.report.length})</summary>
            <ScansheetReport entries={last.imp.report} />
          </details>
        </section>
      )}

      <section className="list-section">
        <h2>
          Results <span className="muted">({p.scans.length} scans)</span>
        </h2>
        {p.scans.length === 0 ? (
          <p className="muted">No scans yet. Import the scansheet above, or the AUT CSV on the drawing's AUT scans step.</p>
        ) : (
          <>
            <p className="muted">
              Wall loss is worked out from Min 'T' and the component's nominal{report.options.tempCorrection.on ? ', after temperature correction' : ''}. Open a row
              for the comment picks, increments and screenshot.
            </p>
            <div className="table-wrap">
              <table className="grid results-table">
                <thead>
                  <tr>
                    <th>Scan</th>
                    <th>Component</th>
                    <th>Location</th>
                    <th title="Listed in the report (separate from the drawing's Include)">In report</th>
                    <th>Readings</th>
                    <th>Min 'T' (in)</th>
                    <th>Avg 'T' (in)</th>
                    <th>Nominal</th>
                    <th>Wall loss</th>
                    <th>Comment</th>
                    <th><span className="visually-hidden">Details</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <ResultRow key={row.scan.id} row={row} open={open.has(row.scan.id)} onToggle={() => toggle(row.scan.id)} messages={messagesOf(row.scan)} ladder={ladder} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="photo-panel">
        <h2>Screenshots</h2>
        <p className="muted">
          The data-page screenshot of each scan (C-scan pages). {withShots} of {p.scans.length} scans have one. If the folder holds the data pages and the
          overlay images, choose the data pages' naming format here; the overlay images are chosen on the drawing's Images step.
        </p>
        <ReportFolderBar folder={screenshots} label="Screenshots folder" />
        {screenshots.status === 'ready' && p.scans.length > 0 && !matching && (
          <div className="button-row">
            <button type="button" className="btn btn-primary" onClick={() => setMatching(true)}>
              Match screenshots to scans
            </button>
          </div>
        )}
        {matching && screenshots.photoFolder && (
          <ImageFolderPanel
            key={`${screenshots.name}|${screenshots.photoFolder.names.length}`}
            what="screenshot"
            scans={p.scans.map((s) => ({ id: s.id, imageFile: resultOf(report, s.id)?.dataImage ?? undefined }))}
            folder={screenshots.photoFolder}
            onSave={(choices) => app.edit('Match screenshots to scans', (q) => setDataImages(q, choices))}
            onClose={() => setMatching(false)}
          />
        )}
      </section>

      {pasting && <ScansheetPasteDialog onClose={() => setPasting(false)} onUse={(imp) => accept('the paste', imp)} />}
    </>
  )
}

function ResultRow({ row, open, onToggle, messages, ladder }: { row: ScanRow; open: boolean; onToggle: () => void; messages: Message[]; ladder: ReturnType<typeof jobLadder> }) {
  const app = useApp()
  const p = app.state.job!.history.present
  const report = p.report!
  const { screenshots } = useReport()
  const { scan, result } = row
  const id = scan.id
  const key = `report.scan.${idKey(id)}`
  const set = (change: Parameters<typeof setScanResult>[2]) => (q: typeof p) => setScanResult(q, id, change)
  const auto = scanComponent(report, scan, result ? { ...result, componentId: null } : undefined)
  const inReport = result?.inReport ?? true
  const calc = (f: 'readings' | 'incrX' | 'incrY') => result?.calculated.includes(f) ? <Flag kind="changed" title="Worked out, not read from the scan sheet">calculated</Flag> : undefined
  const severity = row.band === null ? null : ladder.severity[Math.min(row.band, ladder.severity.length - 1)].id
  const picks = result ?? { severityOverride: null, form: '', cause: '', surface: 'ID', midWall: 'none', commentOverride: null }
  return (
    <Fragment>
      <tr id={reportPlaceId({ kind: 'scan', scanId: id })} className={[messages.length ? 'has-messages' : '', inReport ? '' : 'row-out'].filter(Boolean).join(' ') || undefined}>
        <td>
          <strong>{id}</strong>
          {!scan.include && <span className="muted"> (off in the drawing)</span>}
        </td>
        <td>
          {report.components.length > 1 ? (
            <ReportSelect compact label="Component" where={`${id}, component`} value={result?.componentId ?? ''}
              options={[{ value: '', label: `Automatic (${auto?.name ?? 'none'})` }, ...report.components.map((c) => ({ value: c.id, label: c.name }))]}
              set={(q, v: string) => set({ componentId: v === '' ? null : v })(q)} boxKey={`${key}.componentId`} step={STEP} />
          ) : (
            row.component?.name ?? <span className="muted">none</span>
          )}
        </td>
        <td>
          <ReportBox compact label="Location" where={`${id}, location`} kind="optText" value={result?.location ?? null} placeholder="e.g. Bottom"
            set={(q, v: string | null) => set({ location: v })(q)} boxKey={`${key}.location`} step={STEP} />
        </td>
        <td>
          <ReportCheckbox compact label="In report" where={`${id}, in report`} value={inReport} set={(q, v: boolean) => set({ inReport: v })(q)} boxKey={`${key}.inReport`} step={STEP} />
        </td>
        <td>
          <ReportBox compact label="Readings" where={`${id}, readings`} kind="count" value={result?.readings ?? null} tag={calc('readings')}
            placeholder={row.readingsCalculated && row.readings !== null ? `${row.readings.toLocaleString('en-US')} calc.` : ''}
            help={row.readingsCalculated ? 'Blank: worked out from the size and increments.' : undefined}
            set={(q, v: number | null) => set({ readings: v })(q)} boxKey={`${key}.readings`} step={STEP} />
        </td>
        <td>
          <ReportBox compact label="Min 'T'" where={`${id}, Min 'T'`} kind="reading" value={result?.minT ?? null}
            set={(q, v: number | null) => set({ minT: v })(q)} boxKey={`${key}.minT`} step={STEP} />
        </td>
        <td>
          <ReportBox compact label="Avg 'T'" where={`${id}, Avg 'T'`} kind="reading" value={result?.avgT ?? null}
            set={(q, v: number | null) => set({ avgT: v })(q)} boxKey={`${key}.avgT`} step={STEP} />
        </td>
        <td className="num col-derived" title={row.component ? `${row.component.name}'s nominal` : undefined}>{fmt(row.nominal)}</td>
        <td className="num">
          <WallLoss value={row.wallLoss} color={row.color} />
        </td>
        <td className="col-comment">
          <CommentText comment={row.comment} />
        </td>
        <td className="row-actions">
          <button type="button" className="btn btn-small" aria-expanded={open} onClick={onToggle} title="Comment picks, increments and screenshot">
            {open ? 'Close' : 'Details'}
          </button>
        </td>
      </tr>
      <RowMessages messages={messages} colSpan={11} />
      {open && (
        <tr className="row-details">
          <td colSpan={11}>
            <CommentPicks ladder={ladder} picks={picks} comment={row.comment} ladderSeverity={severity} name={id} step={STEP} boxKey={key}
              set={(q, change) => setScanResult(q, id, change)} />
            <div className="field-grid">
              <ReportBox label="X increment" where={`${id}, X increment`} kind="thickness" units="in" value={result?.incrX ?? null} tag={calc('incrX')}
                placeholder={report.calibration.increments.x === null ? '' : `${formatNumber(report.calibration.increments.x)} (job)`}
                set={(q, v: number | null) => set({ incrX: v })(q)} boxKey={`${key}.incrX`} step={STEP} help="Blank = the job's increment (Calibration step)." />
              <ReportBox label="Y increment" where={`${id}, Y increment`} kind="thickness" units="in" value={result?.incrY ?? null} tag={calc('incrY')}
                placeholder={report.calibration.increments.y === null ? '' : `${formatNumber(report.calibration.increments.y)} (job)`}
                set={(q, v: number | null) => set({ incrY: v })(q)} boxKey={`${key}.incrY`} step={STEP} />
              <FilePick label="Data-page screenshot" folder={screenshots} value={result?.dataImage ?? null} set={(q, f) => setScanResult(q, id, { dataImage: f })} />
            </div>
            {result && (result.csvComment || result.csvNomT !== null || result.csvWallRemain !== null) && (
              <p className="muted">
                From the scansheet:{result.csvNomT !== null && ` Nom. 'T' ${formatNumber(result.csvNomT)}.`}
                {result.csvWallRemain !== null && ` Wall Remain ${formatNumber(result.csvWallRemain)}%.`}
                {result.csvComment && ` Comment "${result.csvComment}".`} The report uses its own comment and wall loss.
              </p>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  )
}
