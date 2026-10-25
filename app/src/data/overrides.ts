// Labels moved by hand in the drawing preview (Phase 5b, project file format 5). An override is keyed by its item's
// list, ID and occurrence (which of the rows with that ID: nozzle names may repeat), never by its row number, so
// sorting and inserted rows don't lose it. syncLabelOverrides runs after every edit (state/session.ts) and follows the
// row itself through renames, sorting and deletes.

import { MOVABLE_LABEL_LISTS, idKey, type LabelOverride, type MovableLabelList, type Project } from './schema.ts'

export function isMovableList(list: string): list is MovableLabelList {
  return (MOVABLE_LABEL_LISTS as readonly string[]).includes(list)
}

type Rows = readonly { id: string }[]

/** Which of the rows with its ID a row is (0 = the first). */
export function occurrenceOf(rows: Rows, index: number): number {
  const k = idKey(rows[index]?.id ?? '')
  let n = 0
  for (let i = 0; i < index; i++) if (idKey(rows[i].id) === k) n++
  return n
}

/** The row with this ID and occurrence, or -1. */
export function rowOf(rows: Rows, id: string, occurrence: number): number {
  const k = idKey(id)
  let n = 0
  for (let i = 0; i < rows.length; i++) {
    if (idKey(rows[i].id) !== k) continue
    if (n === occurrence) return i
    n++
  }
  return -1
}

const same = (o: LabelOverride, list: MovableLabelList, id: string, occurrence: number) =>
  o.list === list && idKey(o.id) === idKey(id) && o.occurrence === occurrence

/** The override that applies to a row, or undefined. */
export function rowOverride(p: Project, list: MovableLabelList, index: number): LabelOverride | undefined {
  const rows: Rows = p[list]
  const item = rows[index]
  if (!item) return undefined
  const occ = occurrenceOf(rows, index)
  return p.labelOverrides.find((o) => same(o, list, item.id, occ))
}

/** Sets (or, with label and tip both automatic, removes) a row's override. */
export function setOverride(p: Project, list: MovableLabelList, index: number, change: Partial<Pick<LabelOverride, 'label' | 'tip'>>): Project {
  const rows: Rows = p[list]
  const item = rows[index]
  if (!item) return p
  const occurrence = occurrenceOf(rows, index)
  const old = rowOverride(p, list, index)
  const next: LabelOverride = { list, id: item.id, occurrence, label: old?.label ?? null, tip: old?.tip ?? null, ...change }
  const rest = p.labelOverrides.filter((o) => !same(o, list, item.id, occurrence))
  const keep = next.label !== null || next.tip !== null
  return { ...p, labelOverrides: keep ? [...rest, next] : rest }
}

/** Back to automatic placement for one row. */
export function resetOverride(p: Project, list: MovableLabelList, index: number): Project {
  return rowOverride(p, list, index) ? setOverride(p, list, index, { label: null, tip: null }) : p
}

export function resetAllOverrides(p: Project): Project {
  return p.labelOverrides.length ? { ...p, labelOverrides: [] } : p
}

/**
 * Keeps the overrides with their rows after an edit. Rows are followed as they are (an edit replaces only the rows it
 * changes): a row moved by sorting or an inserted row is found where it went; a row replaced in the same place (its name
 * or a value typed) keeps its override, under its new name; otherwise the same ID and occurrence is looked for. An
 * override whose row is gone is removed.
 */
export function syncLabelOverrides(prev: Project, next: Project): Project {
  if (next.labelOverrides.length === 0) return next
  if (MOVABLE_LABEL_LISTS.every((l) => prev[l] === next[l])) return next
  const out: LabelOverride[] = []
  for (const o of next.labelOverrides) {
    const before: Rows = prev[o.list]
    const after: Rows = next[o.list]
    if (before === after) {
      out.push(o)
      continue
    }
    const i = rowOf(before, o.id, o.occurrence)
    let j = i >= 0 ? after.indexOf(before[i]) : -1
    if (j < 0 && i >= 0 && before.length === after.length && !before.includes(after[i])) j = i
    if (j < 0) j = rowOf(after, o.id, o.occurrence)
    if (j < 0) continue
    const moved = { ...o, id: after[j].id, occurrence: occurrenceOf(after, j) }
    if (out.some((x) => same(x, moved.list, moved.id, moved.occurrence))) continue
    out.push(moved.id === o.id && moved.occurrence === o.occurrence ? o : moved)
  }
  return out.length === next.labelOverrides.length && out.every((o, i) => o === next.labelOverrides[i]) ? next : { ...next, labelOverrides: out }
}
