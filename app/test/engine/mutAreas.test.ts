// MUT areas (Phase 5c): polygon geometry (hatched area, islands, clipping, pick inside), the project layout (pieces
// across the seam, heads in every orientation, label inside / outside / moved), coverage, Review warnings, the .lsp.
import { describe, expect, it } from 'vitest'
import { checkProject } from '../../src/data/checks.ts'
import { setOverride } from '../../src/data/overrides.ts'
import { createEmptyProject, openProject, saveProject } from '../../src/data/projectFile.ts'
import type { HeadMut, Project, ShellMut } from '../../src/data/schema.ts'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { countedScans, coveragePercent, drawnScans } from '../../src/engine/layout.ts'
import {
  areaCenter, areaFrame, compactRim, formatAreaSize, headFrame, headOutline, mutAreaLayouts, mutAreaOf, mutAreaProblems, mutAreaSize, mutCoverageArea, pickInside, shellAreaPieces,
} from '../../src/engine/mutAreas.ts'
import {
  circlePolygon, clipToBox, enclosingBoundary, hatchLines, hatchedArea, labelSpot, pointInPolygon, polygonArea, rectPolygon, selfIntersects, type Pt,
} from '../../src/engine/polygon.ts'
import { placeTextLabel, textLabelSpecs } from '../../src/engine/textLabels.ts'
import { toVisual, type Orientation } from '../../src/engine/transform.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'

const ORIENTATIONS: Orientation[] = ['Vertical', 'Horizontal CW', 'Horizontal CCW']
const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]
const mut = (id: string, area: [number, number][] | null, x: number | null = 0, y: number | null = 0): ShellMut => ({ id, x, y, minT: null, notes: '', area })
const headMut = (id: string, head: 'HEAD 1' | 'HEAD 2', area: [number, number][] | null): HeadMut => ({
  head, id, clock: '3', radiusPosition: 'CENTER', customRadiusPercent: null, minT: null, labelMode: 'AUTO', include: true, notes: '', area,
})

/** A plain shell 200 around x 120 long, nothing on it but what the test adds. */
function shell(o: Orientation = 'Vertical', extra: Partial<Project> = {}): Project {
  const p = createEmptyProject()
  return { ...p, vessel: { ...p.vessel, length: 120, height: 200, orientation: o }, settings: { ...p.settings, headViewMode: 'BOTH' }, ...extra }
}
const lsp = (p: Project, v5 = false) =>
  exportLsp(p, { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5), ...(v5 ? { compat: 'v5.0' as const } : {}) })
const balanced = (s: string) => [...s].filter((c) => c === '(').length === [...s].filter((c) => c === ')').length

