// Report sheet views clip to their region: every text (to its full ascent and descent) must be inside it with a margin,
// so a head view's title is never cut (user, 2026-10-31: EAST HEAD on a custom sheet lost the top of its letters).
import { describe, expect, it } from 'vitest'
import { buildDrawing } from '../../../src/engine/drawing.ts'
import { activeSectionPlan } from '../../../src/engine/sections.ts'
import { sheetModels, textInkCorners, viewRegion, VIEW_MARGIN, type SheetModel } from '../../../src/engine/sheetModel.ts'
import { headSheet } from '../../../src/report/pages/custom.ts'
import { sheetItem } from '../../../src/report/pages/drawing.ts'
import { CONTENT } from '../../../src/report/pages/layout.ts'
import { sampleWithReport } from './fixture.ts'

const ORIENTATIONS = ['Vertical', 'Horizontal CW', 'Horizontal CCW'] as const

function outside(m: SheetModel, region: { x: number; y: number; w: number; h: number }, margin: number): string[] {
  const clip = m.clip
  const texts = [...m.drawing, ...m.sheet].filter((p) => p.t === 'text')
  const bad: string[] = []
  for (const t of texts) {
    if (t.t !== 'text') continue
    const pts = textInkCorners(t)
    // A drawing text cut by a section sheet's clip is meant to be cut; only what is inside the clip counts.
    if (clip && m.drawing.includes(t) && pts.every(([x, y]) => x < clip.x || x > clip.x + clip.w || y < clip.y || y > clip.y + clip.h)) continue
    for (const [x, y] of pts) {
      const cx = clip && m.drawing.includes(t) ? Math.min(Math.max(x, clip.x), clip.x + clip.w) : x
      const cy = clip && m.drawing.includes(t) ? Math.min(Math.max(y, clip.y), clip.y + clip.h) : y
      if (cx < region.x + margin - 1e-9 || cx > region.x + region.w - margin + 1e-9 || cy < region.y + margin - 1e-9 || cy > region.y + region.h - margin + 1e-9) {
        bad.push(`"${t.text}"`)
        break
      }
    }
  }
  return bad
}

describe.each(ORIENTATIONS)('report sheet views, %s', (orientation) => {
  const p = sampleWithReport((q) => {
    q.vessel.orientation = orientation
    q.settings.headViewMode = 'BOTH'
    q.settings.makeSectionSheets = true
  })
  const d = buildDrawing(p)

  it('a head view holds its whole title and every label, with a margin on every side', () => {
    for (const head of ['HEAD 1', 'HEAD 2'] as const) {
      const m = headSheet(p, d, head, new Set())!
      expect(m, head).not.toBeNull()
      const r = viewRegion(m)
      expect(outside(m, r, VIEW_MARGIN), head).toEqual([])
      // The title is the topmost text of the view: its ascent now sits a margin inside the region.
      const title = p.settings[head === 'HEAD 1' ? 'head1Label' : 'head2Label'].toUpperCase()
      expect(m.drawing.some((x) => x.t === 'text' && x.text.toUpperCase() === title), title).toBe(true)
    }
  })

  it('the main, overview and section sheets too', () => {
    for (const m of sheetModels(p, d, activeSectionPlan(p))) expect(outside(m, viewRegion(m), VIEW_MARGIN), m.title).toEqual([])
  })

  it('sheetItem prints that region, fitted with its shape', () => {
    const m = headSheet(p, d, 'HEAD 2', new Set())!
    const item = sheetItem(m, CONTENT)
    if (item.t !== 'sheet') throw new Error()
    expect(item.region).toEqual(viewRegion(m))
    expect(item.box.w / item.box.h).toBeCloseTo(item.region.w / item.region.h, 6)
  })
})

it('the text ink box reaches above the capital height (the overshoot that was cut)', () => {
  const t = { x: 0, y: 0, h: 1, rot: 0, text: 'EAST HEAD', just: 'MC' as const }
  const top = Math.max(...textInkCorners(t).map((q) => q[1]))
  expect(top).toBeGreaterThan(0.5 + 0.1)
})
