// Leaders and arrowheads (Phase 5a, engine/leaders.ts): the shapes, closed arrowheads, label clearance with every shape,
// the same shapes in the sheet model / PDF / .lsp, and compat v5.0 unchanged.

import { describe, expect, it } from 'vitest'
import type { Project } from '../../src/data/schema.ts'
import { buildDrawing, type Shape } from '../../src/engine/drawing.ts'
import { headNozzleLabels, shellNozzleLabels, textBox, type NozzleLabel } from '../../src/engine/labels.ts'
import { drawnScans, panelOf } from '../../src/engine/layout.ts'
import {
  CURVE_STEPS, LEADER_GAP, arrowheadParts, dotPolygon, elbowSpot, leaderParts, leaderStyle, pathHitsBox, pathsCross, type Box, type Pt,
} from '../../src/engine/leaders.ts'
import { drawSteps, mainSheet } from '../../src/engine/sheetModel.ts'
import { readableRot, toVisual, type Orientation } from '../../src/engine/transform.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'
import { jobPdf, goldenJobs } from '../export/pdfJobs.ts'
import { PDFArray, PDFDocument, PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib'

const ORIENTATIONS: Orientation[] = ['Vertical', 'Horizontal CW', 'Horizontal CCW']
const OPTIONS = { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5) }

function job(settings: Record<string, unknown> = {}, orientation: Orientation = 'Vertical'): Project {
  const p = sampleProject()
  return {
    ...p,
    vessel: { ...p.vessel, orientation },
    shellNozzles: p.shellNozzles.map((n) => ({ ...n, labelMode: 'OUTSIDE' })),
    headNozzles: p.headNozzles.map((n) => ({ ...n, labelMode: 'OUTSIDE' })),
    settings: { ...p.settings, ...settings } as Project['settings'],
  }
}

const vis = (o: Orientation, q: Pt): Pt => toVisual(o, q[0], q[1])

/** Label text width as labels.ts estimates it (characters x 0.6 x height), for the sample's nozzle text sizes. */
function textWidth(l: NozzleLabel, h: number) {
  return Math.max(1, l.txt.length) * h * 0.6
}

