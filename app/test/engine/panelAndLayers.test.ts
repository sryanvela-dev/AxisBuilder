// The layers the app adds (axis direction labels, reference labels, nozzle leaders) and the right panel
// making room for a bigger legend or title block. App output only; compat v5.0 is unchanged.

import { describe, expect, it } from 'vitest'
import type { Project } from '../../src/data/schema.ts'
import { buildDrawing, groupOfLayer, type Drawing, type Shape } from '../../src/engine/drawing.ts'
import { computeRightPanelLayout, panelOf } from '../../src/engine/layout.ts'
import { toVisual, type Orientation } from '../../src/engine/transform.ts'
import { APP_LIBRARY_PATCHES } from '../../src/export/lsp/appLibrary.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'

const OPTIONS = { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5) }
const lsp = (p: Project) => exportLsp(p, OPTIONS)
const lspV5 = (p: Project) => exportLsp(p, { ...OPTIONS, compat: 'v5.0' })

function sample(settings: Record<string, unknown> = {}, orientation?: Orientation): Project {
  const p = sampleProject()
  return {
    ...p,
    vessel: { ...p.vessel, referenceLabelMode: 'Auto Cardinal', ...(orientation ? { orientation } : {}) },
    headNozzles: p.headNozzles.map((n) => ({ ...n, labelMode: 'OUTSIDE' })),
    shellNozzles: p.shellNozzles.map((n) => ({ ...n, labelMode: 'OUTSIDE' })),
    settings: { ...p.settings, showVesselReferenceLabels: true, ...settings } as Project['settings'],
  }
}

const shapesOn = (d: Drawing, layer: string) => d.items.flatMap((i) => i.shapes).filter((s) => s.layer === layer)

describe('library patches', () => {
  it('each changes exactly the lines it is meant for', () => {
    const v5 = lspV5(sample()).split('\r\n')
    for (const patch of APP_LIBRARY_PATCHES) expect(v5.filter((l) => patch.find.test(l)).length, patch.why).toBe(patch.count)
    const app = lsp(sample()).split('\r\n')
    for (const patch of APP_LIBRARY_PATCHES) {
      for (const line of v5.filter((l) => patch.find.test(l))) {
        expect(app, patch.why).toContain(line.replace(patch.find, patch.replace))
        expect(app, patch.why).not.toContain(line)
      }
    }
    expect(app.filter((l) => l.endsWith(' label (SL_AxisLabelLayer layer))'))).toHaveLength(9)
  })

  it('leave compat v5.0 alone', () => {
    const v5 = lspV5(sample())
    expect(v5).not.toMatch(/SL_AxisLabelLayer|NOZZLE_LEADERS|REFERENCE_TEXT|X_AXIS_LABEL_TEXT|SL_TEXT_MENU/)
  })
})

