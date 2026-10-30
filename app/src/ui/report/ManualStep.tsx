// Report step 4, Manual UT (design 4.4): one table of UTT and MUT scan readings. Linked rows are the drawing's shell and
// head MUT rows (ID from the drawing; Min 'T' is the drawing row's own, so editing it here changes the drawing too);
// report rows are readings of your own, such as nozzles ("Add nozzle readings") or pasted from Excel. Each row has a
// nominal mode (its component, a pipe wall suggested from the B36.10M / B36.19M table, or custom), N/A with a reason,
// wall loss and the built comment, with the same comment picks as AUT results.

import { Fragment, useMemo, useState } from 'react'
import { formatNumber } from '../../data/parse.ts'
import { jobLadder, pipeWallsFor, readingRows, type ReadingRow } from '../../report/calc/results.ts'
import { NPS_SIZES, wallLabel } from '../../report/calc/pipeWalls.ts'
import { addReportReading, moveReading, removeReading, setReading, setReadingMinT } from '../../report/edits.ts'
import { linkedRow, readingComponent } from '../../report/report.ts'
import { NOMINAL_MODES, READING_TYPES, type NominalMode, type Reading } from '../../report/schema.ts'
import { useApp } from '../appContext.ts'
import { Flag, ReportBox, ReportSelect, RowMessages, type Message } from './boxes.tsx'
import { CommentPicks, CommentText, PicksForAll, WallLoss } from './CommentPicks.tsx'
import { NozzleReadingsDialog, ReadingPasteDialog } from './ManualDialogs.tsx'
import { reportPlaceId } from './places.ts'
import { ReportStepIssues, type ReportStepProps } from './ReportWorkspace.tsx'
import { SavedListsButton } from './SavedListsUi.tsx'

const STEP = 'manual' as const
const fmt = (v: number | null) => (v === null ? '–' : formatNumber(v))
const MODE_LABEL: Record<NominalMode, string> = { component: 'Component', pipe: 'Pipe', custom: 'Custom' }

