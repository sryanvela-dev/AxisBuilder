// The MUT areas tool (Phase 5c): drawing point by point (closing, Backspace, typed points, every snap, Shift free, Ctrl
// ortho), the edits it stores (one undo step each, X / Y and clock filled in when blank), and areas staying with their
// rows through sorting, renames and deletes.
import { describe, expect, it } from 'vitest'
import { addMutWithArea, clockOf, deleteArea, insertCorner, moveCorner, removeCorner, setArea } from '../../src/data/mutAreaEdits.ts'
import { createEmptyProject, openProject, saveProject } from '../../src/data/projectFile.ts'
import type { HeadMut, Project, ShellMut } from '../../src/data/schema.ts'
import { areaFrame, areaGeometry, mutAreaOf } from '../../src/engine/mutAreas.ts'
import { toVisual, type Orientation } from '../../src/engine/transform.ts'
import { initialSession, sessionReducer, type SessionState } from '../../src/state/session.ts'
import { addPoint, drawSnap, parseTypedPoint, removeLast, typedFrame } from '../../src/ui/preview/areaDraw.ts'

type Pt = [number, number]
const square = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]
const mut = (id: string, area: Pt[] | null, x: number | null = null, y: number | null = null): ShellMut => ({ id, x, y, minT: null, notes: '', area })
const headMut = (id: string, area: Pt[] | null, clock: string | null = null): HeadMut => ({
  head: 'HEAD 1', id, clock, radiusPosition: 'CENTER', customRadiusPercent: null, minT: null, labelMode: 'AUTO', include: true, notes: '', area,
})
const free = { shift: false, ctrl: false }

function shell(o: Orientation = 'Vertical', extra: Partial<Project> = {}): Project {
  const p = createEmptyProject()
  return { ...p, vessel: { ...p.vessel, length: 120, height: 200, orientation: o }, settings: { ...p.settings, headViewMode: 'BOTH' }, ...extra }
}

/** A job with a weld at Y 60, a seam at X 100, a scan and a nozzle, for the snaps. */
function lines(o: Orientation = 'Vertical'): Project {
  return shell(o, {
    circWelds: [{ id: 'C1', y: 60, include: true, showLabel: false }],
    longSeams: [{ id: 'L1', x: 100, startY: null, stopY: null, include: true, showLabel: false }],
    scans: [{ id: 'S1', xStart: 20, xStop: 60, yStart: 10, yStop: 30, include: true, noWrap: false, acrossSeam: false }],
    shellNozzles: [{ id: 'N1', diameter: 10, x: 150, y: 90, minT: null, notes: '', include: true, labelMode: 'AUTO', noWrap: false }],
  })
}