describe('leader shapes', () => {
  it('Elbow: the landing is horizontal as the drawing reads, in every orientation, and the label is centred on it', () => {
    for (const o of ORIENTATIONS) {
      const p = job({ leaderShape: 'Elbow', leaderLandingLength: 2 }, o)
      const { panel, headDia } = panelOf(p)
      const labels = [...shellNozzleLabels(p, drawnScans(p)).values(), ...headNozzleLabels(p, panel, headDia).values()].filter((l) => l.leader)
      expect(labels.length).toBeGreaterThanOrEqual(3)
      for (const l of labels) {
        const pts = l.leader!.map((q) => vis(o, q))
        const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]]
        // The landing is horizontal and 2 in long (a flat leader is one straight horizontal line).
        expect(b[1]).toBeCloseTo(a[1], 6)
        if (pts.length === 3) expect(Math.abs(b[0] - a[0])).toBeCloseTo(2, 6)
        else expect(Math.abs(b[0] - a[0])).toBeGreaterThan(2)
        // The label's centre is at the landing's height, on the side the landing runs to, its near edge a gap past the end.
        const c = vis(o, [l.tx, l.ty])
        expect(c[1]).toBeCloseTo(b[1], 6)
        const side = Math.sign(b[0] - a[0])
        expect(Math.sign(c[0] - b[0])).toBe(side)
        const sh = l.th
        expect(Math.abs(c[0] - b[0])).toBeGreaterThan(textWidth(l, sh * 0.5) / 2)
        // It starts on the nozzle's edge.
        expect(Math.hypot(l.leader![0][0] - l.x, l.leader![0][1] - l.y)).toBeCloseTo(l.r, 6)
      }
    }
  })

  it('elbowSpot: angled segment, landing, then the label gap and half its width', () => {
    for (const o of ORIENTATIONS) {
      const n: Pt = [100, 50]
      const dir: Pt = [Math.SQRT1_2, Math.SQRT1_2]
      const sp = elbowSpot(o, n, 3, dir, 4, 2, 0.5, 6)
      const v = sp.path.map((q) => vis(o, q))
      const nv = vis(o, n)
      expect(v).toHaveLength(3)
      expect(v[0][0]).toBeCloseTo(nv[0] + 3 * dir[0], 9)
      expect(v[0][1]).toBeCloseTo(nv[1] + 3 * dir[1], 9)
      expect(Math.hypot(v[1][0] - v[0][0], v[1][1] - v[0][1])).toBeCloseTo(4, 9)
      expect(v[2][0] - v[1][0]).toBeCloseTo(2, 9)
      expect(v[2][1]).toBeCloseTo(v[1][1], 9)
      const c = vis(o, [sp.tx, sp.ty])
      expect(c[0]).toBeCloseTo(v[2][0] + 0.5 + 3, 9)
      expect(c[1]).toBeCloseTo(v[2][1], 9)
    }
    // Pointing left, the landing and the label go left.
    const left = elbowSpot('Vertical', [0, 0], 1, [-Math.SQRT1_2, Math.SQRT1_2], 4, 2, 0.5, 6)
    expect(left.tx).toBeLessThan(left.path[2][0])
  })

  it('Straight: one segment from the circle edge, ending a gap short of the label box', () => {
    for (const o of ORIENTATIONS) {
      const p = job({ leaderShape: 'Straight' }, o)
      for (const l of shellNozzleLabels(p, drawnScans(p)).values()) {
        if (!l.leader) continue
        expect(l.leader).toHaveLength(2)
        const end = vis(o, l.leader[1])
        const c = vis(o, [l.tx, l.ty])
        const sh = l.th
        const hw = textWidth(l, sh) / 2
        // On the box grown by the gap, never inside the label.
        const gx = Math.abs(end[0] - c[0]) - (hw + sh * LEADER_GAP)
        const gy = Math.abs(end[1] - c[1]) - (sh / 2 + sh * LEADER_GAP)
        expect(Math.max(gx, gy)).toBeCloseTo(0, 6)
      }
    }
  })

  it('Curved: a smooth polyline from the circle edge, leaving along the radius, entering the label horizontally', () => {
    for (const o of ORIENTATIONS) {
      const p = job({ leaderShape: 'Curved' }, o)
      for (const l of shellNozzleLabels(p, drawnScans(p)).values()) {
        if (!l.leader) continue
        expect(l.leader).toHaveLength(CURVE_STEPS + 1)
        const v = l.leader.map((q) => vis(o, q))
        expect(Math.hypot(l.leader[0][0] - l.x, l.leader[0][1] - l.y)).toBeCloseTo(l.r, 6)
        // Smooth: the angle between neighbouring segments stays small.
        const ang = (a: Pt, b: Pt) => Math.atan2(b[1] - a[1], b[0] - a[0])
        for (let i = 2; i < v.length; i++) {
          const d = Math.abs(ang(v[i - 1], v[i]) - ang(v[i - 2], v[i - 1]))
          expect(Math.min(d, 2 * Math.PI - d)).toBeLessThan(0.7)
        }
        // The last segment is nearly horizontal and ends level with the label's centre.
        const [a, b] = [v[v.length - 2], v[v.length - 1]]
        expect(Math.abs(b[1] - a[1])).toBeLessThan(0.35 * Math.abs(b[0] - a[0]) + 1e-6)
        expect(b[1]).toBeCloseTo(vis(o, [l.tx, l.ty])[1], 6)
      }
    }
  })
})

