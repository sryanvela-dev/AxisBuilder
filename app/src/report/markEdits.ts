// Picture mark edits (design 14, R5) as pure functions on a picture's mark list, plus the few that change the job
// (copy markup to other photos). The markup editor makes every finished change through these and stores the list with
// one `app.edit()` (pagesEdits setPictureEdits), so each change is one undo step.
//
// Badges are numbered 1, 2, 3 in the order they were placed; deleting one renumbers the rest so the key never has gaps.

import type { Project } from '../data/schema.ts'
import { pictureAt, setPictureEdits } from './pagesEdits.ts'
import type { ImagePlace } from './imageItems.ts'
import { markSchema, type Mark, type MarkStyle } from './schema.ts'
import type { SavedRecord } from './savedLists.ts'

/** A mark as the editor makes it: everything but its id and drawing order. */
export type NewMark = Mark extends infer M ? (M extends Mark ? Omit<M, 'id' | 'z'> : never) : never

/** The next free id ("m1", "m2", ...). */
export function nextMarkId(marks: readonly Mark[], taken: ReadonlySet<string> = new Set()): string {
  let n = marks.reduce((k, m) => Math.max(k, Number(/^m(\d+)$/.exec(m.id)?.[1] ?? 0)), 0) + 1
  while (taken.has(`m${n}`)) n++
  return `m${n}`
}

const topZ = (marks: readonly Mark[]) => marks.reduce((z, m) => Math.max(z, m.z), -1) + 1

/** The number a new badge gets: one more than the highest. */
export const nextBadgeNumber = (marks: readonly Mark[]) => marks.reduce((n, m) => (m.kind === 'badge' ? Math.max(n, m.n) : n), 0) + 1

/** A new mark on top of the others (a badge gets the next number). Returns the list and the new mark's id. */
export function addMark(marks: readonly Mark[], m: NewMark): { marks: Mark[]; id: string } {
  const id = nextMarkId(marks)
  const made = markSchema.parse({ ...m, id, z: topZ(marks), ...(m.kind === 'badge' ? { n: nextBadgeNumber(marks) } : {}) })
  return { marks: [...marks, made], id }
}

export function replaceMark(marks: readonly Mark[], next: Mark): Mark[] {
  return marks.map((m) => (m.id === next.id ? next : m))
}

/** Badges renumbered 1..n in their current order (the list is returned as is when nothing changes). */
export function renumberBadges(marks: readonly Mark[]): Mark[] {
  const order = marks.filter((m) => m.kind === 'badge').sort((a, b) => (a as { n: number }).n - (b as { n: number }).n)
  const want = new Map(order.map((m, i) => [m.id, i + 1]))
  let changed = false
  const out = marks.map((m) => {
    if (m.kind !== 'badge' || m.n === want.get(m.id)) return m
    changed = true
    return { ...m, n: want.get(m.id)! }
  })
  return changed ? out : (marks as Mark[])
}

/** Marks deleted (the editor leaves locked ones out of `ids`); badges renumbered. */
export function removeMarks(marks: readonly Mark[], ids: ReadonlySet<string>): Mark[] {
  return renumberBadges(marks.filter((m) => !ids.has(m.id)))
}

/** Shift of a duplicate, as fractions of the picture. */
export const DUPLICATE_SHIFT = 0.025

/** Every stored point of a mark shifted by fractions, kept on the picture. */
export function shiftMark(m: Mark, du: number, dv: number): Mark {
  const p = (q: readonly [number, number]): [number, number] => [Math.min(1, Math.max(0, q[0] + du)), Math.min(1, Math.max(0, q[1] + dv))]
  const box = (b: { x0: number; y0: number; x1: number; y1: number }) => {
    const w = b.x1 - b.x0
    const h = b.y1 - b.y0
    const x0 = Math.min(Math.max(b.x0 + du, 0), 1 - w)
    const y0 = Math.min(Math.max(b.y0 + dv, 0), 1 - h)
    return { x0, y0, x1: x0 + w, y1: y0 + h }
  }
  switch (m.kind) {
    case 'rect': case 'ellipse': case 'redaction': return { ...m, box: box(m.box) }
    case 'highlight': case 'pen': return { ...m, points: m.points.map(p) }
    case 'line': case 'arrow': return { ...m, from: p(m.from), to: p(m.to) }
    case 'label': return { ...m, at: p(m.at), leader: m.leader ? p(m.leader) : null }
    case 'badge': return { ...m, at: p(m.at) }
  }
}

/** Copies of marks added on top, with new ids (badges numbered after the list's own), shifted by (du, dv). */
export function appendCopies(into: readonly Mark[], copies: readonly Mark[], du = 0, dv = 0): { marks: Mark[]; ids: string[] } {
  const out = [...into]
  const ids: string[] = []
  let z = topZ(into)
  let n = nextBadgeNumber(into)
  const taken = new Set(into.map((m) => m.id))
  for (const c of [...copies].sort((a, b) => a.z - b.z)) {
    const id = nextMarkId(out, taken)
    taken.add(id)
    const moved = du || dv ? shiftMark(c, du, dv) : c
    out.push({ ...moved, id, z: z++, locked: false, ...(moved.kind === 'badge' ? { n: n++ } : {}) } as Mark)
    ids.push(id)
  }
  return { marks: out, ids }
}

/** The selected marks duplicated a little down and right, on top. Returns the list and the copies' ids. */
export function duplicateMarks(marks: readonly Mark[], ids: ReadonlySet<string>): { marks: Mark[]; ids: string[] } {
  return appendCopies(marks, marks.filter((m) => ids.has(m.id)), DUPLICATE_SHIFT, DUPLICATE_SHIFT)
}

