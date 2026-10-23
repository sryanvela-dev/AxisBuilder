// Pasting a block of cells copied from Excel into a field data table: read the clipboard text,
// guess which pasted column goes into which table column (by header text, or by position like the
// v5.0 sheets), then turn the rows into items. Every cell that can't be used is listed with a reason.

import { LIST_META, type Project } from './schema.ts'
import { TABLE_COLUMNS, columnName, copyId, newItem, nextId, parseCell, setCell, usedIds, type FieldListKey } from './columns.ts'
import { idKey } from './schema.ts'

/** Excel's clipboard text: tab-separated cells, one line per row, quoted cells may hold tabs, line breaks and "". */
export function parseClipboardTable(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let i = 0
  let quoted = false
  const t = text.replace(/\r\n?/g, '\n')
  while (i < t.length) {
    const ch = t[i]
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"'
        i += 2
        continue
      }
      if (ch === '"') {
        quoted = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"' && cell === '') {
      quoted = true
      i++
      continue
    }
    if (ch === '\t') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
    i++
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.:#_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Other header texts people (and the v5.0 sheets) use for a column. */
const ALIASES: Record<string, string[]> = {
  id: ['id', 'name'],
  diameter: ['dia', 'diameter', 'nozzle dia', 'nozzle diameter', 'size'],
  x: ['x', 'x position', 'x pos', 'circ position'],
  y: ['y', 'y position', 'y pos', 'axial position'],
  startY: ['start y', 'start', 'y start'],
  stopY: ['stop y', 'stop', 'end y', 'end', 'y stop'],
  minT: ['min t', 'mint', 'min thk', 'min thickness', 'minimum thickness', 'min t'],
  notes: ['notes', 'note', 'comment', 'comments'],
  include: ['include', 'incl', 'draw'],
  labelMode: ['label mode', 'label position'],
  showLabel: ['label', 'show label', 'include label'],
  circWidth: ['circ width', 'width', 'circumferential width'],
  length: ['length', 'len'],
  head: ['head'],
  clock: ['clock', 'clock position', 'clock pos'],
  radiusPosition: ['radius', 'radius position', 'radius pos'],
  customRadiusPercent: ['custom', 'custom radius', 'custom %', 'custom radius %', 'custom radius percent'],
}

/** The table column a header names, or null. */
export function matchHeader(list: FieldListKey, header: string): string | null {
  const h = norm(header)
  if (h === '') return null
  for (const col of TABLE_COLUMNS[list]) {
    const names = [norm(columnName(list, col.key)), norm(col.key), ...(ALIASES[col.key] ?? [])]
    if (names.includes(h)) return col.key
  }
  // The list's own name column ("Nozzle Name", "Weld ID", "MUT ID", ...)
  if (/\b(id|name)$/.test(h)) return 'id'
  return null
}

export interface PasteMapping {
  /** The first pasted row holds column titles. */
  hasHeader: boolean
  /** Per pasted column: the table column key it goes into, or null to leave it out. */
  columns: (string | null)[]
}

/** Header row when most of the first row's cells name table columns; otherwise columns in table order. */
export function guessMapping(list: FieldListKey, rows: string[][]): PasteMapping {
  const width = Math.max(0, ...rows.map((r) => r.length))
  const first = rows[0] ?? []
  const matched = first.map((h) => matchHeader(list, h))
  const filled = first.filter((h) => h.trim() !== '').length
  const hits = matched.filter((m) => m !== null).length
  if (hits > 0 && hits * 2 >= filled) {
    const seen = new Set<string>()
    const columns = Array.from({ length: width }, (_, i) => {
      const m = matched[i] ?? null
      if (m === null || seen.has(m)) return null
      seen.add(m)
      return m
    })
    return { hasHeader: true, columns }
  }
  const cols = TABLE_COLUMNS[list]
  return { hasHeader: false, columns: Array.from({ length: width }, (_, i) => cols[i]?.key ?? null) }
}

export interface RejectedCell {
  /** Row as pasted, counting from 1 (the header row too, if any). */
  row: number
  column: string
  value: string
  reason: string
}

export interface PasteResult {
  items: Record<string, unknown>[]
  rejected: RejectedCell[]
  /** Things done for you, e.g. a name given to a row without one. */
  notes: string[]
  /** Things to look at after pasting, e.g. a name already used in the job. */
  warnings: string[]
}

/** Turns pasted rows into new items for the list, using the mapping. */
export function buildPastedRows(project: Project, list: FieldListKey, rows: string[][], mapping: PasteMapping): PasteResult {
  const items: Record<string, unknown>[] = []
  const rejected: RejectedCell[] = []
  const notes: string[] = []
  const warnings: string[] = []
  const existing = usedIds(project, list)
  const seen = new Set<string>()
  let work: Project = project
  const meta = LIST_META[list]
  const hasId = mapping.columns.includes('id')
  const hasHead = mapping.columns.includes('head')
  const start = mapping.hasHeader ? 1 : 0
  for (let r = start; r < rows.length; r++) {
    const cells = rows[r]
    const rowNo = r + 1
    const idIndex = mapping.columns.indexOf('id')
    let id = hasId ? (cells[idIndex] ?? '').trim() : ''
    if (id === '') {
      id = nextId(work, list)
      if (hasId) notes.push(`Row ${rowNo} has no ${columnName(list, 'id').toLowerCase()}; it is named ${id}.`)
    } else if (seen.has(idKey(id))) {
      const renamed = copyId(work, list, id)
      warnings.push(`Row ${rowNo}: "${id}" is pasted twice; the second one is named ${renamed}.`)
      id = renamed
    } else if (existing.has(idKey(id))) {
      warnings.push(`Row ${rowNo}: "${id}" is already in the job. Rename one of them after pasting.`)
    }
    seen.add(idKey(id))
    let item = newItem(list, id)
    mapping.columns.forEach((key, c) => {
      if (key === null || key === 'id') return
      const text = cells[c] ?? ''
      const col = TABLE_COLUMNS[list].find((x) => x.key === key)!
      const parsed = parseCell(col.kind, text)
      if (!parsed.ok) {
        rejected.push({ row: rowNo, column: columnName(list, key), value: text.trim(), reason: `${parsed.problem} Left at its default.` })
        return
      }
      if (parsed.value === null && (col.kind === 'yesNo' || col.kind === 'labelMode' || col.kind === 'radius' || col.kind === 'head')) return
      const set = setCell(list, item, key, parsed.value)
      if (!set.ok) {
        rejected.push({ row: rowNo, column: columnName(list, key), value: text.trim(), reason: `${set.problem} Left at its default.` })
        return
      }
      item = set.item
      if (key === 'customRadiusPercent' && typeof parsed.value === 'number' && parsed.value > 0 && parsed.value <= 1) {
        warnings.push(`Row ${rowNo}: custom radius ${parsed.value} is read as ${parsed.value}%. If it is a fraction of the radius (as in the old Excel sheet), enter ${parsed.value * 100} instead.`)
      }
    })
    items.push(item)
    work = { ...work, [list]: [...(work[list] as unknown[]), item] }
  }
  if ((list === 'headNozzles' || list === 'headMut') && !hasHead && items.length > 0) {
    notes.push('No Head column was pasted, so every row is on HEAD 1. Change it in the table if needed.')
  }
  if (!hasId && items.length > 0) notes.push(`No ${meta.fields.id.toLowerCase()} column was chosen, so the rows were given names.`)
  return { items, rejected, notes, warnings }
}
