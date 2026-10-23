// Undo/redo history for one value (the project). Pure functions, no React.
//
// Every change goes through `record`. Changes with the same `group` that follow each other within
// GROUP_MS become one undo step, so typing a name is undone as a whole instead of letter by letter.

export const HISTORY_LIMIT = 200
export const GROUP_MS = 1500

export interface History<T> {
  past: T[]
  present: T
  future: T[]
  /** Label of each past step (same length as `past`), e.g. "Change Project name". */
  pastLabels: string[]
  futureLabels: string[]
  /** Group and time of the last recorded change, for merging consecutive edits. */
  lastGroup: string | null
  lastTime: number
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], pastLabels: [], futureLabels: [], lastGroup: null, lastTime: 0 }
}

export interface RecordOptions {
  label: string
  /** Consecutive changes with the same group (within GROUP_MS) merge into one undo step. */
  group?: string
  /** Time of the change in ms (default Date.now()); tests pass it. */
  now?: number
}

/** Records a new present value. A value identical to the current one is ignored. Clears redo. */
export function record<T>(h: History<T>, next: T, options: RecordOptions): History<T> {
  if (Object.is(next, h.present)) return h
  const now = options.now ?? Date.now()
  const group = options.group ?? null
  const merge = group !== null && group === h.lastGroup && now - h.lastTime <= GROUP_MS && h.past.length > 0
  if (merge) {
    return { ...h, present: next, future: [], futureLabels: [], lastTime: now }
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
    lastTime: now,
  }
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
    lastTime: 0,
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
    lastTime: 0,
  }
}

/** What Undo would undo, e.g. "Change Project name"; null when there is nothing to undo. */
export function undoLabel<T>(h: History<T>): string | null {
  return h.pastLabels[h.pastLabels.length - 1] ?? null
}

export function redoLabel<T>(h: History<T>): string | null {
  return h.futureLabels[0] ?? null
}