describe('polygon geometry', () => {
  it('measures, clips and spots a crossing outline', () => {
    expect(polygonArea(square(0, 0, 10))).toBe(100)
    expect(polygonArea(clipToBox(square(-5, 0, 10), [0, 0, 100, 100]))).toBeCloseTo(50)
    expect(selfIntersects([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(true)
    expect(selfIntersects(square(0, 0, 10))).toBe(false)
  })

  it('the hatched area leaves islands out, exactly for rectangles and to 0.1% for circles', () => {
    const outer = rectPolygon(0, 0, 20, 10)
    expect(hatchedArea(outer, [rectPolygon(5, 2, 9, 6)])).toBeCloseTo(200 - 16, 9)
    // An island half outside counts only its part inside; two overlapping islands count once.
    expect(hatchedArea(outer, [rectPolygon(18, 2, 22, 6)])).toBeCloseTo(200 - 8, 9)
    expect(hatchedArea(outer, [rectPolygon(2, 2, 6, 6), rectPolygon(4, 4, 8, 8)])).toBeCloseTo(200 - 28, 9)
    expect(hatchedArea(outer, [circlePolygon(10, 5, 2)])).toBeCloseTo(200 - Math.PI * 4, 1)
    // An L shape by hand: 10 x 10 minus a 5 x 5 corner.
    const l: Pt[] = [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]]
    expect(hatchedArea(l, [])).toBeCloseTo(75, 9)
    expect(hatchedArea(outer, [], [0, 4])).toBeCloseTo(80, 9)
  })

  it('hatch lines stay inside the outline and out of the islands', () => {
    const outer = rectPolygon(0, 0, 40, 30)
    const islands = [rectPolygon(5, 5, 15, 12), circlePolygon(28, 18, 5)]
    const lines = hatchLines(outer, islands, 2)
    expect(lines.length).toBeGreaterThan(10)
    for (const [a, b] of lines) {
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      expect(pointInPolygon(outer, mid)).toBe(true)
      for (const isl of islands) expect(pointInPolygon(isl, mid)).toBe(false)
      expect(b[0] - a[0]).toBeCloseTo(b[1] - a[1], 9) // 45 degrees, as SL_HatchRect
    }
  })

  it('the label goes to the middle when it fits, elsewhere when the middle is taken, and reports when it fits nowhere', () => {
    const outer = rectPolygon(0, 0, 40, 20)
    expect(labelSpot(outer, [], 6, 2)).toMatchObject({ at: [20, 10], fits: true })
    const taken = labelSpot(outer, [rectPolygon(15, 5, 25, 15)], 6, 2)
    expect(taken.fits).toBe(true)
    const [x, y] = taken.at
    expect(x + 3 <= 15 || x - 3 >= 25 || y + 1 <= 5 || y - 1 >= 15).toBe(true)
    expect(labelSpot(rectPolygon(0, 0, 2, 1), [], 6, 2).fits).toBe(false)
  })

  it('pick inside finds the closed space between lines, keeps an island out of the outline, and says when it is open', () => {
    const segs: [Pt, Pt][] = [
      [[0, 0], [100, 0]], [[100, 0], [100, 50]], [[100, 50], [0, 50]], [[0, 50], [0, 0]],
      [[0, 20], [100, 20]], // a weld
      [[40, 0], [40, 50]], // a seam
      [[70, 30], [70, 45]], // a seam stopping in the open (a loose end, trimmed)
    ]
    const circle = circlePolygon(20, 10, 3, 24)
    for (let i = 0; i < circle.length; i++) segs.push([circle[i], circle[(i + 1) % circle.length]])
    const found = enclosingBoundary(segs, [10, 10])!
    expect(found).not.toBeNull()
    expect(polygonArea(found)).toBeCloseTo(800, 6)
    // Inside the nozzle: the nozzle itself.
    expect(polygonArea(enclosingBoundary(segs, [20, 10])!)).toBeCloseTo(polygonArea(circle), 6)
    // Right of the seam that stops: the whole 60 x 30 space (the loose end doesn't close anything).
    expect(polygonArea(enclosingBoundary(segs, [80, 40])!)).toBeCloseTo(1800, 6)
    // A U shape is open.
    const u: [Pt, Pt][] = [[[0, 0], [10, 0]], [[10, 0], [10, 10]], [[0, 0], [0, 10]]]
    expect(enclosingBoundary(u, [5, 5])).toBeNull()
  })
})

describe('MUT areas on the shell', () => {
  it('a shell area replaces the point marker: solid outline on MANUAL_UT, hatch on MANUAL_UT_HATCH, the ID in the middle', () => {
    const p = shell('Vertical', { shellMut: [mut('MUT3', square(50, 40, 20))] })
    const item = buildDrawing(p).items.find((i) => i.key === 'shellMut:0')!
    expect(item.shapes.filter((s) => s.layer === 'MANUAL_UT').map((s) => s.t)).toEqual(['poly'])
    const lines = item.shapes.filter((s) => s.layer === 'MANUAL_UT_HATCH')
    expect(lines.every((s) => s.t === 'line')).toBe(true)
    expect(lines.length).toBeGreaterThan(5)
    expect(buildDrawing(p).layerColors.MANUAL_UT).toBe(7)
    const text = item.shapes.find((s) => s.t === 'text')!
    expect(text).toMatchObject({ text: 'MUT3', x: 60, y: 50 })
    expect(item.info).toContain('400 sq in')
  })

  it('leaves the scan, object, nozzle and label inside unhatched; the coverage counts the hatched part only', () => {
    const p0 = shell()
    const p: Project = {
      ...p0,
      shellMut: [mut('MUT1', square(0, 0, 40), 20, 20)],
      scans: [{ id: 'S1', xStart: 2, xStop: 12, yStart: 2, yStop: 12, include: true, noWrap: false, acrossSeam: false }],
      objects: [{ id: 'OB', x: 25, y: 2, circWidth: 10, length: 5, include: true, notes: '', noWrap: false }],
      shellNozzles: [{ id: 'N1', diameter: 6, x: 30, y: 30, minT: null, notes: '', include: true, labelMode: 'AUTO', noWrap: false }],
    }
    const a = mutAreaOf(p, 'shellMut', 0)!
    expect(a.inside).toBe(true)
    // By hand: 1600 - scan 100 - object 50 - nozzle pi x 9 (as a 96-sided polygon).
    expect(a.coverageArea).toBeCloseTo(1600 - 100 - 50 - polygonArea(circlePolygon(30, 30, 3)), 6)
    expect(mutCoverageArea(p)).toBeCloseTo(a.coverageArea, 9)
    const counted = countedScans(p, drawnScans(p), false)
    expect(coveragePercent(p, counted, mutCoverageArea(p))! - coveragePercent(p, counted)!).toBeCloseTo((a.coverageArea / (200 * 120)) * 100, 9)
    const mid = (s: [Pt, Pt]): Pt => [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2]
    const label = a.at
    for (const h of a.hatch) {
      const m = mid(h)
      expect(m[0] > 2 && m[0] < 12 && m[1] > 2 && m[1] < 12).toBe(false)
      expect(m[0] > 25 && m[0] < 35 && m[1] > 2 && m[1] < 7).toBe(false)
      expect(Math.hypot(m[0] - 30, m[1] - 30) < 2.9).toBe(false)
      expect(Math.abs(m[0] - label[0]) < a.w / 2 - 0.01 && Math.abs(m[1] - label[1]) < a.h / 2 - 0.01).toBe(false)
    }
  })

  it('head areas never count, and the Excel-compatible coverage is unchanged', () => {
    const p = shell('Vertical', { headMut: [headMut('HM1', 'HEAD 1', square(-0.5, -0.5, 1))] })
    expect(mutAreaLayouts(p)).toHaveLength(1)
    expect(mutCoverageArea(p)).toBe(0)
    const q = shell('Vertical', {
      shellMut: [mut('M1', square(10, 10, 20))],
      scans: [{ id: 'S1', xStart: 100, xStop: 150, yStart: 0, yStop: 50, include: true, noWrap: false, acrossSeam: false }],
    })
    expect(lsp(q, true)).toContain('Coverage: 10.4%')
    expect(lsp(q)).toContain(`Coverage: ${((2500 + 400) / 24000 * 100).toFixed(1)}%`)
  })

  it('wraps across the seam in pieces with one ID on the larger piece', () => {
    const p = shell('Vertical', { shellMut: [mut('MW', [[-5, 10], [15, 10], [15, 20], [-5, 20]], 5, 15)] })
    const pieces = shellAreaPieces(p, p.shellMut[0].area!)
    expect(pieces.map(polygonArea).sort((a, b) => a - b)).toEqual([50, 150])
    const a = mutAreaOf(p, 'shellMut', 0)!
    expect(polygonArea(a.pieces[a.labelPiece])).toBe(150)
    expect(a.at[0]).toBeGreaterThan(0)
    expect(a.at[0]).toBeLessThan(15)
    const texts = buildDrawing(p).items.find((i) => i.key === 'shellMut:0')!.shapes.filter((s) => s.t === 'text')
    expect(texts).toHaveLength(1)
    expect(mutAreaSize(p, 'shellMut', p.shellMut[0])!.sqIn).toBe(200)
  })

  it('a label that does not fit goes outside with a leader into the area; a moved label follows the row', () => {
    const p = shell('Horizontal CW', { shellMut: [mut('LONGNAME', square(100, 60, 1.5), 100, 60)] })
    const a = mutAreaOf(p, 'shellMut', 0)!
    expect(a.inside).toBe(false)
    const sp = textLabelSpecs(p).find((s) => s.list === 'shellMut')!
    const tp = placeTextLabel(p, sp)
    expect(tp.leader).not.toBeNull()
    expect(pointInPolygon(a.pieces[0], tp.leader![0])).toBe(true)
    // Moved by hand: the label goes there, the hatch gap with it, and the row keeps it after sorting.
    const moved = setOverride(p, 'shellMut', 0, { label: { dx: 10, dy: 0 } })
    const b = mutAreaOf(moved, 'shellMut', 0)!
    expect(b.moved).toBe(true)
    const vb = toVisual('Horizontal CW', b.at[0], b.at[1])
    const va = toVisual('Horizontal CW', a.at[0], a.at[1])
    expect(vb[0] - va[0]).toBeCloseTo(10, 9)
    const label = buildDrawing(moved).labels.find((l) => l.key === 'shellMut:0')!
    expect(label.moved).toBe(true)
    expect(label.x).toBeCloseTo(b.at[0], 9)
    const sorted = { ...moved, shellMut: [mut('A0', null, 1, 1), ...moved.shellMut] }
    expect(mutAreaOf(sorted, 'shellMut', 1)!.moved).toBe(true)
  })

  it('Min T goes under the ID when the setting is on', () => {
    const base = shell('Vertical', { shellMut: [{ ...mut('M1', square(10, 10, 30)), minT: 0.25 }] })
    const on = { ...base, settings: { ...base.settings, showMutMinT: true } }
    const texts = (p: Project) => buildDrawing(p).items.find((i) => i.key === 'shellMut:0')!.shapes.filter((s) => s.t === 'text').map((s) => s.t === 'text' && s.text)
    expect(texts(base)).toEqual(['M1'])
    expect(texts(on)).toEqual(['M1', 'MIN T 0.25'])
  })
})

describe('MUT areas on the heads', () => {
  for (const o of ORIENTATIONS) {
    it(`stay on their head, in both heads (${o})`, () => {
      const base = shell(o)
      const p: Project = { ...base, settings: { ...base.settings, headViewMode: 'BOTH' }, headMut: [headMut('H1', 'HEAD 1', square(0.2, 0.2, 0.4)), headMut('H2', 'HEAD 2', square(-0.6, -0.6, 0.4))] }
      for (const [i, head] of [[0, 'HEAD 1'], [1, 'HEAD 2']] as const) {
        const f = headFrame(p, head)!
        const a = mutAreaOf(p, 'headMut', i)!
        const c = toVisual(o, f.c[0], f.c[1])
        // Stored (u, v) = right and up from the head's center as the drawing reads, in head radii.
        const frame = areaFrame(p, { kind: 'head', head })!
        const corner = p.headMut[i].area![0]
        const v = frame.toVisual(corner)
        expect(v[0] - c[0]).toBeCloseTo(corner[0] * f.r, 9)
        expect(v[1] - c[1]).toBeCloseTo(corner[1] * f.r, 9)
        expect(frame.toStored(v)).toEqual(corner)
        for (const q of a.pieces[0]) expect(Math.hypot(q[0] - f.c[0], q[1] - f.c[1])).toBeLessThan(f.r)
        expect(a.coverageArea).toBe(0)
      }
    })
  }

  it('stay put when the right panel moves (a bigger legend)', () => {
    const base = shell('Vertical', { headMut: [headMut('H1', 'HEAD 1', square(0.2, 0.2, 0.4))] })
    const big = { ...base, settings: { ...base.settings, legendTextSize: 'Scale', legendTextScale: 2 } } as Project
    const a = mutAreaOf(base, 'headMut', 0)!
    const b = mutAreaOf(big, 'headMut', 0)!
    const fa = headFrame(base, 'HEAD 1')!
    const fb = headFrame(big, 'HEAD 1')!
    expect(fb.c[1]).toBeGreaterThan(fa.c[1])
    expect(a.pieces[0][0][0] - fa.c[0]).toBeCloseTo(b.pieces[0][0][0] - fb.c[0], 9)
    expect(a.pieces[0][0][1] - fa.c[1]).toBeCloseTo(b.pieces[0][0][1] - fb.c[1], 9)
  })

  it('size is measured on a circle of the shell diameter', () => {
    const p = shell('Vertical', { headMut: [headMut('H1', 'HEAD 1', square(0, 0, 1))] })
    const R = 200 / Math.PI / 2
    expect(mutAreaSize(p, 'headMut', p.headMut[0])).toEqual({ sqIn: R * R, approx: true })
  })
})

describe('pick inside on a job', () => {
  it('finds the space between welds, seams and scan edges as the drawing reads, and says null in the open', () => {
    for (const o of ORIENTATIONS) {
      const base = shell(o)
      const p: Project = {
        ...base,
        circWelds: [{ id: 'C1', y: 60, include: true, showLabel: false }],
        longSeams: [{ id: 'L1', x: 100, startY: null, stopY: null, include: true, showLabel: false }],
        scans: [{ id: 'S1', xStart: 20, xStop: 60, yStart: 0, yStop: 30, include: true, noWrap: false, acrossSeam: false }],
      }
      const frame = areaFrame(p, { kind: 'shell' })!
      const found = pickInside(p, { kind: 'shell' }, toVisual(o, 50, 45))!
      const stored = found.map((q) => frame.toStored(q))
      // Between X 0..100 and Y 0..60, minus the scan's corner block: 6000 - 40 x 30.
      expect(polygonArea(stored)).toBeCloseTo(6000 - 1200, 3)
      // On a head nothing is drawn yet (no head views): null.
      expect(pickInside(p, { kind: 'head', head: 'HEAD 1' }, [0, 0])).toBeNull()
    }
  })
})

describe('stored areas', () => {
  it('a format 5 file opens with no areas; areas survive saving and opening', () => {
    const p = shell('Vertical', { shellMut: [mut('M1', square(1, 2, 3))] })
    const raw = JSON.parse(saveProject(p))
    raw.schemaVersion = 5
    delete raw.shellMut[0].area
    const old = openProject(JSON.stringify(raw))
    expect(old.ok && old.migratedFrom).toBe(5)
    expect(old.ok && old.project.shellMut[0].area).toBeNull()
    const again = openProject(saveProject(p))
    expect(again.ok && again.project.shellMut[0].area).toEqual(square(1, 2, 3))
  })

  it('bad areas get Review warnings and still save', () => {
    const p = shell('Vertical', {
      shellMut: [mut('A', [[1, 1], [2, 2]]), mut('B', [[0, 0], [10, 10], [10, 0], [0, 10]]), mut('C', square(10, 110, 20))],
      headMut: [headMut('H', 'HEAD 1', square(0.5, 0.5, 1))],
    })
    const texts = mutAreaProblems(p).map((x) => `${x.id}: ${x.text}`)
    expect(texts.some((t) => t.startsWith('A: The MUT area has 2 corners'))).toBe(true)
    expect(texts.some((t) => t.startsWith('B:') && t.includes('crosses itself'))).toBe(true)
    expect(texts.some((t) => t.startsWith('C:') && t.includes('off the shell'))).toBe(true)
    expect(texts.some((t) => t.startsWith('H:') && t.includes('outside the head'))).toBe(true)
    const warnings = checkProject(p).filter((c) => c.place.kind === 'row' && c.place.field === 'area')
    expect(warnings.length).toBe(4)
    expect(warnings.every((c) => c.severity === 'warning')).toBe(true)
    expect(() => saveProject(p)).not.toThrow()
    expect(() => buildDrawing(p)).not.toThrow()
    // Off the shell: only the part on the shell is drawn.
    expect(polygonArea(mutAreaOf(p, 'shellMut', 2)!.pieces[0])).toBeCloseTo(200, 9)
  })

  it('area sizes read plainly', () => {
    expect(formatAreaSize(84)).toBe('84 sq in')
    expect(formatAreaSize(1230)).toBe('1,230 sq in (8.5 sq ft)')
    expect(areaCenter(square(0, 0, 10))).toEqual([5, 5])
  })
})

describe('the .lsp backup', () => {
  it('draws areas with plain lines and SL_Text in the app output only; balanced; v5.0 unchanged', () => {
    const p = shell('Horizontal CCW', {
      shellMut: [mut('M1', square(10, 10, 20), 20, 20)],
      headMut: [headMut('H1', 'HEAD 1', square(-0.3, -0.3, 0.6))],
    })
    const app = lsp(p)
    expect(app).toContain(';; MUT area M1 (drawn in AxisBuilder)')
    expect(app).toContain(';; MUT area H1 (drawn in AxisBuilder)')
    expect(app).toMatch(/\(foreach s '\(\(.*\)\) \(SL_Line \(car s\) \(cadr s\) \(caddr s\) \(cadddr s\) "MANUAL_UT_HATCH"\)\)/)
    expect(app).toContain('(cadddr s) "MANUAL_UT"))')
    expect(app).toContain('(SL_Layer "MANUAL_UT" 7)')
    expect(lsp(shell())).not.toContain('MANUAL_UT"')
    expect(app).toContain('"M1" "SHELL_MUT_TEXT")')
    expect(app).not.toMatch(/SL_MUTPoint [0-9.]+ [0-9.]+ "M1"/)
    expect(app).not.toMatch(/SL_HeadMUT .* "H1" "MUT_TEXT"/)
    expect(balanced(app)).toBe(true)
    expect(app).not.toMatch(/command "_?-?(B)?HATCH"/)
    const v5 = lsp(p, true)
    expect(v5).not.toContain('MUT area')
    expect(v5).toMatch(/SL_MUTPoint [0-9.]+ [0-9.]+ "M1"/)
  })
})

describe('automatic nozzle labels keep clear of MUT areas', () => {
  const box = (l: { tx: number; ty: number; tw: number; sh: number }) => [l.tx - l.tw / 2, l.ty - l.sh / 2, l.tx + l.tw / 2, l.ty + l.sh / 2]
  const overlaps = (b: number[], x0: number, y0: number, x1: number, y1: number) => b[0] < x1 && b[2] > x0 && b[1] < y1 && b[3] > y0
  const nozzle = (id: string, x: number, y: number) => ({ id, diameter: 2, x, y, minT: null, notes: '', include: true, labelMode: 'OUTSIDE' as const, noWrap: false })

  it('a label outside its area stays off it; a nozzle inside an area may keep its label there; golden-style jobs without areas are unchanged', () => {
    for (const o of ORIENTATIONS) {
      // A big area all round the nozzle's right, above and below: the label must find the free side.
      const base = shell(o, { shellNozzles: [nozzle('N1', 100, 60)] })
      const without = buildDrawing(base).labels.find((l) => l.key === 'shellNozzles:0')!.nozzle!
      const area: [number, number][] = [[103, 20], [160, 20], [160, 100], [103, 100]]
      const blockAt = (x0: number, y0: number, x1: number, y1: number): Project => ({ ...base, shellMut: [mut('MB', [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], (x0 + x1) / 2, (y0 + y1) / 2)] })
      // Put the area where the label went without it.
      const b = box(without)
      const p = blockAt(b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1)
      const l = buildDrawing(p).labels.find((x) => x.key === 'shellNozzles:0')!.nozzle!
      expect(overlaps(box(l), b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1)).toBe(false)
      expect(l.crowded).toBeUndefined()
      // Inside an area: no crowding warning about that area.
      const inside = { ...base, shellMut: [mut('MI', area, 120, 60)], shellNozzles: [nozzle('N1', 130, 60)] }
      const li = buildDrawing(inside).labels.find((x) => x.key === 'shellNozzles:0')!.nozzle!
      expect(li.crowded ?? '').not.toContain('MUT area MI')
    }
  })
})

describe('head areas along the head edge', () => {
  it('an edge between two corners on the head edge follows the circle the shorter way; a corner inside keeps it straight', () => {
    const quarter = headOutline([[0, 0], [1, 0], [0, 1]])
    expect(quarter.length).toBeGreaterThan(20)
    for (const q of quarter.slice(1)) expect(Math.hypot(q[0], q[1])).toBeCloseTo(1, 9)
    // A quarter disc: pi / 4 (to the 3-degree steps).
    expect(polygonArea(quarter)).toBeCloseTo(Math.PI / 4, 2)
    expect(headOutline([[0, 0], [0.99, 0], [0, 1]])).toHaveLength(3)
    // The size in the Area column follows the curve too.
    const p = shell('Vertical', { headMut: [headMut('H', 'HEAD 1', [[0, 0], [1, 0], [0, 1]])] })
    const R = 200 / Math.PI / 2
    expect(mutAreaSize(p, 'headMut', p.headMut[0])!.sqIn).toBeCloseTo((Math.PI / 4) * R * R, 0)
    expect(polygonArea(mutAreaOf(p, 'headMut', 0)!.pieces[0])).toBeGreaterThan(polygonArea([[0, 0], [1, 0], [0, 1]]) * 1.5 * (headFrame(p, 'HEAD 1')!.r ** 2))
  })

  it('a picked outline with many corners along the edge keeps a few, and is drawn the same', () => {
    const many: [number, number][] = [[0, 0]]
    for (let a = 0; a <= 180; a += 5) many.push([Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)])
    const few = compactRim(many)
    expect(few.length).toBeLessThan(8)
    expect(polygonArea(headOutline(few))).toBeCloseTo(Math.PI / 2, 2)
  })
})
