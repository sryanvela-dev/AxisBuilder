// Labels moved by hand in the drawing preview (Phase 5b, project file format 5). An override is keyed by its item's
// list and ID, never by its row, so sorting and inserted rows don't lose it. syncLabelOverrides runs after every edit
// (state/session.ts) and follows renames and deletes, like syncScanImages does for photo links.

import { MOVABLE_LABEL_LISTS, idKey, type LabelOverride, type MovableLabelList, type Project } from './schema.ts'

export function isMovableList(list: string): list is MovableLabelList {
  return (MOVABLE_LABEL_LISTS as readonly string[]).includes(list)
}

/** The override of an item (repeated IDs: it belongs to the first row with that ID). */
export function findOverride(p: Pick<Project, 'labelOverrides'>, list: MovableLabelList, id: string): LabelOverride | undefined {
  const k = idKey(id)
  return p.labelOverrides.find((o) => o.list === list && idKey(o.id) === k)
}

/** The override that applies to a row, or undefined (a repeated ID's later rows have none). */
export function rowOverride(p: Project, list: MovableLabelList, index: number): LabelOverride | undefined {
  const item = p[list][index]
  if (!item) return undefined
  const k = idKey(item.id)
  if (p[list].findIndex((n) => idKey(n.id) === k) !== index) return undefined
  return findOverride(p, list, item.id)
}

/** Sets (or, with label and tip both automatic, removes) an item's override. */
export function setOverride(p: Project, list: MovableLabelList, id: string, change: Partial<Pick<LabelOverride, 'label' | 'tip'>>): Project {
  const k = idKey(id)
  const old = findOverride(p, list, id)
  const next: LabelOverride = { list, id: old?.id ?? id, label: old?.label ?? null, tip: old?.tip ?? null, ...change }
  const rest = p.labelOverrides.filter((o) => !(o.list === list && idKey(o.id) === k))
  const keep = next.label !== null || next.tip !== null
  return { ...p, labelOverrides: keep ? [...rest, next] : rest }
}

/** Back to automatic placement for one item. */
export function resetOverride(p: Project, list: MovableLabelList, id: string): Project {
  return findOverride(p, list, id) ? setOverride(p, list, id, { label: null, tip: null }) : p
}

export function resetAllOverrides(p: Project): Project {
  return p.labelOverrides.length ? { ...p, labelOverrides: [] } : p
}

/**
 * Keeps the overrides in step with the nozzle tables after an edit. A row whose old ID is gone from the list and whose
 * new ID is new to it was renamed: its override follows. Sorting keeps every ID, so it is never taken for a rename.
 * An override whose item no longer exists is removed.
 */
export function syncLabelOverrides(prev: Project, next: Project): Project {
  if (next.labelOverrides.length === 0) return next
  if (MOVABLE_LABEL_LISTS.every((l) => prev[l] === next[l])) return next
  let list = next.labelOverrides
  for (const l of MOVABLE_LABEL_LISTS) {
    if (prev[l] === next[l]) continue
    const before = new Set(prev[l].map((n) => idKey(n.id)))
    const after = new Set(next[l].map((n) => idKey(n.id)))
    const renamed = new Map<string, string>()
    prev[l].forEach((n, i) => {
      const m = next[l][i]
      if (!m || idKey(n.id) === idKey(m.id)) return
      if (!after.has(idKey(n.id)) && !before.has(idKey(m.id))) renamed.set(idKey(n.id), m.id)
    })
    list = list
      .map((o) => (o.list === l && renamed.has(idKey(o.id)) ? { ...o, id: renamed.get(idKey(o.id))! } : o))
      .filter((o) => o.list !== l || after.has(idKey(o.id)))
  }
  return list.length === next.labelOverrides.length && list.every((o, i) => o === next.labelOverrides[i]) ? next : { ...next, labelOverrides: list }
}
