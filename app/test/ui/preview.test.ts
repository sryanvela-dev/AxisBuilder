import { describe, expect, it } from 'vitest'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { toVisual, type Orientation } from '../../src/engine/transform.ts'
import type { ListKey, Project } from '../../src/data/schema.ts'
import { STEP_OF_LIST } from '../../src/state/steps.ts'
import { buildRenderModel, svgMatrix, toSvg } from '../../src/ui/preview/renderModel.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'
import { itemKey } from '../../src/ui/selectionContext.ts'

const ORIENTATIONS: Orientation[] = ['Vertical', 'Horizontal CW', 'Horizontal CCW']
const withOrientation = (o: Orientation): Project => {
  const p = sampleProject()
  return { ...p, vessel: { ...p.vessel, orientation: o } }
}

describe('drawing on screen', () => {
  it.each(ORIENTATIONS)('%s: the SVG matrix and the point transform agree (screen y points down)', (o) => {
    const [a, b, c, d] = svgMatrix(o)
    for (const [x, y] of [[0, 0], [10, 0], [0, 20], [7, -3]] as const) {
      const [sx, sy] = toSvg(o, x, y)
      expect([a * x + c * y + 0, b * x + d * y + 0]).toEqual([sx + 0, sy + 0])
      expect(sy + 0).toBe(-toVisual(o, x, y)[1] + 0)
    }
  })

  it.each(ORIENTATIONS)('%s: readable texts (MUT, nozzle labels, legend, title) are upright on screen', (o) => {
    const m = buildRenderModel(buildDrawing(withOrientation(o)))
    const upright = ['shellMut:', 'shellNozzles:', 'headNozzles:', 'legend', 'titleBlock']
    for (const it of m.items.filter((i) => upright.some((u) => i.key.startsWith(u)))) {
      for (const t of it.texts) expect(((t.rotate % 360) + 360) % 360, `${it.key} ${t.text}`).toBe(0)
    }
  })

  it('the vessel fills its size on screen in every orientation', () => {
    for (const o of ORIENTATIONS) {
      const m = buildRenderModel(buildDrawing(withOrientation(o)))
      const vessel = m.items.find((i) => i.key === 'vessel')!
      expect(vessel.paths[0].d).toBe('M0 0h188.5v240h-188.5Z')
      const [x0, y0, x1, y1] = m.bounds
      // Horizontal: wider than tall (240 long); Vertical: taller than wide.
      expect(o === 'Vertical' ? y1 - y0 > x1 - x0 - 120 : x1 - x0 > y1 - y0).toBe(true)
    }
  })

  it('hatch lines take the hatch transparency', () => {
    const p = sampleProject()
    const m = buildRenderModel(buildDrawing({ ...p, settings: { ...p.settings, autHatchTransparency: 70 } }))
    expect(m.hatchOpacity).toBeCloseTo(0.3)
    const scan = m.items.find((i) => i.key === 'scans:0')!
    expect(scan.paths.map((x) => [x.layer, x.group, x.opacity])).toEqual([
      ['SCANS', 'scans', 1],
      ['AUT_HATCH', 'hatch', 1 - 0.7],
    ])
    const centerline = m.items.find((i) => i.key === 'vessel')!.paths.find((x) => x.layer === 'CENTERLINE')!
    expect(centerline.opacity).toBe(0.5)
  })
})

describe('selection between rows and the drawing', () => {
  it('a row and its drawing item have the same key; clicking an item names its row and step', () => {
    const d = buildDrawing(sampleProject())
    for (const item of d.items.filter((i) => i.source && !i.key.startsWith('image:'))) {
      expect(itemKey({ list: item.source!.list, index: item.source!.index })).toBe(item.key)
    }
    const lists = new Set(d.items.filter((i) => i.source).map((i) => i.source!.list))
    expect([...lists].sort()).toEqual(['circWelds', 'headMut', 'headNozzles', 'longSeams', 'objects', 'scans', 'shellMut', 'shellNozzles'])
    const steps: Record<string, string> = {}
    for (const l of lists) steps[l] = STEP_OF_LIST[l as ListKey]
    expect(steps).toEqual({
      circWelds: 'fieldData', headMut: 'fieldData', headNozzles: 'fieldData', longSeams: 'fieldData', objects: 'fieldData',
      scans: 'scans', shellMut: 'fieldData', shellNozzles: 'fieldData',
    })
  })

  it('every selectable item can be clicked', () => {
    const m = buildRenderModel(buildDrawing(sampleProject()))
    expect(m.items.filter((i) => i.selectable).every((i) => i.item.source !== null)).toBe(true)
    expect(m.items.find((i) => i.key === 'vessel')!.selectable).toBe(false)
  })
})
