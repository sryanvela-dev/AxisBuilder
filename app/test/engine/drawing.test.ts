import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openProject } from '../../src/data/projectFile.ts'
import type { Project } from '../../src/data/schema.ts'
import { buildDrawing, groupOfLayer, type Drawing, type Shape } from '../../src/engine/drawing.ts'
import { panelOf } from '../../src/engine/layout.ts'
import { rulerCalls } from '../../src/engine/rulers.ts'
import { headVector, toLogical, toVisual, type Orientation } from '../../src/engine/transform.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { LispNum } from '../../src/export/lsp/vbaFormat.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'

const golden = join(import.meta.dirname, '..', 'golden')
const jobs = readdirSync(golden, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)

function load(job: string): Project {
  const r = openProject(readFileSync(join(golden, job, 'project.json'), 'utf8'))
  if (!r.ok) throw new Error(r.errors.join('\n'))
  const overrides = JSON.parse(readFileSync(join(golden, job, 'golden.json'), 'utf8')).overrides ?? {}
  const p = structuredClone(r.project) as Project & Record<string, Record<string, unknown>>
  for (const [k, v] of Object.entries(overrides as Record<string, unknown>)) {
    const [section, key] = k.split('.')
    p[section][key] = v
  }
  return p
}

/** The calls of one LISP function in the drawing body, as their argument tokens. */
function calls(lsp: string, fn: string): string[][] {
  return lsp
    .split('\r\n')
    .filter((l) => l.startsWith(`  (${fn} `))
    .map((l) => [...l.trim().slice(fn.length + 2, -1).matchAll(/"(?:[^"\\]|\\.)*"|\S+/g)].map((m) => m[0]))
}

const N = (n: number) => LispNum(n)
const shapes = (d: Drawing, prefix: string, t: Shape['t']) => d.items.filter((i) => i.key.startsWith(prefix)).flatMap((i) => i.shapes.filter((s) => s.t === t))

describe.each(jobs)('engine against the exported .lsp: %s', (job) => {
  const p = load(job)
  const lsp = exportLsp(p, { processedImageFolder: 'X:\\img' })
  const d = buildDrawing(p)

  it('scan and object rectangles', () => {
    const lspScans = calls(lsp, 'SL_LabelRect').filter((c) => c[5] === '"SCANS"')
    const rects = shapes(d, 'scans:', 'rect') as Extract<Shape, { t: 'rect' }>[]
    expect(rects.map((r) => [N(r.x), N(r.y), N(r.w), N(r.h)])).toEqual(lspScans.map((c) => c.slice(0, 4)))
    const lspObjects = calls(lsp, 'SL_LabelRect').filter((c) => c[5] === '"SUPPORTS"')
    expect((shapes(d, 'objects:', 'rect') as Extract<Shape, { t: 'rect' }>[]).map((r) => [N(r.x), N(r.y), N(r.w), N(r.h)])).toEqual(lspObjects.map((c) => c.slice(0, 4)))
  })

  it('images, nozzles, MUT and welds', () => {
    const imgs = shapes(d, 'image:', 'image') as Extract<Shape, { t: 'image' }>[]
    expect(imgs.map((i) => [N(i.x), N(i.y), N(i.w), N(i.h)])).toEqual(calls(lsp, 'SL_InsertFitImage').map((c) => c.slice(0, 4)))
    // Nozzle circles and labels: the app writes the positions, so the preview matches them exactly.
    const nozzles = (prefix: string) =>
      d.items.filter((i) => i.key.startsWith(prefix)).map((i) => {
        const c = i.shapes.find((s) => s.t === 'circle') as Extract<Shape, { t: 'circle' }>
        const t = i.shapes.find((s) => s.t === 'text') as Extract<Shape, { t: 'text' }> | undefined
        return [N(c.cx), N(c.cy), N(c.r), ...(t ? [N(t.x), N(t.y)] : [])]
      })
    const at = calls(lsp, 'SL_NozzleAt')
    const pick = (layer: string) => at.filter((c) => c[c.length - 2] === layer).map((c) => (c[3] === '""' ? c.slice(0, 3) : [...c.slice(0, 3), c[5], c[6]]))
    expect(nozzles('shellNozzles:')).toEqual(pick('"NOZZLES"'))
    expect(nozzles('headNozzles:')).toEqual(pick('"HEADS"'))
    expect(d.items.filter((i) => i.key.startsWith('shellMut:')).length).toBe(calls(lsp, 'SL_MUTPoint').length)
    expect(d.items.filter((i) => i.key.startsWith('circWelds:')).length).toBe(calls(lsp, 'SL_CircWeld').length)
    expect(d.items.filter((i) => i.key.startsWith('longSeams:')).length).toBe(calls(lsp, 'SL_LongSeam').length)
  })

  it('head views, head nozzles and head MUT', () => {
    const views = calls(lsp, 'SL_HeadView')
    const heads = d.items.filter((i) => i.key.startsWith('head:')).map((i) => i.shapes[0] as Extract<Shape, { t: 'circle' }>)
    expect(heads.map((c) => [N(c.cx), N(c.cy), N(c.r * 2)])).toEqual(views.map((c) => c.slice(0, 3)))
    expect(d.items.filter((i) => i.key.startsWith('headMut:')).length).toBe(calls(lsp, 'SL_HeadMUT').length)
  })

  it('legend, title block, rulers and reference labels', () => {
    const { panel } = panelOf(p)
    const legend = calls(lsp, 'SL_Legend')
    expect(legend.map((c) => c.slice(0, 2))).toEqual(p.settings.showLegendOnOverlay ? [[N(panel.legendX), N(panel.legendY)]] : [])
    const title = calls(lsp, 'SL_TitleBlock')
    expect(title.map((c) => c.slice(0, 2))).toEqual(p.settings.showTitleBlockOnOverlay ? [[N(panel.titleX), N(panel.titleY)]] : [])
    expect(d.items.some((i) => i.key === 'legend')).toBe(p.settings.showLegendOnOverlay)
    const lspRulers = lsp.split('\r\n').filter((l) => l.startsWith('  (SL_Ruler')).map((l) => l.trim().split(' ')[0].slice(1))
    expect(d.items.filter((i) => i.key.startsWith('ruler:')).length).toBe(lspRulers.length)
    const ticks = lsp.split('\r\n').filter((l) => l.startsWith('  (SL_Line') && l.endsWith('"X_AXIS")')).length
    const refLines = d.items.find((i) => i.key === 'referenceLabels')?.shapes.filter((s) => s.t === 'line').length ?? 0
    expect(refLines).toBe(ticks)
  })
})

describe('rulers come from the generated code', () => {
  it('Horizontal CW, bottom + left: Y ruler below, X ruler left', () => {
    const r = rulerCalls({ ori: 'HORIZONTAL CW', placement: 'BOTTOM + LEFT', rulerOffset: 2, vesselXLen: 100, vesselYLen: 300, spacing: 12, xAxisLabel: 'X', yAxisLabel: 'Y' })
    expect(r.map((c) => [c.fn, c.axis, c.side, c.x0, c.y0, c.length])).toEqual([
      ['SL_RulerY_CW_Bottom', 'Y', 1, 102, 0, 300],
      ['SL_RulerX_CW_Left', 'X', -1, 0, -2, 100],
    ])
  })

  it('placement NONE gives no rulers', () => {
    expect(rulerCalls({ ori: 'VERTICAL', placement: 'NONE', rulerOffset: 2, vesselXLen: 1, vesselYLen: 1, spacing: 1, xAxisLabel: '', yAxisLabel: '' })).toEqual([])
  })
})

describe('orientation transforms', () => {
  const cases: [Orientation, [number, number]][] = [['Vertical', [10, 20]], ['Horizontal CW', [20, -10]], ['Horizontal CCW', [-20, 10]]]
  it.each(cases)('%s: logical (10, 20) -> visual %j and back', (o, visual) => {
    expect(toVisual(o, 10, 20)).toEqual(visual)
    expect(toLogical(o, ...visual)).toEqual([10, 20])
  })

  it("12 o'clock on a head points up on the drawing in every orientation", () => {
    for (const o of ['Vertical', 'Horizontal CW', 'Horizontal CCW'] as const) {
      const [dx, dy] = headVector(o, 0)
      const [vx, vy] = toVisual(o, dx, dy)
      expect(vx).toBeCloseTo(0)
      expect(vy).toBeCloseTo(1)
    }
  })
})

describe('items for the preview', () => {
  it('every item from a row says which row; every shape has a CAD group', () => {
    const d = buildDrawing(sampleProject())
    for (const item of d.items) {
      if (item.source) expect(item.key).toMatch(new RegExp(`^(${item.source.list}|image):${item.source.index}$`))
      for (const s of item.shapes) expect(groupOfLayer(s.layer)).toBeDefined()
    }
    expect(d.items.find((i) => i.key === 'shellNozzles:0')?.info).toBe('N1: diameter 12 in at X 94, Y 30, min. T 0.5')
    const hatch = shapes(d, 'scans:0', 'line')
    expect(hatch.length).toBeGreaterThan(10)
    expect(new Set(hatch.map((s) => groupOfLayer(s.layer)))).toEqual(new Set(['hatch']))
  })

  it('items with values not entered yet are left out, and nothing breaks without a vessel size', () => {
    const p = sampleProject()
    const d = buildDrawing({ ...p, vessel: { ...p.vessel, length: null }, shellNozzles: [{ ...p.shellNozzles[0], x: null }] })
    expect(d.items.some((i) => i.key === 'vessel')).toBe(false)
    expect(d.items.some((i) => i.key.startsWith('shellNozzles:'))).toBe(false)
    expect(d.items.some((i) => i.key.startsWith('scans:'))).toBe(true)
  })

  it('150 scans and 60 nozzles build quickly', () => {
    const p = sampleProject()
    const big: Project = {
      ...p,
      vessel: { ...p.vessel, length: 1500, height: 600 },
      scans: Array.from({ length: 150 }, (_, i) => ({ id: `S${i + 1}`, xStart: (i % 25) * 24, xStop: (i % 25) * 24 + 24, yStart: Math.floor(i / 25) * 48, yStop: Math.floor(i / 25) * 48 + 48, include: true })),
      shellNozzles: Array.from({ length: 60 }, (_, i) => ({ id: `N${i + 1}`, diameter: 4 + (i % 5), x: 10 + (i % 10) * 55, y: 400 + Math.floor(i / 10) * 150, minT: null, notes: '', include: true, labelMode: 'AUTO' as const })),
    }
    const t = performance.now()
    const d = buildDrawing(big)
    expect(performance.now() - t).toBeLessThan(250)
    expect(d.items.filter((i) => i.key.startsWith('scans:')).length).toBe(150)
  })
})