describe('drawing point by point', () => {
  it('clicking the first corner closes the shape once it has 3; the last corner again does nothing; Backspace takes one away', () => {
    let pts: Pt[] = []
    for (const q of [[0, 0], [10, 0], [10, 0], [10, 10]] as Pt[]) pts = addPoint(pts, q, 0.5).pts
    expect(pts).toEqual([[0, 0], [10, 0], [10, 10]])
    expect(addPoint([[0, 0], [10, 0]], [0.2, 0.1], 0.5).closed).toBe(false)
    expect(addPoint(pts, [0.2, 0.1], 0.5)).toEqual({ pts, closed: true })
    expect(removeLast(pts)).toEqual([[0, 0], [10, 0]])
    expect(removeLast([])).toEqual([])
  })

  it('typed points: absolute, from the last corner, lengths as the tables take them, plain problems', () => {
    expect(parseTypedPoint('12.5, 30', null)).toEqual({ ok: true, pt: [12.5, 30] })
    expect(parseTypedPoint('12 1/2; 2\' 6"', null)).toEqual({ ok: true, pt: [12.5, 30] })
    expect(parseTypedPoint('@5, -2', [10, 10])).toEqual({ ok: true, pt: [15, 8] })
    expect(parseTypedPoint('-6, 4', null)).toEqual({ ok: true, pt: [-6, 4] })
    expect(parseTypedPoint('@5, 0', null).ok).toBe(false)
    expect(parseTypedPoint('12', null).ok).toBe(false)
    expect(parseTypedPoint('abc, 3', null).ok).toBe(false)
  })

  it('typed coordinates are X / Y on the shell and right / up from the center on a head, in every orientation', () => {
    for (const o of ['Vertical', 'Horizontal CW', 'Horizontal CCW'] as Orientation[]) {
      const p = shell(o)
      const sf = typedFrame(p, { kind: 'shell' })!
      expect(sf.toVisual([12, 30])).toEqual(toVisual(o, 12, 30))
      expect(sf.fromVisual(sf.toVisual([12, 30]))).toEqual([12, 30])
      const hf = typedFrame(p, { kind: 'head', head: 'HEAD 2' })!
      const c = hf.toVisual([0, 0])
      expect(hf.toVisual([3, 4])).toEqual([c[0] + 3, c[1] + 4])
      expect(hf.describe([-3, 4])).toBe('3 left, 4 up from the center')
    }
  })

  describe('snaps (as the drawing reads)', () => {
    const o: Orientation = 'Horizontal CW'
    const p = lines(o)
    const g = areaGeometry(p, { kind: 'shell' })
    const v = (x: number, y: number) => toVisual(o, x, y)
    const near = (q: Pt, d = 0.3): Pt => [q[0] + d, q[1] - d]
    const tol = 1

    it('endpoint: a scan corner', () => {
      const s = drawSnap(g, [], near(v(20, 10)), tol, free)
      expect(s.kind).toBe('endpoint')
      expect(s.pt[0]).toBeCloseTo(v(20, 10)[0], 9)
      expect(s.pt[1]).toBeCloseTo(v(20, 10)[1], 9)
    })
    it('intersection: the weld crossing the seam', () => {
      const s = drawSnap(g, [], near(v(100, 60)), tol, free)
      expect(s.kind).toBe('intersection')
      expect(s.pt.map((n) => Math.round(n * 1e6) / 1e6)).toEqual(v(100, 60))
    })
    it('center: the nozzle', () => {
      expect(drawSnap(g, [], near(v(150, 90), 0.2), tol, free)).toMatchObject({ kind: 'center' })
    })
    it('perpendicular: from the last corner to the seam', () => {
      const last = v(80, 45)
      const s = drawSnap(g, [last], near(v(100, 45), 0.2), tol, free)
      expect(s.kind).toBe('perpendicular')
      expect(s.pt[0]).toBeCloseTo(v(100, 45)[0], 9)
      expect(s.pt[1]).toBeCloseTo(v(100, 45)[1], 9)
    })
    it('on: a point on the weld', () => {
      const q = v(130, 60)
      const s = drawSnap(g, [], [q[0] + 0.4, q[1]], tol, free)
      expect(s.kind).toBe('on')
      expect(s.pt[0]).toBeCloseTo(q[0], 9)
    })
    it('the shape so far snaps too (its first corner)', () => {
      const first = v(170, 100)
      expect(drawSnap(g, [first, v(180, 100)], near(first, 0.2), tol, free)).toMatchObject({ kind: 'endpoint' })
    })
    it('Shift = free; Ctrl = level or plumb with the last corner', () => {
      const q = near(v(20, 10))
      expect(drawSnap(g, [], q, tol, { shift: true, ctrl: false })).toEqual({ pt: q, kind: 'free' })
      const last = v(170, 100)
      const s = drawSnap(g, [last], [last[0] + 20, last[1] + 3], tol, { shift: false, ctrl: true })
      expect(s.pt[1]).toBeCloseTo(last[1], 9)
      expect(s.pt[0]).toBeCloseTo(last[0] + 20, 9)
    })
  })
})