export function ManualStep({ status }: ReportStepProps) {
  const app = useApp()
  const p = app.state.job!.history.present
  const report = p.report!
  const ladder = jobLadder(report)
  const rows = useMemo(() => readingRows(p, report, ladder), [p, report, ladder])
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [dialog, setDialog] = useState<'nozzles' | 'paste' | null>(null)
  const clear = () => {
    app.dispatch({ type: 'clearDrafts', prefix: 'report.reading.' })
    setOpen(new Set())
  }
  const messagesOf = (i: number): Message[] =>
    status.issues.filter((x) => x.check?.place.kind === 'reading' && x.check.place.index === i)
      .map((x) => ({ text: `${x.text} ${x.fix ?? ''}`.trim(), severity: x.blocksExport ? 'error' : 'warning' }))
  return (
    <>
      <ReportStepIssues status={status} />
      <div className="button-row">
        <button type="button" className="btn" onClick={() => app.edit('Add a reading', (q) => addReportReading(q))}>
          Add reading
        </button>
        <button type="button" className="btn" onClick={() => setDialog('nozzles')}>
          Add nozzle readings...
        </button>
        <button type="button" className="btn" onClick={() => setDialog('paste')}>
          Paste from Excel
        </button>
        <SavedListsButton />
      </div>
      {rows.length > 0 && <PicksForAll ladder={ladder} />}
      {rows.length === 0 ? (
        <p className="muted">No readings yet. MUT rows on the drawing's Field data step appear here by themselves; add your own readings above.</p>
      ) : (
        <div className="table-wrap">
          <table className="grid readings-table">
            <thead>
              <tr>
                <th className="num" aria-label="Row">#</th>
                <th>Name</th>
                <th>Location</th>
                <th>Component</th>
                <th>Type</th>
                <th>Min 'T' (in)</th>
                <th>Nominal</th>
                <th>Wall loss</th>
                <th>Comment</th>
                <th><span className="visually-hidden">Details, order and delete</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ReadingTableRow key={row.index} row={row} count={rows.length} open={open.has(row.index)} messages={messagesOf(row.index)} ladder={ladder}
                  onToggle={() => setOpen((s) => {
                    const n = new Set(s)
                    if (n.has(row.index)) n.delete(row.index)
                    else n.add(row.index)
                    return n
                  })}
                  onMove={(by) => {
                    app.edit('Move a reading', (q) => moveReading(q, row.index, by))
                    clear()
                  }}
                  onDelete={() => {
                    app.edit(`Delete reading ${row.name || row.index + 1}`, (q) => removeReading(q, row.index))
                    clear()
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog === 'nozzles' && <NozzleReadingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'paste' && <ReadingPasteDialog onClose={() => setDialog(null)} />}
    </>
  )
}

function ReadingTableRow(props: {
  row: ReadingRow
  count: number
  open: boolean
  messages: Message[]
  ladder: ReturnType<typeof jobLadder>
  onToggle: () => void
  onMove: (by: -1 | 1) => void
  onDelete: () => void
}) {
  const app = useApp()
  const p = app.state.job!.history.present
  const report = p.report!
  const { row } = props
  const r = row.reading
  const i = row.index
  const key = `report.reading.${i}`
  const label = [row.name || `Row ${i + 1}`, r.location.trim()].filter(Boolean).join(' ')
  const w = (f: string) => `Manual UT, ${label}, ${f}`
  const set = (change: Partial<Omit<Reading, 'link'>>) => (q: typeof p) => setReading(q, i, change)
  const drawing = linkedRow(p, r)
  const mutScan = r.type === 'MUT scan'
  const severity = row.band === null ? null : props.ladder.severity[Math.min(row.band, props.ladder.severity.length - 1)].id
  const walls = pipeWallsFor(r.pipeSize)
  const drawnArea = r.link !== null && drawing?.area && drawing.area.length >= 3
  const cols = 10
  return (
    <Fragment>
      <tr id={reportPlaceId({ kind: 'reading', index: i })} className={props.messages.length ? 'has-messages' : undefined}>
        <td className="num row-no">{i + 1}</td>
        <td>
          {r.link ? (
            <span>
              <strong>{row.name}</strong> <Flag kind="other" title="A MUT row of the drawing: its ID, position, Min 'T' and area are the drawing's">drawing</Flag>
            </span>
          ) : (
            <ReportBox compact label="Name" where={w('name')} value={r.name} placeholder={r.nozzle?.id ?? 'e.g. Nozzle 3'}
              set={(q, v: string) => set({ name: v })(q)} boxKey={`${key}.name`} step={STEP}
              tag={r.nozzle ? <Flag kind="other" title={`Linked to nozzle ${r.nozzle.id}`}>nozzle</Flag> : undefined} />
          )}
        </td>
        <td>
          <ReportBox compact label="Location" where={w('location')} value={r.location} list="readingLocation" set={(q, v: string) => set({ location: v })(q)} boxKey={`${key}.location`} step={STEP} />
        </td>
        <td>
          {report.components.length > 1 ? (
            <ReportSelect compact label="Component" where={w('component')} value={r.componentId ?? ''}
              options={[{ value: '', label: `Automatic (${readingComponent(p, report, { ...r, componentId: null })?.name ?? 'none'})` }, ...report.components.map((c) => ({ value: c.id, label: c.name }))]}
              set={(q, v: string) => set({ componentId: v === '' ? null : v })(q)} boxKey={`${key}.componentId`} step={STEP} />
          ) : (
            row.component?.name ?? <span className="muted">none</span>
          )}
        </td>
        <td>
          <div className="type-cell">
            <ReportSelect compact label="Type" where={w('type')} value={r.type} options={READING_TYPES.map((t) => ({ value: t, label: t }))}
              set={(q, v: Reading['type']) => set({ type: v })(q)} boxKey={`${key}.type`} step={STEP} />
            {/* A MUT scan's area beside its type: the drawn area, or typed in. Avg / Max 'T' are in Details. */}
            {mutScan && (drawnArea ? (
              <span className="type-area" title="The MUT area drawn in the preview">
                {fmt(row.area === null ? null : Math.round(row.area * 10) / 10)} sq in
              </span>
            ) : (
              <ReportBox compact label="Area" where={w('area')} kind="reading" value={r.area} units="sq in" placeholder="area"
                set={(q, v: number | null) => set({ area: v })(q)} boxKey={`${key}.area`} step={STEP} />
            ))}
          </div>
        </td>
        <td>
          <ReportBox compact label="Min 'T'" where={w("Min 'T'")} kind="reading" value={r.link ? (drawing?.minT ?? null) : r.minT}
            help={r.link ? "The drawing MUT row's Min 'T': changing it here changes the drawing too." : undefined}
            set={(q, v: number | null) => setReadingMinT(q, i, v)} boxKey={`${key}.minT`} step={STEP} />
        </td>
        <td>
          <div className="nominal-cell">
          <ReportSelect compact label="Nominal from" where={w('nominal from')} value={r.nominalMode} options={NOMINAL_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
            set={(q, v: NominalMode) => set({ nominalMode: v, nominal: null })(q)} boxKey={`${key}.nominalMode`} step={STEP} />
          {r.nominalMode === 'component' && <span className="col-derived">{fmt(row.nominal)}</span>}
          {r.nominalMode === 'custom' && (
            <ReportBox compact label="Nominal" where={w('nominal')} kind="thickness" value={r.nominal} set={(q, v: number | null) => set({ nominal: v })(q)} boxKey={`${key}.nominal`} step={STEP} />
          )}
          {r.nominalMode === 'pipe' && (
            <>
              <ReportSelect compact label="Pipe size (NPS)" where={w('pipe size')} value={r.pipeSize ?? ''}
                options={[{ value: '', label: 'NPS...' }, ...NPS_SIZES.map((n) => ({ value: n, label: `NPS ${n}` }))]}
                set={(q, v: string) => set({ pipeSize: v === '' ? null : v, nominal: null })(q)} boxKey={`${key}.pipeSize`} step={STEP} />
              {r.pipeSize !== null && (
                <ReportSelect compact label="Wall" where={w('wall')} value={r.nominal === null ? '' : String(r.nominal)}
                  options={[
                    { value: '', label: row.pipePick ? `Suggested: ${wallLabel(row.pipePick.wall)}` : 'Suggested (needs a reading)' },
                    ...walls.map((x) => ({ value: String(x.wall), label: wallLabel(x) })),
                  ]}
                  set={(q, v: string) => set({ nominal: v === '' ? null : Number(v) })(q)} boxKey={`${key}.wall`} step={STEP}
                  tag={row.pipeOverridden ? <Flag title="Chosen by hand instead of the suggestion">by hand</Flag>
                    : row.pipePick?.flagged ? <Flag title="The thickest reading is more than 15% over this wall: check the size or the readings">check</Flag> : undefined} />
              )}
            </>
          )}
          </div>
        </td>
        <td className="num">{row.na !== null ? <span className="muted">N/A</span> : <WallLoss value={row.wallLoss} color={row.color} />}</td>
        <td className="col-comment">{row.na !== null ? <span className="muted">{row.na}</span> : <CommentText comment={row.comment} />}</td>
        <td className="row-actions">
          <button type="button" className="btn btn-small" aria-expanded={props.open} onClick={props.onToggle} title={mutScan ? "N/A reason, Avg / Max 'T' and comment picks" : 'N/A reason and comment picks'}>
            {props.open ? 'Close' : 'Details'}
          </button>
          <button type="button" className="icon-btn" onClick={() => props.onMove(-1)} disabled={i === 0} aria-label={`Move ${label} up`} title="Move up">↑</button>
          <button type="button" className="icon-btn" onClick={() => props.onMove(1)} disabled={i === props.count - 1} aria-label={`Move ${label} down`} title="Move down">↓</button>
          <button type="button" className="icon-btn icon-danger" onClick={props.onDelete} disabled={r.link !== null} aria-label={`Delete ${label}`}
            title={r.link ? 'A MUT row of the drawing: delete it on the Field data step' : 'Delete (Ctrl+Z brings it back)'}>×</button>
        </td>
      </tr>
      <RowMessages messages={props.messages} colSpan={cols} />
      {props.open && (
        <tr className="row-details">
          <td colSpan={cols}>
            <div className="field-grid">
              <ReportBox label="Not measured (N/A)" where={w('N/A reason')} kind="optText" value={r.na} list="naReason" placeholder="measured"
                set={(q, v: string | null) => set({ na: v })(q)} boxKey={`${key}.na`} step={STEP}
                help="Blank = measured. A reason (e.g. U-Bolt Obstruction) is printed instead of the figures and the row is left out of them." />
              {mutScan && (
                <>
                  <ReportBox label="Avg 'T'" where={w("Avg 'T'")} kind="reading" units="in" value={r.avgT} set={(q, v: number | null) => set({ avgT: v })(q)}
                    boxKey={`${key}.avgT`} step={STEP} help="MUT scans only; rarely needed." />
                  <ReportBox label="Max 'T'" where={w("Max 'T'")} kind="reading" units="in" value={r.maxT} set={(q, v: number | null) => set({ maxT: v })(q)}
                    boxKey={`${key}.maxT`} step={STEP} help="MUT scans only; rarely needed." />
                </>
              )}
            </div>
            <CommentPicks ladder={props.ladder} picks={r} comment={row.comment} ladderSeverity={severity} name={label} step={STEP} boxKey={key}
              set={(q, change) => setReading(q, i, change)} />
            {drawing && drawing.notes && <p className="muted">Notes on the drawing row: {drawing.notes}</p>}
          </td>
        </tr>
      )}
    </Fragment>
  )
}

