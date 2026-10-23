// Undo/redo history for one value (the project). Pure functions, no React.
//
// Every change goes through `record`. Changes with the same `group` that follow each other become
// one undo step until the group is ended (`endGroup`, called when you leave a field), so typing a
// name is undone as a whole instead of letter by letter.

export const HISTORY_LIMIT = 200

export interface History<T> {
  past: T[]
  present: T
  future: T[]
  /** Label of each past step (same length as `past`), e.g. "Change Project name". */
  pastLabels: string[]
  futureLabels: string[]
  /** Group of the last recorded change while it is still open, for merging consecutive edits. */
  lastGroup: string | null
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], pastLabels: [], futureLabels: [], lastGroup: null }
}

export interface RecordOptions {
  label: string
  /** Consecutive changes with the same group merge into one undo step until endGroup. */
  group?: string
}

/** Records a new present value. A value identical to the current one is ignored. Clears redo. */
export function record<T>(h: History<T>, next: T, options: RecordOptions): History<T> {
  if (Object.is(next, h.present)) return h
  const group = options.group ?? null
  if (group !== null && group === h.lastGroup && h.past.length > 0) {
    return { ...h, present: next, future: [], futureLabels: [] }
  }
  const past = [...h.past, h.present]
  const pastLabels = [...h.pastLabels, options.label]
  const drop = Math.max(0, past.length - HISTORY_LIMIT)
  return {
    past: past.slice(drop),
    pastLabels: pastLabels.slice(drop),
    present: next,
    future: [],
    futureLabels: [],
    lastGroup: group,
  }
}

/** Ends the open group: the next change is a new undo step even if it has the same group. */
export function endGroup<T>(h: History<T>): History<T> {
  return h.lastGroup === null ? h : { ...h, lastGroup: null }
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0
}

export function undo<T>(h: History<T>): History<T> {
  if (!canUndo(h)) return h
  const present = h.past[h.past.length - 1]
  const label = h.pastLabels[h.pastLabels.length - 1]
  return {
    past: h.past.slice(0, -1),
    pastLabels: h.pastLabels.slice(0, -1),
    present,
    future: [h.present, ...h.future],
    futureLabels: [label, ...h.futureLabels],
    lastGroup: null,
  }
}

export function redo<T>(h: History<T>): History<T> {
  if (!canRedo(h)) return h
  const [present, ...future] = h.future
  const [label, ...futureLabels] = h.futureLabels
  return {
    past: [...h.past, h.present],
    pastLabels: [...h.pastLabels, label],
    present,
    future,
    futureLabels,
    lastGroup: null,
  }
}

/** What Undo would undo, e.g. "Change Project name"; null when there is nothing to undo. */
export function undoLabel<T>(h: History<T>): string | null {
  return h.pastLabels[h.pastLabels.length - 1] ?? null
}

export function redoLabel<T>(h: History<T>): string | null {
  return h.futureLabels[0] ?? null
}
