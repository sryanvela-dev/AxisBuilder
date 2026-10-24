// Wrapping across the circumference seam (Phase 3f-2): pieces, labels, nozzle arcs, the .lsp, coverage,
// photo split, CSV import, and that NOZZLEWRAP / OBJECTWRAP find nothing to do on what the app drew.

import { describe, expect, it } from 'vitest'
import { importAutCsv } from '../../src/data/autCsvImport.ts'
import type { Project, Scan } from '../../src/data/schema.ts'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { countedScans, coveragePercent, drawnScans, imageInserts } from '../../src/engine/layout.ts'
import { shellNozzleLabels } from '../../src/engine/labels.ts'
import { circlePieces, labelPieceIndex, normalizeX, objectPieces, scanPieces, wrapSpan } from '../../src/engine/wrap.ts'
import { wrapNote } from '../../src/engine/wrapNotes.ts'
import { cropSource, excelSize, fitSize } from '../../src/export/images/fit.ts'
import { planProcessing } from '../../src/export/images/process.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'

const C = 302
const OPTIONS = { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5) }
const scan = (id: string, xStart: number, xStop: number, extra: Partial<Scan> = {}): Scan =>
  ({ id, xStart, xStop, yStart: 0, yStop: 20, include: true, noWrap: false, acrossSeam: false, ...extra })

/** The sample job on a 302 in circumference, with the given scans (photos linked as SCAN.png). */
function job(scans: Scan[], change: (p: Project) => Project = (p) => p): Project {
  const p = sampleProject()
  return change({
    ...p,
    vessel: { ...p.vessel, height: C },
    scans,
    scanImages: scans.map((s) => ({ scanId: s.id, imageFile: `${s.id}.png`, processedImage: '', include: true })),
  })
}

describe('wrapSpan', () => {
  it('leaves an item inside the shell alone', () => {
    expect(wrapSpan(10, 30, C)).toEqual([{ x0: 10, x1: 30, from: 0, to: 1 }])
  })
  it('splits an item running past X = circumference into two pieces, one at each edge', () => {
    expect(wrapSpan(290, 310, C)).toEqual([{ x0: 290, x1: 302, from: 0, to: 0.6 }, { x0: 0, x1: 8, from: 0.6, to: 1 }])
  })
  it('splits an item starting below 0', () => {
    expect(wrapSpan(-5, 15, C)).toEqual([{ x0: 297, x1: 302, from: 0, to: 0.25 }, { x0: 0, x1: 15, from: 0.25, to: 1 }])
  })
  it('exactly on the edge is not wrapped', () => {
    expect(wrapSpan(280, 302, C)).toEqual([{ x0: 280, x1: 302, from: 0, to: 1 }])
    expect(wrapSpan(0, 10, C)).toEqual([{ x0: 0, x1: 10, from: 0, to: 1 }])
  })
  it('moves an item typed wholly past the seam back by one circumference', () => {
    expect(wrapSpan(305, 315, C)).toEqual([{ x0: 3, x1: 13, from: 0, to: 1 }])
  })
  it("can't wrap an item as wide as the shell or wider", () => {
    expect(wrapSpan(-10, 300, C)).toEqual([{ x0: -10, x1: 300, from: 0, to: 1 }])
  })
  it('labels the larger piece; an equal split goes to the piece it starts in', () => {
    expect(labelPieceIndex(wrapSpan(290, 310, C))).toBe(0)
    expect(labelPieceIndex(wrapSpan(298, 318, C))).toBe(1)
    expect(labelPieceIndex(wrapSpan(292, 312, C))).toBe(0)
  })
})