describe('arrowheads', () => {
  const tip: Pt = [10, 5]
  it('Closed filled: a solid triangle whose point is the tip, 0.5 as wide as it is long', () => {
    const [part] = arrowheadParts('Closed filled', 2, tip, [1, 0])
    expect(part.k).toBe('fill')
    const pts = (part as { pts: Pt[] }).pts
    expect(pts[0]).toEqual(tip)
    expect(pts[1][0]).toBeCloseTo(8)
    expect(pts[2][0]).toBeCloseTo(8)
    expect(Math.abs(pts[1][1] - pts[2][1])).toBeCloseTo(1)
  })
  it('Open is v5.0\'s two lines (0.55 half width), Dot is a filled polygon, None is nothing', () => {
    const [open] = arrowheadParts('Open', 2, tip, [1, 0])
    expect(open).toEqual({ k: 'line', pts: [[8, 5 - 1.1], tip, [8, 5 + 1.1]] })
    const [dot] = arrowheadParts('Dot', 2, tip, [1, 0])
    expect(dot).toEqual({ k: 'dot', c: tip, d: 1 })
    expect(dotPolygon(tip, 1)).toHaveLength(16)
    expect(arrowheadParts('None', 2, tip, [1, 0])).toEqual([])
  })
  it('the leader ends in the head, pointing into the nozzle', () => {
    const parts = leaderParts([[0, 0], [3, 3], [5, 3]], leaderStyle(job().settings))
    expect(parts.map((q) => q.k)).toEqual(['line', 'fill'])
    const head = parts[1] as { pts: Pt[] }
    expect(head.pts[0]).toEqual([0, 0])
    // The base is further along the leader, not behind the tip.
    expect(head.pts[1][0] + head.pts[2][0]).toBeGreaterThan(0)
  })
  it('the drawing: every nozzle leader has a filled head by default; the X and Y direction arrows too', () => {
    const d = buildDrawing(job())
    const fills = (layer: string) => d.items.flatMap((i) => i.shapes).filter((s): s is Extract<Shape, { t: 'poly' }> => s.t === 'poly' && s.fill && s.layer === layer)
    const leaders = d.items.flatMap((i) => i.shapes).filter((s) => s.t === 'poly' && !s.fill && s.layer === 'NOZZLE_LEADERS')
    expect(leaders.length).toBeGreaterThan(0)
    expect(fills('NOZZLE_LEADERS')).toHaveLength(leaders.length)
    expect(fills('HEAD_NOZZLE_LEADERS').length).toBeGreaterThan(0)
    expect(fills('X_AXIS')).toHaveLength(1)
    expect(fills('Y_AXIS')).toHaveLength(1)
    // Open keeps the old three lines on the direction arrows; None draws only the shaft.
    const open = buildDrawing(job({ arrowheadStyle: 'Open' }))
    expect(open.items.flatMap((i) => i.shapes).filter((s) => s.t === 'poly' && s.fill && s.layer === 'X_AXIS')).toHaveLength(0)
    const none = buildDrawing(job({ arrowheadStyle: 'None' }))
    expect(none.items.flatMap((i) => i.shapes).filter((s) => s.t === 'poly' && s.layer === 'NOZZLE_LEADERS')).toHaveLength(leaders.length)
  })
  it('across the seam: the wrapped nozzle\'s leader has the same head', () => {
    const p = job()
    const wrapped: Project = { ...p, shellNozzles: p.shellNozzles.map((n, i) => (i === 1 ? { ...n, x: 0, y: 100, diameter: 6, labelMode: 'INSIDE' as const } : n)) }
    const items = buildDrawing(wrapped).items.find((i) => i.key === 'shellNozzles:1')!
    expect(items.shapes.some((s) => s.t === 'arc')).toBe(true)
    expect(items.shapes.some((s) => s.t === 'poly' && s.fill)).toBe(true)
  })
})