describe('layers the app adds', () => {
  const d = buildDrawing(sample())
  const out = lsp(sample())

  it('are set up after SL_SetupLayers with their colors', () => {
    for (const l of ['  (SL_Layer "NOZZLE_LEADERS" 7)', '  (SL_Layer "HEAD_NOZZLE_LEADERS" 7)', '  (SL_Layer "X_AXIS_LABEL_TEXT" 1)', '  (SL_Layer "REFERENCE_TEXT" 1)', '  (SL_Layer "Y_AXIS_LABEL_TEXT" 5)']) {
      expect(out).toContain(`\r\n${l}\r\n`)
    }
  })

  it('hold the axis direction labels, reference labels and leaders in the preview and the .lsp', () => {
    expect(shapesOn(d, 'X_AXIS_LABEL_TEXT').length).toBeGreaterThan(0)
    expect(shapesOn(d, 'Y_AXIS_LABEL_TEXT').length).toBeGreaterThan(0)
    expect(shapesOn(d, 'REFERENCE_TEXT')).toHaveLength(5)
    expect(out.match(/\(SL_RulerTextRotX\) "[^"]*" "REFERENCE_TEXT"\)/g)).toHaveLength(5)
    expect(shapesOn(d, 'NOZZLE_LEADERS').length).toBe(sample().shellNozzles.filter((n) => n.include && n.id).length)
    expect(shapesOn(d, 'HEAD_NOZZLE_LEADERS').length).toBeGreaterThan(0)
    // The ruler numbers and the nozzle circles stay where they were.
    expect(shapesOn(d, 'X_RULER_TEXT').every((s) => s.t === 'text' && /"$/.test(s.text))).toBe(true)
    expect(shapesOn(d, 'NOZZLES').every((s) => s.t === 'circle')).toBe(true)
  })

  it('belong to the same show/hide groups as before', () => {
    expect(groupOfLayer('X_AXIS_LABEL_TEXT')).toBe('rulers')
    expect(groupOfLayer('REFERENCE_TEXT')).toBe('rulers')
    expect(groupOfLayer('NOZZLE_LEADERS')).toBe('nozzles')
    expect(groupOfLayer('HEAD_NOZZLE_LEADERS')).toBe('heads')
    expect(out).toMatch(/\(defun c:ABNOZZLES \(\) .*"NOZZLE_LEADERS"/)
    expect(out).toMatch(/\(defun c:ABHEADS \(\) .*"HEAD_NOZZLE_LEADERS"/)
    expect(out).toMatch(/\(defun c:ABRULERS \(\) .*"X_AXIS_LABEL_TEXT" "Y_AXIS_LABEL_TEXT" "REFERENCE_TEXT"/)
  })
})

describe('right panel', () => {
  it('is v5.0 layout at scale 1', () => {
    const a = computeRightPanelLayout('VERTICAL', 'BOTTOM + LEFT', 100, 200, 40, 'BOTH')
    expect(computeRightPanelLayout('VERTICAL', 'BOTTOM + LEFT', 100, 200, 40, 'BOTH', { legend: 1, title: 1 })).toEqual(a)
  })

  describe.each(['Vertical', 'Horizontal CW', 'Horizontal CCW'] as Orientation[])('%s', (o) => {
    const visualY = (x: number, y: number) => toVisual(o, x, y)[1]
    const normal = sample({}, o)
    const big = sample({ legendTextSize: 'Fixed height', legendTextHeight: 4, titleBlockTextSize: 'Scale', titleBlockTextScale: 1.5 }, o)

    it('moves the head views and title block up to make room', () => {
      const a = panelOf(normal).panel
      const b = panelOf(big).panel
      // Legend twice as big: 36 in more room above it. Title block 1.5 times: 6 x 3.4 x 0.5 more.
      expect(visualY(b.head1X, b.head1Y) - visualY(a.head1X, a.head1Y)).toBeCloseTo(36, 6)
      expect(visualY(b.titleX, b.titleY) - visualY(a.titleX, a.titleY)).toBeCloseTo(36 + 10.2, 6)
      // The compat layout is unchanged.
      expect(panelOf(big, true).panel).toEqual(a)
    })

    it('draws the whole legend scaled from its bottom-left corner, in the preview and the .lsp', () => {
      const corner = (d: Drawing) => {
        const pts = d.items.find((i) => i.key === 'legend')!.shapes.flatMap((s: Shape) => (s.t === 'rect' ? [toVisual(o, s.x, s.y), toVisual(o, s.x + s.w, s.y + s.h)] : []))
        return { minX: Math.min(...pts.map((p) => p[0])), minY: Math.min(...pts.map((p) => p[1])), maxY: Math.max(...pts.map((p) => p[1])) }
      }
      const a = corner(buildDrawing(normal))
      const b = corner(buildDrawing(big))
      expect(b.minX).toBeCloseTo(a.minX, 6)
      expect(b.maxY - b.minY).toBeCloseTo((a.maxY - a.minY) * 2, 6)
      const out = lsp(big)
      expect(out).toContain('(setq SL_LEGEND_SCALE 2.)')
      expect(out).toContain('(setq SL_TITLE_SCALE 1.5)')
      expect(out.lastIndexOf('(defun SL_Legend (')).toBeGreaterThan(out.indexOf('(setq SL_LEGEND_SCALE'))
      expect(out).toContain('  (setq lineH (* 3.4 SL_TITLE_SCALE))')
    })

    it('spreads the title block lines with the text', () => {
      const lines = (p: Project) => buildDrawing(p).items.find((i) => i.key === 'titleBlock')!.shapes.filter((s) => s.t === 'text')
      const a = lines(normal)
      const b = lines(big)
      const gap = (t: Shape[]) => Math.hypot(...([0, 1].map((k) => toVisual(o, (t[1] as { x: number }).x, (t[1] as { y: number }).y)[k] - toVisual(o, (t[0] as { x: number }).x, (t[0] as { y: number }).y)[k]) as [number, number]))
      expect(gap(b)).toBeCloseTo(gap(a) * 1.5, 6)
    })
  })
})
