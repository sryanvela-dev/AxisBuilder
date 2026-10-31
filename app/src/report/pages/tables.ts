// Scan Sheet and Manual UT (design 6.7, 6.8): the template's columns, one row per scan in the report or per manual
// reading, wall loss in its ladder colour, totals at the end; with more than one component the scan rows are grouped
// with a subtotal per component. The header repeats on every page, rows never split.

import { readingRows, readingTotals, reportCoverage, scanRows, totalsOf, type ReadingRow, type ScanRow } from '../calc/results.ts'
import { circumference, scanXRange } from '../../engine/wrap.ts'
import type { Bookmark } from '../pageModel.ts'
import type { ColumnRef } from '../templates/types.ts'
import { content, standardPage, type BuildContext, type PageBuilder } from './common.ts'
import { COLORS, ladderInk } from './layout.ts'
import { layoutTable, splitRows, tableItems, type TableCell, type TableColumn, type TableRow } from './table.ts'
import { inch, pct, scanNumber, thousands, trimNum } from './values.ts'

/** A number as a column prints it. */
export function formatCell(col: ColumnRef, v: number | null): string {
  if (v === null) return ''
  const d = col.decimals ?? 0
  const n = col.trim ? trimNum(v, d) : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  return col.unit === 'in' ? `${n}"` : col.unit === '%' ? `${n}%` : n
}

const toColumns = (cols: readonly ColumnRef[]): TableColumn[] => cols.map((c) => ({ header: c.header, group: c.group, align: c.key === 'comment' ? 'left' : 'center', wrap: c.key === 'comment' }))

// --- Scan sheet ------------------------------------------------------------------------------

function scanValue(c: BuildContext, row: ScanRow, key: string): number | string | null {
  const s = row.scan
  const C = circumference(c.p)
  switch (key) {
    case 'location': return [row.component?.name, row.result?.location].filter((x) => x && x.trim()).join(' – ')
    case 'scan': return scanNumber(s.id)
    case 'xStart': case 'xStop': {
      if (s.xStart === null || s.xStop === null) return null
      // Across the seam: as scanned (X start past X stop); otherwise the smaller first, as the drawing draws it.
      const across = scanXRange(s, C).b !== s.xStop
      const [a, b] = across ? [s.xStart, s.xStop] : [Math.min(s.xStart, s.xStop), Math.max(s.xStart, s.xStop)]
      return key === 'xStart' ? a : b
    }
    case 'yStart': return s.yStart === null || s.yStop === null ? null : Math.min(s.yStart, s.yStop)
    case 'yStop': return s.yStart === null || s.yStop === null ? null : Math.max(s.yStart, s.yStop)
    case 'incrX': return row.result?.incrX ?? c.r.calibration.increments.x
    case 'incrY': return row.result?.incrY ?? c.r.calibration.increments.y
    case 'readings': return row.readings
    case 'area': return row.area
    case 'minT': return row.minT
    case 'avgT': return row.avgT
    case 'wallLoss': return row.wallLoss
    case 'nominal': return row.nominal
    case 'comment': return row.comment?.text ?? ''
    default: return null
  }
}

function scanCells(c: BuildContext, cols: readonly ColumnRef[], row: ScanRow): TableCell[] {
  return cols.map((col) => {
    const v = scanValue(c, row, col.key)
    const t = typeof v === 'string' ? v : formatCell(col, v)
    return col.key === 'wallLoss' ? { text: t, color: ladderInk(row.color) } : { text: t }
  })
}

function totalCells(cols: readonly ColumnRef[], rows: readonly ScanRow[], label: string, kind: 'total' | 'subtotal'): TableRow {
  const t = totalsOf(rows)
  const area = rows.reduce((a, r) => a + (r.area ?? 0), 0)
  const firstNum = cols.findIndex((c) => c.key === 'readings')
  const span = firstNum > 0 ? firstNum : 1
  const cells: TableCell[] = [{ text: label, span, align: 'left' }]
  for (const col of cols.slice(span)) {
    if (col.key === 'readings') cells.push({ text: formatCell(col, t.readings) })
    else if (col.key === 'area') cells.push({ text: formatCell(col, area) })
    else if (col.key === 'minT') cells.push({ text: formatCell(col, t.min?.value ?? null), color: ladderInk(t.wallLoss?.color ?? null) })
    else if (col.key === 'avgT') cells.push({ text: formatCell(col, t.average) })
    else if (col.key === 'wallLoss') cells.push({ text: formatCell(col, t.wallLoss?.value ?? null), color: ladderInk(t.wallLoss?.color ?? null) })
    else cells.push({ text: '' })
  }
  return { cells, kind }
}