/** Drawing order changed: one step forward / back, or all the way to the front / back. z becomes 0..n-1. */
export function reorderMarks(marks: readonly Mark[], ids: ReadonlySet<string>, how: 'forward' | 'back' | 'front' | 'backmost'): Mark[] {
  const order = [...marks].sort((a, b) => a.z - b.z)
  if (how === 'front' || how === 'backmost') {
    const moved = order.filter((m) => ids.has(m.id))
    const rest = order.filter((m) => !ids.has(m.id))
    const next = how === 'front' ? [...rest, ...moved] : [...moved, ...rest]
    return applyOrder(marks, next)
  }
  const next = [...order]
  if (how === 'forward') {
    for (let i = next.length - 2; i >= 0; i--) if (ids.has(next[i].id) && !ids.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]]
  } else {
    for (let i = 1; i < next.length; i++) if (ids.has(next[i].id) && !ids.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]]
  }
  return applyOrder(marks, next)
}

function applyOrder(marks: readonly Mark[], order: readonly Mark[]): Mark[] {
  const z = new Map(order.map((m, i) => [m.id, i]))
  return marks.map((m) => (m.z === z.get(m.id) ? m : { ...m, z: z.get(m.id)! }))
}

export function setLocked(marks: readonly Mark[], ids: ReadonlySet<string>, locked: boolean): Mark[] {
  return marks.map((m) => (ids.has(m.id) && m.locked !== locked ? { ...m, locked } : m))
}

/** A style change on the selected marks (a value a mark already has changes nothing). */
export function setStyle(marks: readonly Mark[], ids: ReadonlySet<string>, patch: Partial<MarkStyle>): Mark[] {
  return marks.map((m) => (ids.has(m.id) && Object.entries(patch).some(([k, v]) => m.style[k as keyof MarkStyle] !== v) ? { ...m, style: { ...m.style, ...patch } } : m))
}

/** Any other field change on the selected marks (callout, leader end, arrow head, text, link, ...), when it applies. */
export function setFields(marks: readonly Mark[], ids: ReadonlySet<string>, change: (m: Mark) => Mark): Mark[] {
  return marks.map((m) => (ids.has(m.id) ? change(m) : m))
}

// --- Label styles -----------------------------------------------------------------------------------

export type LabelStyle = SavedRecord<'labelStyles'>

/** A label style applied to a label (callout, leader end and look) or a badge (look only). */
export function applyLabelStyle(m: Mark, s: LabelStyle): Mark {
  if (m.kind !== 'label' && m.kind !== 'badge') return m
  const style: MarkStyle = {
    ...m.style, stroke: s.stroke, fill: s.fill, textColor: s.textColor, textSize: s.textSize, width: s.width, bold: s.bold, font: s.font, bgOpacity: s.bgOpacity, halo: s.halo,
  }
  return m.kind === 'label' ? { ...m, style, callout: s.callout, leaderEnd: s.leaderEnd } : { ...m, style }
}

/** A selected label's or badge's look as a style to save. */
export function labelStyleOf(m: Mark, name: string): LabelStyle | null {
  if (m.kind !== 'label' && m.kind !== 'badge') return null
  const s = m.style
  return {
    name, kind: m.kind, callout: m.kind === 'label' ? m.callout : 'rounded', leaderEnd: m.kind === 'label' ? m.leaderEnd : 'arrow',
    stroke: s.stroke, fill: s.fill, textColor: s.textColor, textSize: s.textSize, width: s.width, bold: s.bold, font: s.font, bgOpacity: s.bgOpacity, halo: s.halo,
  }
}

/** Built-in styles (offered first, never stored): Finding (red box, white bold, arrow), Note (blue), Reading (yellow badge). */
export const BUILT_IN_LABEL_STYLES: readonly LabelStyle[] = [
  { name: 'Finding', kind: 'label', callout: 'rounded', leaderEnd: 'arrow', stroke: '#d62828', fill: '#d62828', textColor: '#ffffff', textSize: 9, width: 1.5, bold: true, font: 'roboto', bgOpacity: 0.92, halo: true },
  { name: 'Note', kind: 'label', callout: 'rounded', leaderEnd: 'arrow', stroke: '#1d5fa8', fill: '#1d5fa8', textColor: '#ffffff', textSize: 9, width: 1.25, bold: false, font: 'roboto', bgOpacity: 0.9, halo: true },
  { name: 'Reading', kind: 'badge', callout: 'rounded', leaderEnd: 'none', stroke: '#f2c200', fill: '#f2c200', textColor: '#1a1a1a', textSize: 10, width: 1, bold: true, font: 'roboto', bgOpacity: 0.95, halo: true },
]

/** The styles to pick from: built in, then this computer's saved ones. */
export function labelStyleChoices(saved: readonly LabelStyle[]): LabelStyle[] {
  return [...BUILT_IN_LABEL_STYLES, ...saved]
}

// --- Whole-job edits --------------------------------------------------------------------------------

/**
 * Marks of one picture copied onto other pictures (0-1 positions kept), on top of their own marks, badges numbered
 * after theirs; live labels keep their link. `ids` = the marks to copy (null = all). One project change: one undo step.
 */
export function copyMarkupTo(p: Project, from: ImagePlace, ids: ReadonlySet<string> | null, targets: readonly ImagePlace[]): Project {
  const src = p.report ? pictureAt(p.report, from) : undefined
  if (!src) return p
  const copies = src.edits.markup.filter((m) => !ids || ids.has(m.id))
  if (copies.length === 0) return p
  let out = p
  for (const t of targets) {
    const item = out.report ? pictureAt(out.report, t) : undefined
    if (!item) continue
    out = setPictureEdits(out, t, { markup: appendCopies(item.edits.markup, copies).marks })
  }
  return out
}