describe('label clearance with every shape', () => {
  const boxOf = (...v: number[]): Box => [v[0], v[1], v[2], v[3]]

  it('no label overlaps a scan, an object or another label in the golden jobs, with any shape', () => {
    for (const { name, project } of goldenJobs()) {
      for (const shape of ['Straight', 'Elbow', 'Curved']) {
        const p: Project = { ...project, settings: { ...project.settings, leaderShape: shape } as Project['settings'] }
        const scans = drawnScans(p)
        const labels = [...shellNozzleLabels(p, scans).values()].filter((l) => l.leader && !l.crowded)
        const rects: [string, Box][] = [
          ...scans.filter((s) => s.include && s.xStart !== null && s.xStop !== null && s.yStart !== null && s.yStop !== null)
            .map((s): [string, Box] => [`scan ${s.id}`, boxOf(Math.min(s.xStart!, s.xStop!), Math.min(s.yStart!, s.yStop!), Math.max(s.xStart!, s.xStop!), Math.max(s.yStart!, s.yStop!))]),
          ...p.objects.filter((o) => o.include && o.x !== null && o.y !== null && o.circWidth !== null && o.length !== null)
            .map((o): [string, Box] => [`object ${o.id}`, boxOf(o.x!, o.y!, o.x! + o.circWidth!, o.y! + o.length!)]),
        ]
        const lr = readableRot(p.vessel.orientation as Orientation)
        const boxes = labels.map((l) => textBox(l.tx, l.ty, textWidth(l, l.th), l.th, lr))
        boxes.forEach((b, i) => {
          for (const [what, r] of rects) {
            const hit = !(b[2] <= r[0] || b[0] >= r[2] || b[3] <= r[1] || b[1] >= r[3])
            expect(hit, `${name} ${shape}: label ${labels[i].txt} on ${what}`).toBe(false)
          }
          boxes.forEach((c, j) => {
            if (i < j) expect(!(b[2] <= c[0] || b[0] >= c[2] || b[3] <= c[1] || b[1] >= c[3]), `${name} ${shape}: labels ${labels[i].txt} and ${labels[j].txt}`).toBe(false)
          })
        })
      }
    }
  })

  it('the landing counts: a scan under the landing (but not under the label) moves the label elsewhere', () => {
    const p0 = job({ leaderShape: 'Elbow', generateOverlayDrawing: false }, 'Vertical')
    const n = { ...p0.shellNozzles[1], x: 50, y: 100, diameter: 4, labelMode: 'OUTSIDE' as const }
    const base: Project = { ...p0, scans: [], objects: [], shellNozzles: p0.shellNozzles.map((x, i) => (i === 1 ? n : x)) }
    const first = shellNozzleLabels(base, drawnScans(base)).get(1)!
    // The first spot is up and to the right: segment from the edge, then a 2 in landing.
    const landing = first.leader!.slice(-2)
    const mid = (landing[0][0] + landing[1][0]) / 2
    const strip: Box = [mid - 0.3, landing[0][1] - 1, mid + 0.3, landing[0][1] + 1]
    const blocked: Project = { ...base, scans: [{ id: 'S', xStart: strip[0], xStop: strip[2], yStart: strip[1], yStop: strip[3], include: true, noWrap: false, acrossSeam: false }] }
    const l = shellNozzleLabels(blocked, drawnScans(blocked)).get(1)!
    expect(l.crowded).toBeUndefined()
    expect(pathHitsBox(l.leader!, strip)).toBe(false)
    expect(l.leader).not.toEqual(first.leader)
    // The label itself was never on the strip, so only the landing made the difference.
    const lr = readableRot('Vertical')
    const tb = textBox(first.tx, first.ty, textWidth(first, first.th), first.th, lr)
    expect(!(tb[2] <= strip[0] || tb[0] >= strip[2] || tb[3] <= strip[1] || tb[1] >= strip[3])).toBe(false)
  })

  it('leaders do not cross each other (when a clear spot exists)', () => {
    const p = job({ leaderShape: 'Elbow' })
    const labels = [...shellNozzleLabels(p, drawnScans(p)).values()].filter((l) => l.leader && !l.crowded)
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) expect(pathsCross(labels[i].leader!, labels[j].leader!)).toBe(false)
  })
})

