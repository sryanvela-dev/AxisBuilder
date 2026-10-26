// A field data table (circ welds, nozzles, head MUT, ...): one row per item, columns from
// data/columns.ts. Type to change a cell; Tab or Enter moves on, Enter past the last cell adds a row.
// Problems show under the row: values not stored, checks (errors and warnings) and import notes.

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { applyCheckAction, checksAt, type Check, type CheckAction } from '../data/checks.ts'
import { isMovableList, resetOverride, rowOverride } from '../data/overrides.ts'
import { wrapNote } from '../engine/wrapNotes.ts'
import {
  TABLE_COLUMNS,
  columnName,
  COLUMN_HINTS,
  columnTitle,
  copyId,
  formatCell,
  newItem,
  nextId,
  parseCell,
  setCell,
  type ColumnSpec,
  type TableListKey,
} from '../data/columns.ts'
import { LABEL_MODE_LABELS, RADIUS_LABELS, describeClock } from '../data/parse.ts'
import { HEADS, LABEL_MODES, LIST_META, RADIUS_POSITIONS, type Project } from '../data/schema.ts'
import { draftKey, type Draft, type StepId } from '../state/session.ts'
import { useApp } from './appContext.ts'
import { REPORT_KIND_TEXT, reportNotesFor, useJobChecks } from './checksContext.ts'
import { PasteDialog } from './PasteDialog.tsx'
import { rowElementId } from './placeIds.ts'
import { useSelection } from './selectionContext.ts'
import { useEditBox } from './useEditBox.ts'

type Item = Record<string, unknown>

const itemsOf = (p: Project, list: TableListKey) => p[list] as Item[]
const withItems = (p: Project, list: TableListKey, items: Item[]) => ({ ...p, [list]: items }) as Project

/** A read-only column worked out from the row, e.g. a scan's width (or a MUT row's area, with its buttons). */
export interface DerivedColumn {
  title: string
  value: (item: Item, index: number) => ReactNode
}

export interface DataTableProps {
  list: TableListKey
  step: StepId
  derived?: DerivedColumn[]
  /** Runs after every change to this list, e.g. to keep scan photo links in step with the scans. */
  afterEdit?: (prev: Project, next: Project) => Project
}