describe('nozzle circles', () => {
  it('a circle centered on the seam is two half circles, one at each edge', () => {
    expect(circlePieces(0, 50, 3, C)).toEqual([
      { cx: 0, cy: 50, r: 3, arc: [-90, 90] },
      { cx: 302, cy: 50, r: 3, arc: [90, 270] },
    ])
  })
  it('wraps when the circle overlaps the edge, not only when its center is on it', () => {
    const pieces = circlePieces(300, 50, 4, C)
    expect(pieces).toHaveLength(2)
    expect(pieces[0]).toMatchObject({ cx: 300 })
    expect(pieces[1]).toMatchObject({ cx: -2 })
    expect(pieces[0].arc![0]).toBeCloseTo(60, 6) // cos 60 = 2/4: the arc inside X = 302
  })
  it('a circle just touching the edge, or inside, is whole', () => {
    expect(circlePieces(4, 50, 4, C)).toEqual([{ cx: 4, cy: 50, r: 4, arc: null }])
    expect(circlePieces(100, 50, 4, C)).toEqual([{ cx: 100, cy: 50, r: 4, arc: null }])
  })
  it('a nozzle typed past the seam is drawn where it lands', () => {
    expect(normalizeX(305, C)).toBe(3)
    expect(circlePieces(305, 50, 2, C)).toEqual([{ cx: 3, cy: 50, r: 2, arc: null }])
  })
  it("Don't wrap draws the whole circle where typed", () => {
    expect(circlePieces(0, 50, 3, C, true)).toEqual([{ cx: 0, cy: 50, r: 3, arc: null }])
  })
  it('split in half: the label always goes on a leader, starting on the part drawn there', () => {
    const p = job([], (q) => ({ ...q, shellNozzles: [{ ...q.shellNozzles[0], x: 0, y: 100, diameter: 6, labelMode: 'INSIDE' }] }))
    const l = shellNozzleLabels(p, drawnScans(p)).get(0)!
    expect([l.x, l.arcs!.length]).toEqual([0, 2])
    expect(l.leader).not.toBeNull()
    expect(l.leader![0]).toBeGreaterThanOrEqual(0)
    expect(l.tx).toBeGreaterThan(3)
  })
  it('a partial split keeps the label inside the larger part when it fits', () => {
    const p = job([], (q) => ({ ...q, shellNozzles: [{ ...q.shellNozzles[0], id: 'N1', x: 6, y: 100, diameter: 20, labelMode: 'AUTO' }] }))
    const l = shellNozzleLabels(p, drawnScans(p)).get(0)!
    // Drawn part 0..16: the label sits in its middle, inside the circle.
    expect([l.leader, l.tx, l.arcs!.length]).toEqual([null, 8, 2])
  })
})

