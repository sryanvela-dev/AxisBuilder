// Changes to MUT areas (Phase 5c), as pure project updates: each is one undo step through edit() in the UI. An area
// is stored on its MUT row (`area`, data/schema.ts), so renames, sorting and deletes of rows carry it along.

import { areaCenter } from '../engine/mutAreas.ts'
import type { HeadName, MutList } from '../engine/mutAreas.ts'
import { nextId, newItem } from './columns.ts'
import type { HeadMut, MutArea, Project, ShellMut } from './schema.ts'

type Pt = [number, number]

const rows = (p: Project, list: MutList) => p[list] as (ShellMut | HeadMut)[]
const withRow = (p: Project, list: MutList, index: number, row: ShellMut | HeadMut): Project =>
  ({ ...p, [list]: rows(p, list).map((r, i) => (i === index ? row : r)) }) as Project

const r3 = (v: number) => Math.round(v * 1000) / 1000

/**
 * A head clock position and radius for a point in head radii (u toward 3 o'clock, v toward 12), as the table holds
 * them: "H:MM" and Center or Custom %.
 */
export function clockOf(q: Pt): { clock: string; radiusPosition: 'CENTER' | 'CUSTOM'; customRadiusPercent: number | null } {
  const r = Math.hypot(q[0], q[1])
  if (r < 0.02) return { clock: '12', radiusPosition: 'CENTER', customRadiusPercent: null }
  let deg = (Math.atan2(q[0], q[1]) * 180) / Math.PI
  if (deg < 0) deg += 360
  let minutes = Math.round((deg / 30) * 60)
  if (minutes >= 720) minutes -= 720
  let h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) h = 12
  return { clock: m === 0 ? String(h) : `${h}:${String(m).padStart(2, '0')}`, radiusPosition: 'CUSTOM', customRadiusPercent: Math.min(100, Math.round(r * 100)) }
}

/**
 * Puts an area on a row. A shell MUT keeps its X / Y; blank ones get the area's center. A head MUT with no clock
 * position gets the center's clock and radius. (The point is what the Excel-compatible drawing and the table show.)
 */
export function setArea(p: Project, list: MutList, index: number, area: MutArea): Project {
  const row = rows(p, list)[index]
  if (!row) return p
  const pts = area.map(([x, y]): Pt => [x, y])
  if (list === 'shellMut') {
    const m = row as ShellMut
    const c = pts.length >= 3 ? areaCenter(pts) : null
    return withRow(p, list, index, { ...m, area: pts, x: m.x ?? (c ? r3(c[0]) : null), y: m.y ?? (c ? r3(c[1]) : null) })
  }
  const m = row as HeadMut
  if (m.clock !== null || pts.length < 3) return withRow(p, list, index, { ...m, area: pts })
  return withRow(p, list, index, { ...m, area: pts, ...clockOf(areaCenter(pts)) })
}

/** The area removed; the row stays (a MUT point again). */
export function deleteArea(p: Project, list: MutList, index: number): Project {
  const row = rows(p, list)[index]
  return row && row.area !== null ? withRow(p, list, index, { ...row, area: null }) : p
}

export function moveCorner(p: Project, list: MutList, index: number, corner: number, to: Pt): Project {
  const a = rows(p, list)[index]?.area
  if (!a || !a[corner]) return p
  return setArea(p, list, index, a.map((q, i) => (i === corner ? to : q)))
}

/** A new corner after corner `after` (on the edge from it to the next). */
export function insertCorner(p: Project, list: MutList, index: number, after: number, at: Pt): Project {
  const a = rows(p, list)[index]?.area
  if (!a || after < 0 || after >= a.length) return p
  return setArea(p, list, index, [...a.slice(0, after + 1), at, ...a.slice(after + 1)])
}

/** A corner removed; an area keeps at least 3. */
export function removeCorner(p: Project, list: MutList, index: number, corner: number): Project {
  const a = rows(p, list)[index]?.area
  if (!a || a.length <= 3 || !a[corner]) return p
  return setArea(p, list, index, a.filter((_, i) => i !== corner))
}

/** A new MUT row (next free ID) with this area: on the shell, or on a head. Returns the project and the new row. */
export function addMutWithArea(p: Project, target: { kind: 'shell' } | { kind: 'head'; head: HeadName }, area: MutArea): { project: Project; list: MutList; index: number; id: string } {
  const list: MutList = target.kind === 'shell' ? 'shellMut' : 'headMut'
  const id = nextId(p, list)
  const row = newItem(list, id, target.kind === 'head' ? target.head : 'HEAD 1') as unknown as ShellMut | HeadMut
  const added = { ...p, [list]: [...rows(p, list), row] } as Project
  const index = rows(added, list).length - 1
  return { project: setArea(added, list, index, area), list, index, id }
}
