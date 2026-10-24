// Everything printed stays on the paper (main sheet inside its margins), for every golden job and the sample
// job, section sheets off and on; text measured with the bundled font.
import { expect, it } from 'vitest'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { activeSectionPlan } from '../../src/engine/sections.ts'
import { MARGIN, sheetModels } from '../../src/engine/sheetModel.ts'
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