describe('the same shapes everywhere', () => {
  it('sheet model: arrowheads are filled polygons; drawSteps keeps them apart from plain lines', () => {
    const p = job()
    const m = mainSheet(p, buildDrawing(p))
    const polys = m.drawing.filter((x) => x.t === 'poly')
    expect(polys.some((x) => x.t === 'poly' && x.fill)).toBe(true)
    const steps = drawSteps(m.drawing).filter((s) => s.kind === 'path')
    expect(steps.some((s) => s.kind === 'path' && s.fill && s.ops.at(-1)![0] === 'Z')).toBe(true)
  })

  it('PDF: filled heads are filled and stroked (the "B" operator)', async () => {
    const r = await jobPdf(goldenJobs()[0].project)
    const page = (await PDFDocument.load(r.bytes)).getPages()[0]
    const c = page.node.Contents()
    const streams = c instanceof PDFArray ? c.asArray().map((x) => page.doc.context.lookup(x) as PDFStream) : c ? [c] : []
    const text = streams.map((s) => new TextDecoder('latin1').decode(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents())).join('\n')
    expect(text).toMatch(/\nB\n/)
  })

  it('.lsp: the leader parts, the head style and the entity writers; none of it in compat v5.0', () => {
    const p = job({ leaderShape: 'Elbow' })
    const app = exportLsp(p, OPTIONS)
    expect(app).toContain('(setq SL_ARROW_STYLE "Closed filled")')
    expect(app).toMatch(/\(SL_NozzleAt [^\n]*\(list \(list "L" \(list [^\n]* \(list "F" /)
    expect(app).toContain('(defun SL_ArrowSolid (tip b1 b2 layer')
    expect(app).toContain('(defun SL_Arrow (x1 y1 x2 y2 layer / dx dy len)')
    expect(exportLsp(job({ arrowheadStyle: 'Dot' }), OPTIONS)).toMatch(/\(list "D" \(list /)
    expect(exportLsp(job({ arrowheadStyle: 'None' }), OPTIONS)).not.toMatch(/\(list "[FD]" /)
    const v5 = exportLsp(p, { ...OPTIONS, compat: 'v5.0' })
    for (const word of ['SL_ARROW_STYLE', 'SL_PolyMake', 'SL_ArrowHead', 'SL_LeaderPart']) expect(v5).not.toContain(word)
  })

  it('the elbow, curved and straight leaders each write their points to the .lsp', () => {
    const count = (shape: string) => {
      const lsp = exportLsp(job({ leaderShape: shape, arrowheadStyle: 'None' }), OPTIONS)
      const calls = lsp.split('\n').filter((l) => l.startsWith('  (SL_NozzleAt ') && l.includes('(list "L"'))
      return calls.map((l) => (l.match(/\(list "L"((?: \(list [^()]*\))+)\)/)?.[1].match(/\(list /g) ?? []).length)
    }
    expect(Math.max(...count('Straight'))).toBe(2)
    expect(Math.max(...count('Elbow'))).toBe(3)
    expect(Math.max(...count('Curved'))).toBe(CURVE_STEPS + 1)
  })
})

describe('direction arrow length', () => {
  const shaftLengths = (p: Project, axis: 'X' | 'Y') => {
    const it = buildDrawing(p).items.find((i) => i.key === `ruler:${axis}_AXIS`)!
    return it.shapes.filter((s): s is Extract<Shape, { t: 'line' }> => s.t === 'line').map((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1))
  }
  it('Automatic keeps the wording-based length; Fixed sets each axis on its own', () => {
    const auto = job()
    const fixed = job({ xArrowLengthMode: 'Fixed', xArrowLength: 41, yArrowLengthMode: 'Fixed', yArrowLength: 23 })
    expect(shaftLengths(auto, 'X')).not.toContain(41)
    for (const [axis, len] of [['X', 41], ['Y', 23]] as const) expect(shaftLengths(fixed, axis).some((l) => Math.abs(l - len) < 1e-9)).toBe(true)
    // Only X fixed: Y unchanged.
    const onlyX = job({ xArrowLengthMode: 'Fixed', xArrowLength: 41 })
    expect(shaftLengths(onlyX, 'Y')).toEqual(shaftLengths(auto, 'Y'))
  })
  it('.lsp: written for each axis, patched into all nine ruler functions, never in compat v5.0', () => {
    const app = exportLsp(job({ xArrowLengthMode: 'Fixed', xArrowLength: 41 }), OPTIONS)
    expect(app).toContain('(setq SL_X_ARROW_LEN 41.)')
    expect(app).toContain('(setq SL_Y_ARROW_LEN nil)')
    expect(app.match(/\(setq arrLen \(SL_DirectionArrowLength label layer\)\)/g)).toHaveLength(9)
    const v5 = exportLsp(job(), { ...OPTIONS, compat: 'v5.0' })
    expect(v5).not.toContain('SL_DirectionArrowLength')
  })
})

describe('the app .lsp functions DraftSight must know', () => {
  it('the leader and arrow code uses no mapcar, lambda or distance (DraftSight stopped with "No function" on them)', () => {
    const app = exportLsp(job(), OPTIONS)
    const mine = app.slice(app.indexOf('(defun SL_PolyMake'), app.indexOf('(defun SL_LeaderLayer'))
    expect(mine.length).toBeGreaterThan(500)
    for (const word of ['mapcar', 'lambda', 'distance']) expect(mine).not.toContain(word)
  })
})
