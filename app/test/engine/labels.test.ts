import { describe, expect, it } from 'vitest'
import type { Project } from '../../src/data/schema.ts'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { headNozzleLabels, shellNozzleLabels } from '../../src/engine/labels.ts'
import { drawnScans, panelOf } from '../../src/engine/layout.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { buildRenderModel } from '../../src/ui/preview/renderModel.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'

const drawingBody = (lsp: string) => lsp.slice(lsp.indexOf('(defun c:SCANOVERLAY'), lsp.indexOf('AxisBuilder master drawing complete'))

describe('app changes 2026-10-23', () => {
  it('nozzle labels are written where the app placed them; v5.0 compat keeps SL_CircleSmart / SL_HeadNozzle', () => {
    const p = sampleProject()
    const app = drawingBody(exportLsp(p))
    const v5 = drawingBody(exportLsp(p, { compat: 'v5.0' }))
    expect(app).not.toContain('(SL_CircleSmart ')
    expect(app).not.toContain('(SL_HeadNozzle ')
    expect(app.split('(SL_NozzleAt ').length - 1).toBe(p.shellNozzles.length + p.headNozzles.length)
    expect(v5.split('(SL_CircleSmart ').length - 1).toBe(p.shellNozzles.length)
    // N1 (12 in) fits its label inside; N2 (4 in) gets a leader to the first free spot (right of the circle).
    expect(app).toContain('(SL_NozzleAt 94. 30. 6. "N1" 2.4 94. 30. nil "NOZZLES" "NOZZLES")')
    expect(app).toContain('(SL_NozzleAt 20. 150. 2. "N2" 1.6 26.96 150. (list 22. 150. 26.96 150.) "NOZZLES" "NOZZLES")')
  })

  it('shell label placement keeps v5.0 rules: inside if it fits, else right, upper-right, ... avoiding images and objects', () => {
    const p = sampleProject()
    const labels = shellNozzleLabels(p, drawnScans(p))
    const n2 = labels.get(1)!
    // Right of the circle: x + r + leader (4) + half the text width.
    expect(n2.tx).toBeCloseTo(20 + 2 + 4 + (2 * 1.6 * 0.6) / 2)
    // Put an object right of N2: the label moves to the next free spot (upper right).
    const blocked: Project = { ...p, objects: [{ id: 'B', x: 22, y: 146, circWidth: 10, length: 8, include: true, notes: '' }] }
    const moved = shellNozzleLabels(blocked, drawnScans(blocked)).get(1)!
    expect([moved.tx, moved.ty]).toEqual([n2.tx, 150 + 2 + 4])
  })

  it('crowded head nozzle labels move out along their leader instead of overlapping', () => {
    const p = sampleProject()
    const crowded: Project = {
      ...p,
      headNozzles: [
        { head: 'HEAD 1', id: 'A1', diameter: 2, clock: '3', radiusPosition: 'OUTER', customRadiusPercent: null, minT: null, notes: '', labelMode: 'OUTSIDE', include: true },
        { head: 'HEAD 1', id: 'A2', diameter: 2, clock: '3:02', radiusPosition: 'OUTER', customRadiusPercent: null, minT: null, notes: '', labelMode: 'OUTSIDE', include: true },
      ],
      headMut: [],
    }
    const { panel, headDia } = panelOf(crowded)
    const l = headNozzleLabels(crowded, panel, headDia)
    const a1 = l.get(0)!
    const a2 = l.get(1)!
    const dist = (x: { x: number; y: number; tx: number; ty: number }) => Math.hypot(x.tx - x.x, x.ty - x.y)
    // A1 is alone where its label goes: exactly v5.0's distance (radius + leader 8 + 8).
    expect(dist(a1)).toBeCloseTo(1 + 8 + 8)
    // A2 is one degree away, so its label would land on A1's: moved out one step (1.6 x text height).
    expect(dist(a2)).toBeCloseTo(17 + 1.4 * 1.6)
    // Its leader still runs from the circle edge, now ending one step further out.
    expect(Math.hypot(a2.leader![2] - a2.x, a2.leader![3] - a2.y)).toBeCloseTo(1 + 8 + 4 + 1.4 * 1.6)
  })

  it('Horizontal CCW: tall scan, object and long seam labels read upright; the .lsp redefines SL_LabelRect and SL_LongSeam', () => {
    const p = sampleProject()
    const ccw: Project = { ...p, vessel: { ...p.vessel, orientation: 'Horizontal CCW' } }
    const m = buildRenderModel(buildDrawing(ccw))
    for (const it of m.items.filter((i) => /^(scans|objects|longSeams):/.test(i.key))) {
      for (const t of it.texts) expect(((t.rotate % 360) + 360) % 360, `${it.key} is upside down`).not.toBe(180)
    }
    // v5.0 drew them at 180 degrees (the preview of the old rule would fail the check above).
    const lsp = exportLsp(ccw)
    expect(lsp).toContain('(defun SL_LabelRot (w h)')
    expect(lsp.indexOf('(defun SL_LabelRect', lsp.indexOf(';;; ---- AxisBuilder app changes'))).toBeGreaterThan(0)
    expect(exportLsp(ccw, { compat: 'v5.0' })).not.toContain('SL_LabelRot')
  })

  it('the centerline gets its transparency (default 50); not in v5.0 compat', () => {
    const p = sampleProject()
    expect(exportLsp(p)).toContain('  (SL_SetLayerTransparencyTo "CENTERLINE" 50)')
    expect(exportLsp({ ...p, settings: { ...p.settings, centerlineTransparency: 20 } })).toContain('"CENTERLINE" 20)')
    expect(exportLsp(p, { compat: 'v5.0' })).not.toContain('CENTERLINE" 50')
  })
})
