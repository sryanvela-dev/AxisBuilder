// Everything printed stays on the paper (main sheet inside its margins), for every golden job and the sample
// job, section sheets off and on; text measured with the bundled font.
import { expect, it } from 'vitest'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { activeSectionPlan } from '../../src/engine/sections.ts'
import { MARGIN, sheetModels, textGeometry } from '../../src/engine/sheetModel.ts'
import { goldenJobs, withSections } from './pdfJobs.ts'

it('keeps every sheet on the paper', () => {
  const out: string[] = []
  for (const j of goldenJobs()) {
    for (const on of [false, true]) {
      const p = withSections(j.project, on)
      for (const m of sheetModels(p, buildDrawing(p), activeSectionPlan(p))) {
        const edge = m.kind === 'main' ? MARGIN - 0.01 : 0
        for (const crop of ['all', 'drawingOnly'] as const) {
          const b = m.extents[crop]
          if (b[0] >= edge && b[1] >= edge && b[2] <= m.paper.w - edge && b[3] <= m.paper.h - edge) continue
          out.push(`${j.name}, sections ${on}, ${m.title}, ${crop}: ${b.map((v) => v.toFixed(2)).join(' ')}`)
        }
      }
    }
  }
  expect(out).toEqual([])
})

it('keeps the ruler numbers, axis labels and arrows of section sheets apart', () => {
  const out: string[] = []
  type Box = [number, number, number, number]
  const boxOfText = (t: Parameters<typeof textGeometry>[0]): Box => {
    const c = textGeometry(t).corners
    return [Math.min(...c.map((q) => q[0])), Math.min(...c.map((q) => q[1])), Math.max(...c.map((q) => q[0])), Math.max(...c.map((q) => q[1]))]
  }
  const hit = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]
  for (const j of goldenJobs()) {
    const p = withSections(j.project, true)
    for (const m of sheetModels(p, buildDrawing(p), activeSectionPlan(p)).filter((x) => x.kind !== 'main')) {
      const ruler = m.sheet.filter((x) => x.layer === 'REPORT_X_RULER' || x.layer === 'REPORT_Y_RULER')
      const texts = ruler.filter((x) => x.t === 'text').map((t) => ({ t, b: boxOfText(t) }))
      texts.forEach((a, i) => texts.slice(i + 1).forEach((b) => {
        if (hit(a.b, b.b)) out.push(`${j.name} ${m.title}: "${a.t.text}" touches "${b.t.text}"`)
      }))
      for (const l of ruler) {
        if (l.t !== 'line') continue
        // Points along the line (ruler, ticks, arrows) must stay out of every text.
        for (let k = 0; k <= 20; k++) {
          const x = l.x1 + ((l.x2 - l.x1) * k) / 20
          const y = l.y1 + ((l.y2 - l.y1) * k) / 20
          const t = texts.find((q) => x > q.b[0] && x < q.b[2] && y > q.b[1] && y < q.b[3])
          if (t) {
            out.push(`${j.name} ${m.title}: a line crosses "${t.t.text}"`)
            break
          }
        }
      }
    }
  }
  expect(out).toEqual([])
})