/** Table rows of the scan sheet: by component with subtotals when there is more than one, then the totals. */
export function scanSheetRows(c: BuildContext): TableRow[] {
  const cols = c.t.scanColumns
  const rows = scanRows(c.p, c.r)
  const comps = [...new Set(rows.map((r) => r.component?.id ?? ''))]
  const out: TableRow[] = []
  const plural = (n: number) => `${n} scan${n === 1 ? '' : 's'}`
  if (comps.length > 1) {
    for (const id of comps) {
      const own = rows.filter((r) => (r.component?.id ?? '') === id)
      own.forEach((r) => out.push({ cells: scanCells(c, cols, r), kind: 'data' }))
      out.push(totalCells(cols, own, `${own[0].component?.name ?? 'No component'} (${plural(own.length)})`, 'subtotal'))
    }
  } else rows.forEach((r) => out.push({ cells: scanCells(c, cols, r), kind: 'data' }))
  if (rows.length) out.push(totalCells(cols, rows, `Totals (${plural(rows.length)})`, 'total'))
  return out
}

function coverageLine(c: BuildContext): string {
  const cov = reportCoverage(c.p)
  if (!cov) return ''
  const parts = [`Component ${thousands(cov.componentArea)} sq in`, `AUT area ${thousands(cov.autArea)} sq in`, `AUT coverage ${pct(cov.autPercent)}`]
  if (cov.mutArea > 0) parts.push(`MUT coverage ${pct(cov.mutPercent)}`, `Combined ${pct(cov.combinedPercent)}`)
  return parts.join(' · ')
}

// --- Manual UT -------------------------------------------------------------------------------

function readingCells(cols: readonly ColumnRef[], row: ReadingRow): TableCell[] {
  const cells: TableCell[] = []
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i]
    if (row.na !== null && col.key === 'minT') {
      // N/A: the reason across the thickness columns up to the wall loss.
      let j = i
      while (j + 1 < cols.length && ['avgT', 'maxT', 'area', 'nominal', 'wallLoss'].includes(cols[j + 1].key)) j++
      cells.push({ text: `N/A – ${row.na}`, span: j - i + 1, color: COLORS.muted })
      i = j
      continue
    }
    switch (col.key) {
      case 'name': cells.push({ text: row.name }); break
      case 'location': cells.push({ text: row.reading.location }); break
      case 'type': cells.push({ text: row.reading.type }); break
      case 'minT': cells.push({ text: formatCell(col, row.minT) }); break
      case 'avgT': cells.push({ text: row.reading.type === 'MUT scan' ? formatCell(col, row.avgT) : '' }); break
      case 'maxT': cells.push({ text: row.reading.type === 'MUT scan' ? formatCell(col, row.maxT) : '' }); break
      case 'area': cells.push({ text: row.reading.type === 'MUT scan' ? formatCell(col, row.area) : '' }); break
      case 'nominal': cells.push({ text: formatCell(col, row.nominal) }); break
      case 'wallLoss':
        cells.push(row.wallLoss !== null && row.wallLoss < 0 ? { text: `No wall loss (${(-row.wallLoss).toFixed(1)}% above nominal)` } : { text: formatCell(col, row.wallLoss), color: ladderInk(row.color) })
        break
      case 'comment': cells.push({ text: row.na !== null ? '' : (row.comment?.text ?? '') }); break
      default: cells.push({ text: '' })
    }
  }
  return cells
}

export function manualRows(c: BuildContext): { cols: ColumnRef[]; rows: TableRow[] } {
  const all = readingRows(c.p, c.r)
  const anyScan = all.some((r) => r.reading.type === 'MUT scan')
  const cols = c.t.readingColumns.filter((col) => !col.optional || anyScan)
  const rows: TableRow[] = all.map((r) => ({ cells: readingCells(cols, r), kind: 'data' }))
  const t = readingTotals(all)
  if (all.length) {
    const label = `${t.readings} reading${t.readings === 1 ? '' : 's'}${t.min ? ` · minimum ${inch(t.min.value)} (${t.min.name})` : ''}`
    rows.push({ cells: [{ text: label, span: cols.length, align: 'left' }], kind: 'total' })
  }
  return { cols, rows }
}

// --- Builder ---------------------------------------------------------------------------------

export const buildTable: PageBuilder = (c, def, title) => {
  const area = content()
  const readings = def.options?.table === 'readings'
  const { cols, rows } = readings ? manualRows(c) : { cols: [...c.t.scanColumns], rows: scanSheetRows(c) }
  const subtitle = readings ? '' : coverageLine(c)
  const columns = toColumns(cols)
  const layout = layoutTable(columns, rows, area.w)
  const pages = splitRows(layout, rows, area.h, area.h).map(([from, to], n) =>
    standardPage(c, def, n ? `${title} ${n + 1}` : title, title, n ? `${subtitle ? `${subtitle} · ` : ''}continued` : subtitle, tableItems(columns, rows, layout, area.x, area.y, from, to)),
  )
  if (rows.length === 0) c.notes.push(`${title}: nothing to list yet.`)
  const bookmarks: Bookmark[] = []
  return { pages, bookmarks }
}