describe('scans across the seam', () => {
  it('290 to 310 is clearly across the seam and wraps without asking', () => {
    const p = job([scan('S1', 290, 310)])
    expect(scanPieces(drawnScans(p)[0], C)).toHaveLength(2)
    expect(wrapNote(p, 'scans', 0)!.text).toContain('X 290 to 302 and 0 to 8')
  })
  it('past the seam is fine as typed: a note says where it is drawn, with an optional button', () => {
    const p = job([scan('S1', 305, 315)], (q) => ({ ...q, shellNozzles: [{ ...q.shellNozzles[0], x: -2 }], objects: [{ ...q.objects[0], x: 310 }] }))
    expect(wrapNote(p, 'scans', 0)).toEqual({
      text: 'A scan wholly past the seam is fine as typed: it is drawn at X 3 to 13.',
      actions: [{ label: 'Write as 3 to 13', list: 'scans', index: 0, changes: { xStart: 3, xStop: 13 } }],
    })
    expect(wrapNote(p, 'shellNozzles', 0)!.actions).toEqual([{ label: 'Write as 300', list: 'shellNozzles', index: 0, changes: { x: 300 } }])
    expect(wrapNote(p, 'objects', 0)).toEqual({
      text: 'An X position past the seam is fine as typed: it is drawn at X 8.',
      actions: [{ label: 'Write as 8', list: 'objects', index: 0, changes: { x: 8 } }],
    })
  })
  it('a reversed scan is drawn swapped until it is marked across the seam', () => {
    expect(drawnScans(job([scan('S1', 290, 8)]))[0]).toMatchObject({ xStart: 8, xStop: 290 })
    const across = job([scan('S1', 290, 8, { acrossSeam: true })])
    expect(drawnScans(across)[0]).toMatchObject({ xStart: 290, xStop: 310 })
    expect(scanPieces(drawnScans(across)[0], C).map((pc) => [pc.x0, pc.x1])).toEqual([[290, 302], [0, 8]])
    // compat v5.0 never wraps and swaps as before
    expect(drawnScans(across, true)[0]).toMatchObject({ xStart: 8, xStop: 290 })
  })
  it('both pieces are hatched, the name goes on the larger one, and each piece gets its part of the photo', () => {
    const p = job([scan('S1', 290, 310)])
    const d = buildDrawing(p)
    const item = d.items.find((i) => i.key === 'scans:0')!
    expect(item.shapes.filter((s) => s.t === 'rect')).toHaveLength(2)
    expect(item.shapes.filter((s) => s.layer === 'AUT_HATCH').length).toBeGreaterThan(2)
    expect(item.shapes.filter((s) => s.t === 'text').map((s) => (s as { text: string }).text)).toEqual(['S1'])
    const inserts = imageInserts(p, drawnScans(p), false)
    expect(inserts).toEqual([
      { scanId: 'S1', piece: 0, crop: [0, 0.6], fileName: 'S1_FIT_A.png', x: 290, y: 0, w: 12, h: 20 },
      { scanId: 'S1', piece: 1, crop: [0.6, 1], fileName: 'S1_FIT_B.png', x: 0, y: 0, w: 8, h: 20 },
    ])
  })
  it('the area counts once in the coverage', () => {
    const wrapped = job([scan('S1', 290, 310)])
    const inside = job([scan('S1', 100, 120)])
    expect(coveragePercent(wrapped, countedScans(wrapped, drawnScans(wrapped), false))).toBeCloseTo(
      coveragePercent(inside, countedScans(inside, drawnScans(inside), false))!, 9)
  })
})

describe('objects across the seam', () => {
  it('two pieces, the ID on the larger one (as OBJECTWRAP)', () => {
    const o = { id: 'MANWAY', x: 437, y: 0, circWidth: 38, length: 30, include: true, notes: '', noWrap: false }
    const pieces = objectPieces(o, 458)
    expect(pieces.map((pc) => [pc.x0, pc.x1])).toEqual([[437, 458], [0, 17]])
    expect(labelPieceIndex(pieces)).toBe(0)
  })
})