export function DataTable({ list, step, derived = [], afterEdit }: DataTableProps) {
  const app = useApp()
  const { checks } = useJobChecks()
  const project = app.state.job!.history.present
  const items = itemsOf(project, list)
  const meta = LIST_META[list]
  const body = useRef<HTMLTableSectionElement>(null)
  /** Row whose first box gets the cursor after the next render (a row just added). */
  const focusRow = useRef<number | null>(null)
  const [paste, setPaste] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const hasAdvanced = TABLE_COLUMNS[list].some((c) => c.advanced)
  // Advanced columns (Don't wrap, Across the seam) only while "Show advanced columns" is ticked.
  const cols = TABLE_COLUMNS[list].filter((c) => showAdvanced || !c.advanced)
  const listChecks = checks.filter((c) => c.place.kind === 'list' && c.place.list === list)

  useEffect(() => {
    if (focusRow.current === null) return
    body.current?.querySelector<HTMLElement>(`tr[data-row="${focusRow.current}"] [data-cell]`)?.focus()
    focusRow.current = null
  })

  /** A change to the rows themselves (add, delete, move): typed-but-invalid values of this list are dropped. */
  function editRows(label: string, update: (rows: Item[], p: Project) => Item[]) {
    app.edit(label, (p) => {
      const next = withItems(p, list, update(itemsOf(p, list), p))
      return afterEdit ? afterEdit(p, next) : next
    })
    app.dispatch({ type: 'clearDrafts', prefix: `${list}.` })
  }

  function addRow() {
    const last = items[items.length - 1] as { head?: 'HEAD 1' | 'HEAD 2' } | undefined
    const id = nextId(project, list)
    editRows(`Add ${id} to ${meta.name}`, (rows) => [...rows, newItem(list, id, last?.head ?? 'HEAD 1')])
    focusRow.current = items.length
  }

  function onKeyDown(e: KeyboardEvent<HTMLTableSectionElement>) {
    if (e.key !== 'Enter' || !(e.target as HTMLElement).matches('[data-cell]')) return
    e.preventDefault()
    const cells = [...(body.current?.querySelectorAll<HTMLElement>('[data-cell]:not(:disabled)') ?? [])]
    const i = cells.indexOf(e.target as HTMLElement)
    const next = cells[e.shiftKey ? i - 1 : i + 1]
    if (next) {
      next.focus()
      if (next instanceof HTMLInputElement && next.type === 'text') next.select()
    } else if (!e.shiftKey) addRow()
  }

  return (
    <div className="data-table">
      {listChecks.map((c) => (
        <p key={c.text} className={`msg msg-${c.severity} list-msg`}>
          {c.text} {c.fix}
        </p>
      ))}
      {items.length === 0 ? (
        <p className="muted">No {meta.name.toLowerCase()} yet. Add a row, or paste rows copied from Excel.</p>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th className="num" aria-label="Row">#</th>
                {cols.map((c) => (
                  <th key={c.key} className={`col-${c.kind}`} title={COLUMN_HINTS[list]?.[c.key]}>
                    {columnTitle(list, c)}
                  </th>
                ))}
                {derived.map((d) => (
                  <th key={d.title} className="col-derived">
                    {d.title}
                  </th>
                ))}
                <th aria-label="Row actions" />
              </tr>
            </thead>
            <tbody
              ref={body}
              onKeyDown={onKeyDown}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text/plain')
                if (/[\t\n]/.test(text.trim())) {
                  e.preventDefault()
                  setPaste(text)
                }
              }}
            >
              {items.map((item, index) => (
                <Row
                  key={index}
                  list={list}
                  index={index}
                  item={item}
                  count={items.length}
                  cols={cols}
                  step={step}
                  derived={derived}
                  afterEdit={afterEdit}
                  onMove={(dir) =>
                    editRows(`Move ${String(item.id)} ${dir < 0 ? 'up' : 'down'}`, (rows) => {
                      const out = [...rows]
                      ;[out[index], out[index + dir]] = [out[index + dir], out[index]]
                      return out
                    })
                  }
                  onDuplicate={() =>
                    editRows(`Duplicate ${String(item.id)}`, (rows, p) => {
                      const out = [...rows]
                      out.splice(index + 1, 0, { ...item, id: copyId(p, list, String(item.id)) })
                      return out
                    })
                  }
                  onDelete={() => editRows(`Delete ${String(item.id)} from ${meta.name}`, (rows) => rows.filter((_, i) => i !== index))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="button-row">
        <button type="button" className="btn" onClick={addRow}>
          Add row
        </button>
        <button type="button" className="btn" onClick={() => setPaste('')}>
          Paste from Excel...
        </button>
        {hasAdvanced && (
          <label className="switch">
            <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} />
            Show advanced columns
          </label>
        )}
        {items.length > 0 && <span className="muted">Enter moves to the next box; Enter in the last box adds a row.</span>}
      </div>
      {paste !== null && <PasteDialog list={list} initialText={paste} onClose={() => setPaste(null)} />}
    </div>
  )
}

function Row(props: {
  list: TableListKey
  index: number
  item: Item
  count: number
  cols: ColumnSpec[]
  step: StepId
  derived: DerivedColumn[]
  afterEdit?: (prev: Project, next: Project) => Project
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { list, index, item, step } = props
  const app = useApp()
  const { checks, workbookImport } = useJobChecks()
  const rowChecks = checksAt(checks, list, index)
  const prefix = `${draftKey(list, index)}.`
  const drafts = Object.entries(app.state.job!.drafts).filter(([k]) => k.startsWith(prefix))
  const notes = reportNotesFor(workbookImport, step, { kind: 'row', list, id: String(item.id) })
  const id = String(item.id)
  const project = app.state.job!.history.present
  const wrap = wrapNote(project, list, index)
  const across = list === 'scans' && item.acrossSeam === true && !item.noWrap
  const hasMessages = rowChecks.length + drafts.length + notes.length > 0 || wrap !== null || across
  const { selected, select } = useSelection()
  const isSelected = selected?.list === list && selected.index === index
  const cols = props.cols
  const fix = (a: CheckAction) => {
    app.edit(`${a.label} (${id})`, (p) => {
      const next = applyCheckAction(p, a)
      return props.afterEdit ? props.afterEdit(p, next) : next
    })
    app.dispatch({ type: 'clearDrafts', prefix })
  }
  return (
    <>
      <tr
        data-row={index}
        id={rowElementId(list, index)}
        className={[hasMessages ? 'has-messages' : '', isSelected ? 'row-selected' : ''].filter(Boolean).join(' ') || undefined}
        onFocus={() => !isSelected && select({ list, index })}
      >
        <td className="num row-no">
          {index + 1}
          {isMovableList(list) && rowOverride(project, list, index) && (
            <button
              type="button"
              className="moved-chip moved-reset"
              title="Its label was moved by hand in the drawing preview. Click to place it automatically again."
              aria-label={`Reset position of the ${id} label (moved by hand)`}
              onClick={() => app.edit(`Reset position of ${id}`, (p) => (isMovableList(list) ? resetOverride(p, list, index) : p))}
            >
              Moved ↺
            </button>
          )}
        </td>
        {cols.map((col) => (
          <td key={col.key} className={`col-${col.kind}`} data-field={col.key}>
            <Cell list={list} index={index} item={item} col={col} step={step} afterEdit={props.afterEdit} checks={rowChecks.filter((c) => c.place.kind === 'row' && c.place.field === col.key)} />
          </td>
        ))}
        {props.derived.map((d) => (
          <td key={d.title} className="num col-derived">
            {d.value(item, index)}
          </td>
        ))}
        <td className="row-actions">
          <button type="button" className="icon-btn" onClick={() => props.onMove(-1)} disabled={index === 0} aria-label={`Move ${id} up`} title="Move up">
            ↑
          </button>
          <button type="button" className="icon-btn" onClick={() => props.onMove(1)} disabled={index === props.count - 1} aria-label={`Move ${id} down`} title="Move down">
            ↓
          </button>
          <button type="button" className="icon-btn" onClick={props.onDuplicate} aria-label={`Duplicate ${id}`} title="Duplicate">
            ⧉
          </button>
          <button type="button" className="icon-btn icon-danger" onClick={props.onDelete} aria-label={`Delete ${id}`} title="Delete (Ctrl+Z brings it back)">
            ✕
          </button>
        </td>
      </tr>
      {hasMessages && (
        <tr className="row-messages">
          <td />
          <td colSpan={cols.length + props.derived.length + 1}>
            {drafts.map(([k, d]: [string, Draft]) => (
              <p key={k} className="msg msg-error">
                {columnName(list, k.slice(prefix.length))}: "{d.text}" is not stored. {d.problem}
              </p>
            ))}
            {rowChecks.map((c) => (
              <p key={c.text} className={`msg msg-${c.severity}`}>
                {c.text} {c.fix}
                {c.actions?.map((a) => (
                  <button key={a.label} type="button" className="btn btn-small msg-action" onClick={() => fix(a)}>
                    {a.label}
                  </button>
                ))}
              </p>
            ))}
            {wrap && (
              <p className="msg msg-note">
                {wrap.text}
                {wrap.actions?.map((a) => (
                  <button key={a.label} type="button" className="btn btn-small msg-action" onClick={() => fix(a)}>
                    {a.label}
                  </button>
                ))}
              </p>
            )}
            {across && (
              <p className="msg msg-note">
                Marked as running across the seam (X start {String(item.xStart)} on past X = 0 to {String(item.xStop)}).
                <button type="button" className="btn btn-small msg-action" onClick={() => fix({ label: 'Not across the seam', list, index, changes: { acrossSeam: false } })}>
                  Not across the seam
                </button>
              </p>
            )}
            {notes.map((e) => (
              <p key={`${e.cell}${e.message}`} className="msg msg-report">
                From Excel ({e.sheet} {e.cell}): {REPORT_KIND_TEXT[e.kind]}. {e.message}
              </p>
            ))}
          </td>
        </tr>
      )}
    </>
  )
}

function Cell(props: {
  list: TableListKey
  index: number
  item: Item
  col: ColumnSpec
  step: StepId
  checks: Check[]
  afterEdit?: (prev: Project, next: Project) => Project
}) {
  const { list, index, item, col } = props
  const app = useApp()
  const value = item[col.key]
  const name = columnName(list, col.key)
  const label = `${name}, row ${index + 1}`
  const bad = props.checks.some((c) => c.severity === 'error')
  const warn = props.checks.some((c) => c.severity === 'warning')

  const store = (v: unknown, group?: string): string | null => {
    const set = setCell(list, item, col.key, v)
    if (!set.ok) return set.problem
    app.edit(
      `Change ${name} of ${String(item.id)}`,
      (p) => {
        const next = withItems(p, list, itemsOf(p, list).map((it, i) => (i === index ? set.item : it)))
        return props.afterEdit ? props.afterEdit(p, next) : next
      },
      group,
    )
    return null
  }

  if (col.kind === 'yesNo') {
    return <input type="checkbox" data-cell checked={value === true} onChange={(e) => store(e.target.checked)} aria-label={label} />
  }
  if (col.kind === 'labelMode' || col.kind === 'radius' || col.kind === 'head') {
    const options: readonly string[] = col.kind === 'labelMode' ? LABEL_MODES : col.kind === 'radius' ? RADIUS_POSITIONS : HEADS
    const text = (o: string) => (col.kind === 'labelMode' ? LABEL_MODE_LABELS[o as keyof typeof LABEL_MODE_LABELS] : col.kind === 'radius' ? RADIUS_LABELS[o as keyof typeof RADIUS_LABELS] : o)
    return (
      <select data-cell value={value === null ? '' : String(value)} onChange={(e) => store(e.target.value)} aria-label={label} aria-invalid={bad || undefined}>
        {value === null && <option value="">Choose...</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {text(o)}
          </option>
        ))}
      </select>
    )
  }
  if (col.kind === 'percent' && item.radiusPosition !== 'CUSTOM') {
    return (
      <span className="muted not-used" title="Only used when the radius position is Custom %">
        –
      </span>
    )
  }
  return <TextCell {...props} store={store} label={label} bad={bad} warn={warn} />
}

function TextCell(props: {
  list: TableListKey
  index: number
  item: Item
  col: ColumnSpec
  step: StepId
  store: (v: unknown, group?: string) => string | null
  label: string
  bad: boolean
  warn: boolean
}) {
  const { list, index, item, col } = props
  const key = draftKey(list, index, col.key)
  const value = item[col.key]
  const box = useEditBox<unknown>({
    value,
    format: (v) => formatCell(col.kind, v),
    parse: (t) => parseCell(col.kind, t),
    commit: (v) => props.store(v, key),
    boxKey: key,
    step: props.step,
    where: `${LIST_META[list].name}, row ${index + 1} (${String(item.id)}), ${columnName(list, col.key)}`,
  })
  const note = box.note ?? (col.kind === 'clock' && typeof value === 'string' && !box.problem ? describeClock(value) : null)
  return (
    <>
      <input
        type="text"
        data-cell
        className={box.problem || props.bad ? 'cell-bad' : props.warn ? 'cell-warn' : undefined}
        value={box.text}
        onChange={(e) => box.onChange(e.target.value)}
        onBlur={box.onBlur}
        aria-label={props.label}
        aria-invalid={box.problem || props.bad ? true : undefined}
        inputMode={col.kind === 'length' || col.kind === 'thickness' || col.kind === 'percent' ? 'decimal' : undefined}
        autoComplete="off"
        spellCheck={col.kind === 'text'}
      />
      {note && <span className="cell-note">{note}</span>}
    </>
  )
}
