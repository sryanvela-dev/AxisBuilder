// Centered labels sit like CAD's middle-center text (SL_Text, "-TEXT J MC"): the middle of the capitals on the
// point, both across and up the text, at any rotation; middle-left (SL_TextLeft, "ML") starts at the point.
import { expect, it } from 'vitest'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { sheetModels, textGeometry } from '../../src/engine/sheetModel.ts'
import { CAP } from '../../src/engine/textMetrics.ts'
import { buildRenderModel } from '../../src/ui/preview/renderModel.ts'
import { goldenJobs } from '../export/pdfJobs.ts'

/** Middle of the capitals' box: from the baseline start, half the width along the text and half the height up. */
function capMiddle(t: { x: number; y: number; h: number; rot: number; text: string; just: 'MC' | 'ML' }): [number, number] {
  const g = textGeometry(t)
  const r = (t.rot * Math.PI) / 180
  const along = g.width / 2
  const up = t.h / 2
  return [g.start[0] + along * Math.cos(r) - up * Math.sin(r), g.start[1] + along * Math.sin(r) + up * Math.cos(r)]
}

it('puts a centered label box centered on its anchor, at any rotation', () => {
  for (const rot of [0, 90, -90, 180, 37]) {
    const t = { x: 3, y: 4, h: 0.2, rot, text: 'SCAN 12', just: 'MC' as const }
    const [cx, cy] = capMiddle(t)
    expect(cx).toBeCloseTo(3, 9)
    expect(cy).toBeCloseTo(4, 9)
    // Middle-left: the capitals' middle is on the point's line, the text starts at it.
    const l = textGeometry({ ...t, just: 'ML' })
    const r = (rot * Math.PI) / 180
    expect(l.start[0] - 0.1 * Math.sin(r)).toBeCloseTo(3, 9)
    expect(l.start[1] + 0.1 * Math.cos(r)).toBeCloseTo(4, 9)
  }
})

it('centers every middle-center label of every golden job on its anchor (sheets, PDF, report images)', () => {
  for (const { project } of goldenJobs()) {
    const [m] = sheetModels(project, buildDrawing(project), null)
    const texts = m.drawing.filter((x) => x.t === 'text' && x.just === 'MC')
    expect(texts.length).toBeGreaterThan(10)
    for (const t of texts) {
      if (t.t !== 'text') continue
      const [cx, cy] = capMiddle(t)
      expect(cx).toBeCloseTo(t.x, 9)
      expect(cy).toBeCloseTo(t.y, 9)
    }
  }
})

it('places preview labels the same way: font size from the capital height, baseline half the height below', () => {
  for (const { project } of goldenJobs()) {
    const d = buildDrawing(project)
    const model = buildRenderModel(d)
    const heights = d.items.flatMap((i) => i.shapes.flatMap((s) => (s.t === 'text' && s.text !== '' ? [s.h] : [])))
    const texts = model.items.flatMap((i) => i.texts)
    expect(texts.length).toBe(heights.length)
    texts.forEach((t, k) => {
      expect(t.size * CAP).toBeCloseTo(heights[k], 9)
      expect(t.dy).toBeCloseTo(heights[k] / 2, 9)
    })
  }
})