describe('the .lsp', () => {
  const p = job([scan('S1', 290, 310), scan('S2', 100, 120)], (q) => ({
    ...q,
    objects: [{ ...q.objects[0], x: 295, circWidth: 20 }],
    shellNozzles: [{ ...q.shellNozzles[0], x: 0, y: 100, diameter: 6 }],
  }))
  const out = exportLsp(p, OPTIONS)
  const lines = out.split('\r\n')

  it('draws the pieces, inserts both photo parts and defines the helpers', () => {
    expect(lines).toContain('  (SL_LabelRect 290. 0. 12. 20. "S1" "SCANS" "AUT_HATCH")')
    expect(lines).toContain('  (SL_WrapPiece 0. 0. 8. 20. "SCANS" "AUT_HATCH")')
    expect(out).toContain('"X:/img/S1_FIT_A.png"')
    expect(out).toContain('"X:/img/S1_FIT_B.png"')
    // The object 295 + 20: 7 in at the right edge, 13 in at X = 0 (the larger piece gets the ID).
    const o = p.objects[0]
    expect(lines).toContain(`  (SL_WrapPiece 295. ${o.y}. 7. ${o.length}. "SUPPORTS" "")`)
    expect(lines).toContain(`  (SL_LabelRect 0. ${o.y}. 13. ${o.length}. "${o.id}" "SUPPORTS" "")`)
    expect(out).toMatch(/\(SL_NozzleArcsAt \(list \(list 0\. 100\. 3\. -90\. 90\.\) \(list 302\. 100\. 3\. 90\. 270\.\)\)/)
    expect(out).toContain('(defun SL_WrapPiece ')
    expect(out).toContain('(defun SL_NozzleArcsAt ')
  })

  it("leaves NOZZLEWRAP and OBJECTWRAP nothing to do: no whole circle centered on an edge, no rectangle crossing one", () => {
    for (const l of lines.filter((x) => /^ {2}\(SL_(LabelRect|WrapPiece) /.test(x))) {
      const [x, , w] = l.split(' ').slice(3, 6).map(Number)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x + w).toBeLessThanOrEqual(C + 0.01)
    }
    for (const n of p.shellNozzles) {
      for (const pc of circlePieces(n.x!, n.y!, n.diameter! / 2, C)) {
        if (pc.arc === null) expect(Math.min(Math.abs(pc.cx), Math.abs(pc.cx - C))).toBeGreaterThan(0.01)
      }
    }
  })

  it('writes no wrap helpers when nothing wraps, and compat v5.0 never wraps', () => {
    const plain = exportLsp(job([scan('S2', 100, 120)]), OPTIONS)
    expect(plain).not.toMatch(/SL_WrapPiece|SL_NozzleArcsAt|SL_ArcAt/)
    expect(exportLsp(p, { ...OPTIONS, compat: 'v5.0' })).not.toMatch(/SL_WrapPiece|SL_NozzleArcsAt|_FIT_A/)
  })
})

describe('photos of scans across the seam', () => {
  it('one job per piece, each with its part of the photo and its own exact shape', () => {
    const p = job([scan('S1', 290, 310)])
    const plan = planProcessing(p, ['S1.png'])
    expect(plan.jobs.map((j) => [j.outName, j.scanW, j.scanH, j.crop])).toEqual([
      ['S1_FIT_A.png', 12, 20, [0, 0.6]],
      ['S1_FIT_B.png', 8, 20, [0.6, 1]],
    ])
  })
  it('the crop and the size: never smaller than the Excel version for the piece', () => {
    expect(cropSource(2000, [0, 0.6])).toEqual({ x: 0, width: 1200 })
    expect(cropSource(2000, [0.6, 1])).toEqual({ x: 1200, width: 800 })
    expect(cropSource(2000, null)).toEqual({ x: 0, width: 2000 })
    const b = fitSize(800, 1000, 8, 20, 4096)
    expect(b.width / b.height).toBeCloseTo(8 / 20, 2)
    expect(b.width).toBeGreaterThanOrEqual(excelSize(8, 20).width)
    expect(b.height).toBeGreaterThanOrEqual(excelSize(8, 20).height)
  })
})

describe('AUT CSV import', () => {
  const csv = 'File Name,X-Start,X-Stop,Y-Start,Y-Stop\nS1,290,310,0,20\nS2,305,320,0,20\nS3,10,30,0,20'
  it('keeps a scan running past the seam (drawn in two pieces) and moves one wholly past it back', () => {
    const r = importAutCsv(csv, { circumference: C })
    expect(r.ok).toBe(true)
    expect(r.scans.map((s) => [s.id, s.xStart, s.xStop])).toEqual([['S1', 290, 310], ['S2', 3, 18], ['S3', 10, 30]])
    expect(r.report.map((e) => `${e.kind}: ${e.message}`)).toEqual([
      'wrapped: Scan S1 runs across the circumference seam; it is drawn in two pieces.',
      'wrapped: Scan S2 is wholly past the circumference seam; read as 3 to 18.',
    ])
  })
  it('without the circumference, imports as before', () => {
    expect(importAutCsv(csv).scans.map((s) => s.xStart)).toEqual([290, 305, 10])
  })
})