describe('edits', () => {
  it('putting an area on a row fills a blank X / Y with its center and keeps typed ones', () => {
    const p = shell('Vertical', { shellMut: [mut('A', null), mut('B', null, 5, 6)] })
    const q = setArea(setArea(p, 'shellMut', 0, square(10, 20, 10)), 'shellMut', 1, square(50, 50, 4))
    expect(q.shellMut[0]).toMatchObject({ x: 15, y: 25, area: square(10, 20, 10) })
    expect(q.shellMut[1]).toMatchObject({ x: 5, y: 6 })
  })

  it('a head MUT with no clock gets the center clock and radius', () => {
    expect(clockOf([0.5, 0])).toEqual({ clock: '3', radiusPosition: 'CUSTOM', customRadiusPercent: 50 })
    expect(clockOf([0, -1])).toEqual({ clock: '6', radiusPosition: 'CUSTOM', customRadiusPercent: 100 })
    expect(clockOf([-0.5, 0.5]).clock).toBe('10:30')
    expect(clockOf([0, 0])).toEqual({ clock: '12', radiusPosition: 'CENTER', customRadiusPercent: null })
    const p = shell('Vertical', { headMut: [headMut('H', null), headMut('K', null, '9')] })
    const q = setArea(setArea(p, 'headMut', 0, square(0.3, -0.1, 0.2)), 'headMut', 1, square(0.3, -0.1, 0.2))
    expect(q.headMut[0]).toMatchObject({ clock: '3', radiusPosition: 'CUSTOM', customRadiusPercent: 40 })
    expect(q.headMut[1]).toMatchObject({ clock: '9', radiusPosition: 'CENTER' })
  })

  it('corners move, are added and removed (never below 3); deleting the area keeps the row', () => {
    const p = shell('Vertical', { shellMut: [mut('A', square(0, 0, 10), 5, 5)] })
    expect(moveCorner(p, 'shellMut', 0, 2, [20, 20]).shellMut[0].area![2]).toEqual([20, 20])
    expect(insertCorner(p, 'shellMut', 0, 0, [5, -3]).shellMut[0].area).toEqual([[0, 0], [5, -3], [10, 0], [10, 10], [0, 10]])
    const three = removeCorner(p, 'shellMut', 0, 1)
    expect(three.shellMut[0].area).toEqual([[0, 0], [10, 10], [0, 10]])
    expect(removeCorner(three, 'shellMut', 0, 0)).toBe(three)
    const gone = deleteArea(p, 'shellMut', 0)
    expect(gone.shellMut).toHaveLength(1)
    expect(gone.shellMut[0]).toMatchObject({ id: 'A', x: 5, y: 5, area: null })
  })

  it('a new MUT row with its area: next free ID, on the shell or a head', () => {
    const p = shell('Vertical', { shellMut: [mut('MUT2', null, 1, 1)], headMut: [headMut('MUT3', null, '3')] })
    const r = addMutWithArea(p, { kind: 'shell' }, square(10, 10, 5))
    expect(r).toMatchObject({ list: 'shellMut', index: 1, id: 'MUT4' })
    expect(r.project.shellMut[1]).toMatchObject({ id: 'MUT4', x: 12.5, y: 12.5 })
    const h = addMutWithArea(p, { kind: 'head', head: 'HEAD 2' }, square(0, 0, 0.2))
    expect(h).toMatchObject({ list: 'headMut', index: 1 })
    expect(h.project.headMut[1]).toMatchObject({ head: 'HEAD 2', clock: '1:30' })
    expect(mutAreaOf(h.project, 'headMut', 1)).toBeDefined()
  })

  it('a corner stored from the drawing is the point clicked (shell to 1/1000 in, heads in head radii)', () => {
    const p = shell('Horizontal CCW')
    const f = areaFrame(p, { kind: 'shell' })!
    expect(f.toStored(toVisual('Horizontal CCW', 12.3456, 7.8912))).toEqual([12.346, 7.891])
  })
})

describe('areas stay with their rows', () => {
  const start = (p: Project): SessionState => sessionReducer(initialSession, { type: 'openJob', project: p, source: 'new' })
  const present = (s: SessionState) => s.job!.history.present

  it('through sorting, a rename and deleting another row, and save and open', () => {
    const p = shell('Vertical', { shellMut: [mut('A', square(0, 0, 10), 5, 5), mut('B', null, 50, 50), mut('C', square(60, 60, 4), 62, 62)] })
    let s = start(p)
    s = sessionReducer(s, { type: 'edit', label: 'Sort', update: (q) => ({ ...q, shellMut: [q.shellMut[2], q.shellMut[0], q.shellMut[1]] }) })
    s = sessionReducer(s, { type: 'edit', label: 'Rename', update: (q) => ({ ...q, shellMut: q.shellMut.map((m) => (m.id === 'A' ? { ...m, id: 'A2' } : m)) }) })
    s = sessionReducer(s, { type: 'edit', label: 'Delete B', update: (q) => ({ ...q, shellMut: q.shellMut.filter((m) => m.id !== 'B') }) })
    const q = present(s)
    expect(q.shellMut.map((m) => [m.id, m.area])).toEqual([['C', square(60, 60, 4)], ['A2', square(0, 0, 10)]])
    const again = openProject(saveProject(q))
    expect(again.ok && again.project.shellMut.map((m) => m.area)).toEqual([square(60, 60, 4), square(0, 0, 10)])
  })

  it('each action is one undo step', () => {
    const p = shell('Vertical', { shellMut: [mut('A', null, 5, 5)] })
    let s = start(p)
    s = sessionReducer(s, { type: 'edit', label: 'Draw', update: (q) => setArea(q, 'shellMut', 0, square(0, 0, 10)) })
    s = sessionReducer(s, { type: 'endEditGroup' })
    s = sessionReducer(s, { type: 'edit', label: 'Move', update: (q) => moveCorner(q, 'shellMut', 0, 1, [12, 0]) })
    s = sessionReducer(s, { type: 'endEditGroup' })
    s = sessionReducer(s, { type: 'edit', label: 'Delete', update: (q) => deleteArea(q, 'shellMut', 0) })
    expect(present(s).shellMut[0].area).toBeNull()
    s = sessionReducer(s, { type: 'undo' })
    expect(present(s).shellMut[0].area![1]).toEqual([12, 0])
    s = sessionReducer(s, { type: 'undo' })
    expect(present(s).shellMut[0].area![1]).toEqual([10, 0])
    s = sessionReducer(s, { type: 'undo' })
    expect(present(s).shellMut[0].area).toBeNull()
    s = sessionReducer(s, { type: 'redo' })
    expect(present(s).shellMut[0].area).toEqual(square(0, 0, 10))
  })
})

describe('lining up with distant points', () => {
  const o: Orientation = 'Vertical'
  const p = lines(o)
  const g = areaGeometry(p, { kind: 'shell' })

  it('lines up with a point far away on one axis, with a guide back to it', () => {
    // Same X as the scan's corner (20, 10), far above it, away from any line.
    const s = drawSnap(g, [], [20.3, 90], 1, free)
    expect(s).toMatchObject({ kind: 'align', pt: [20, 90], ref: [20, 10] })
  })

  it('squares up with two points at once (one across, one up and down)', () => {
    // X of the scan corner (60, 30) and Y of the nozzle center (150, 90).
    const s = drawSnap(g, [], [60.4, 90.3], 1, free)
    expect(s.kind).toBe('align')
    expect(s.pt).toEqual([60, 90])
    expect(s.ref).toEqual([60, 10])
    expect(s.ref2).toEqual([150, 90])
  })

  it('near a line, lining up lands on the line', () => {
    // On the seam X = 100, lined up with the scan's top Y = 30.
    const s = drawSnap(g, [], [100.4, 30.3], 1, free)
    expect(s.pt[0]).toBeCloseTo(100, 9)
    expect(s.pt[1]).toBeCloseTo(30, 9)
  })

  it('the Straight lock holds level or plumb like Ctrl', () => {
    const s = drawSnap(g, [[170, 100]], [190, 103], 1, { shift: false, ctrl: true })
    expect(s.pt[1]).toBeCloseTo(100, 9)
  })
})
