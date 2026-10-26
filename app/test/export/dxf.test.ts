// The DXF of the drawing in model space (Phase 7a): a well-formed R2000 file for every golden job and the sample, the
// entities per layer as the engine draws them, placed where the .lsp places them in every orientation, the layers as
// the .lsp sets them up, images linked relative to the DXF, and wrapping, moved labels, MUT areas and arrowheads.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { setOverride } from '../../src/data/overrides.ts'
import type { Project } from '../../src/data/schema.ts'
import { buildDrawing, type Shape } from '../../src/engine/drawing.ts'
import { panelOf } from '../../src/engine/layout.ts'
import { headNozzleLabels } from '../../src/engine/labels.ts'
import { mutAreaOf } from '../../src/engine/mutAreas.ts'
import type { Orientation } from '../../src/engine/transform.ts'
import { nearestLineWeight, transparencyValue } from '../../src/export/dxf/dxfFile.ts'
import { SETUP_LAYERS, exportDxf, fallbackPixels } from '../../src/export/dxf/exportDxf.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'
import { computeDxfFingerprints } from './dxfFingerprints.ts'
import { readDxf, handles, type DxfObject, type ParsedDxf } from './dxfRead.ts'
import { goldenJobs } from './pdfJobs.ts'

const ORIENTATIONS: Orientation[] = ['Vertical', 'Horizontal CW', 'Horizontal CCW']
/** SL_tf_x / SL_tf_y, as the .lsp defines them. */
const tf = (o: Orientation, x: number, y: number): [number, number] => (o === 'Vertical' ? [x, y] : o === 'Horizontal CW' ? [y, -x] : [-y, x])
const entities = (d: ParsedDxf) => d.sections.get('ENTITIES')!
const onLayer = (d: ParsedDxf, layer: string, type?: string) => entities(d).filter((e) => e.get(8) === layer && (!type || e.type === type))
const xy = (e: DxfObject, code = 10): [number, number] => [Number(e.get(code)), Number(e.get(code + 10))]
const close = (a: [number, number], b: [number, number], tol = 1e-5) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol
const vertices = (e: DxfObject): [number, number][] => e.all(10).map((x, i) => [Number(x), Number(e.all(20)[i])])
const withOrientation = (p: Project, o: Orientation): Project => ({ ...p, vessel: { ...p.vessel, orientation: o } })
const lspOf = (p: Project) => exportLsp(p, { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5) })

/** How many DXF entities a drawing shape becomes. */
function entityCount(sh: Shape, images: boolean): number {
  if (sh.t === 'text') return sh.text === '' ? 0 : 1
  if (sh.t === 'image') return images ? 1 : 0
  if (sh.t === 'poly' && sh.fill && !sh.dot && sh.pts.length > 4) return sh.pts.length - 2
  return 1
}

describe('the DXF of every golden job and the sample', () => {
  for (const j of goldenJobs()) {
    it(`${j.name}: a complete R2000 file whose entities per layer match the drawing`, () => {
      const { text } = exportDxf(j.project)
      const d = readDxf(text)
      for (const s of ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) expect(d.sections.has(s)).toBe(true)
      expect(d.header.get('$ACADVER')![0][1]).toBe('AC1015')
      expect(d.header.get('$INSUNITS')![0][1]).toBe('1')
      expect(d.header.get('$MEASUREMENT')![0][1]).toBe('0')
      const hs = handles(d)
      expect(new Set(hs).size).toBe(hs.length)
      const seed = parseInt(d.header.get('$HANDSEED')![0][1], 16)
      expect(hs.every((h) => parseInt(h, 16) < seed)).toBe(true)
      // Every layer used is defined; every entity is in model space.
      const tables = d.sections.get('TABLES')!
      const layers = new Set(tables.filter((t) => t.type === 'LAYER').map((t) => t.get(2)))
      const model = tables.find((t) => t.type === 'BLOCK_RECORD' && t.get(2) === '*Model_Space')!.get(5)
      for (const e of entities(d)) {
        expect(layers.has(e.get(8))).toBe(true)
        expect(e.get(330)).toBe(model)
      }
      // Objects CAD expects.
      const objects = d.sections.get('OBJECTS')!
      const root = objects[0]
      expect(root.type).toBe('DICTIONARY')
      expect(root.all(3)).toEqual(['ACAD_GROUP', 'ACAD_IMAGE_DICT', 'ACAD_IMAGE_VARS', 'ACAD_LAYOUT', 'ACAD_PLOTSTYLENAME'])
      // Every layer names its plot style (AutoCAD refuses the file without it), the Normal placeholder.
      const normal = objects.find((o) => o.type === 'ACDBPLACEHOLDER')!.get(5)
      for (const l of tables.filter((t) => t.type === 'LAYER')) expect(l.get(390)).toBe(normal)
      // Every object type outside R12 is declared as a class.
      const classes = new Set(d.sections.get('CLASSES')!.map((c) => c.get(1)))
      for (const t of ['LAYOUT', 'ACDBDICTIONARYWDFLT', 'ACDBPLACEHOLDER', 'RASTERVARIABLES', 'IMAGEDEF', 'IMAGEDEF_REACTOR', 'IMAGE']) expect(classes.has(t)).toBe(true)
      expect(objects.filter((o) => o.type === 'LAYOUT').map((o) => o.all(1).at(-1))).toEqual(['Model', 'Layout1'])
      // Per layer: as many entities as the drawing's shapes make.
      const expected = new Map<string, number>()
      const drawing = buildDrawing(j.project)
      for (const it of drawing.items) for (const sh of it.shapes) expected.set(sh.layer, (expected.get(sh.layer) ?? 0) + entityCount(sh, j.project.settings.generateOverlayDrawing))
      const got = new Map<string, number>()
      for (const e of entities(d)) got.set(e.get(8)!, (got.get(e.get(8)!) ?? 0) + 1)
      for (const [k, v] of expected) if (v === 0) expected.delete(k)
      expect(Object.fromEntries(got)).toEqual(Object.fromEntries(expected))
      // Zoom Extents frames everything.
      const [x0, y0] = d.header.get('$EXTMIN')!.map((p) => Number(p[1]))
      const [x1, y1] = d.header.get('$EXTMAX')!.map((p) => Number(p[1]))
      for (const e of entities(d)) if (e.type === 'LINE') for (const q of [xy(e), xy(e, 11)]) expect(q[0] >= x0 - 1e-6 && q[0] <= x1 + 1e-6 && q[1] >= y0 - 1e-6 && q[1] <= y1 + 1e-6).toBe(true)
    })
  }

  it('the same file for AutoCAD and DraftSight (the CAD program only changes the .lsp)', () => {
    const p = goldenJobs()[0].project
    expect(exportDxf({ ...p, settings: { ...p.settings, cadPlatform: 'AutoCAD' } }).text).toBe(exportDxf({ ...p, settings: { ...p.settings, cadPlatform: 'DraftSight' } }).text)
  })

  it('is the approved DXF (fingerprints; npm run dxf:check / dxf:write)', () => {
    const saved = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'dxfOutput.sha256.json'), 'utf8'))
    expect(computeDxfFingerprints()).toEqual(saved)
  })
})

describe('placed where the .lsp places it', () => {
  const ref1 = goldenJobs().find((j) => j.name === 'REF1')!.project
  for (const o of ORIENTATIONS) {
    it(`vessel outline, a scan, a shell nozzle and a head nozzle (${o})`, () => {
      const p = withOrientation({ ...ref1, settings: { ...ref1.settings, headViewMode: 'BOTH', showHeadNozzles: true } }, o)
      const d = readDxf(exportDxf(p).text)
      const H = p.vessel.height!
      const L = p.vessel.length!
      const vessel = onLayer(d, 'VESSEL', 'LWPOLYLINE')[0]
      expect(vertices(vessel).every((q, i) => close(q, tf(o, ...([[0, 0], [H, 0], [H, L], [0, L]] as [number, number][])[i])))).toBe(true)
      const sc = p.scans.find((s) => s.include && s.xStart! < s.xStop!)!
      const scanOutlines = onLayer(d, 'SCANS', 'LWPOLYLINE').map(vertices)
      expect(scanOutlines.some((v) => close(v[0], tf(o, sc.xStart!, sc.yStart!)) && close(v[2], tf(o, sc.xStop!, sc.yStop!)))).toBe(true)
      // Nozzles: the centers the .lsp writes (SL_NozzleAt x y ...), turned by SL_tf.
      const lsp = lspOf(p)
      const centers = [...lsp.matchAll(/\(SL_NozzleAt ([-\d.]+) ([-\d.]+) ([-\d.]+) /g)].map((m) => ({ c: tf(o, Number(m[1]), Number(m[2])), r: Number(m[3]) }))
      expect(centers.length).toBeGreaterThan(0)
      const circles = [...onLayer(d, 'NOZZLES', 'CIRCLE'), ...onLayer(d, 'HEADS', 'CIRCLE')].map((e) => ({ c: xy(e), r: e.num(40) }))
      for (const n of centers) expect(circles.some((c) => close(c.c, n.c, 1e-3) && Math.abs(c.r - n.r) < 1e-3)).toBe(true)
      // A head nozzle in particular.
      const { headDia, panel } = panelOf(p)
      const hl = [...headNozzleLabels(p, panel, headDia).values()][0]
      expect(circles.some((c) => close(c.c, tf(o, hl.x, hl.y)))).toBe(true)
      // Text turns with the drawing (SL_rot): a scan ID in a wide scan reads along X.
      const scanText = onLayer(d, 'SCAN_TEXT', 'TEXT').find((t) => t.get(1) === sc.id)!
      expect(scanText.num(50)).toBe(o === 'Vertical' ? 0 : o === 'Horizontal CW' ? 270 : 90)
      expect(scanText.get(72)).toBe('1')
      expect(scanText.get(73)).toBe('2')
    })
  }
})

describe('the app drawing in the DXF', () => {
  const sample = goldenJobs().find((j) => j.name === 'sample')!.project

  it('wrapped nozzles as arcs, turned like the .lsp (SL_ArcAt)', () => {
    const ref2 = goldenJobs().find((j) => j.name === 'REF2')!.project
    const d = readDxf(exportDxf(ref2).text)
    const arcs = buildDrawing(ref2).items.flatMap((i) => i.shapes).filter((s) => s.t === 'arc')
    expect(arcs.length).toBeGreaterThan(0)
    expect(entities(d).filter((e) => e.type === 'ARC')).toHaveLength(arcs.length)
    const off = ref2.vessel.orientation === 'Vertical' ? 0 : ref2.vessel.orientation === 'Horizontal CCW' ? 90 : -90
    const a = arcs[0] as Extract<Shape, { t: 'arc' }>
    const e = entities(d).find((x) => x.type === 'ARC' && close(xy(x), tf(ref2.vessel.orientation as Orientation, a.cx, a.cy)))!
    expect(e.num(50)).toBeCloseTo((((a.a0 + off) % 360) + 360) % 360, 5)
  })

  it('a wrapped scan: two images, each the size of its piece, one IMAGEDEF per file, linked relative to the DXF', () => {
    const p: Project = { ...sample, scans: [...sample.scans, { id: 'SCAN 9', xStart: 180, xStop: 20, yStart: 100, yStop: 130, include: true, noWrap: false, acrossSeam: true }] }
    p.scanImages = p.scans.map((x) => ({ scanId: x.id, imageFile: `${x.id}.png`, processedImage: '', include: true }))
    const sizes = new Map<string, [number, number]>([['scan_9_fit_a.png', [850, 3000]], ['scan_9_fit_b.png', [2000, 3000]]])
    const r = exportDxf(p, { imageSizes: sizes })
    const d = readDxf(r.text)
    const imgs = entities(d).filter((e) => e.type === 'IMAGE')
    expect(imgs).toHaveLength(p.scans.length + 1)
    const defs = d.sections.get('OBJECTS')!.filter((o) => o.type === 'IMAGEDEF')
    expect(defs).toHaveLength(imgs.length)
    expect(defs.map((x) => x.get(1))).toContain('.\\Processed_Images\\SCAN_9_FIT_A.png')
    expect(r.images.find((i) => i.fileName === 'SCAN_9_FIT_A.png')).toMatchObject({ sized: true })
    // Piece A: X 180 to 188.5 (8.5 in) by 30 in; along X it is the u vector times the pixel width.
    const defA = defs.find((x) => x.get(1)!.endsWith('SCAN_9_FIT_A.png'))!
    const a = imgs.find((e) => e.get(340) === defA.get(5))!
    const u = Math.hypot(Number(a.get(11)), Number(a.get(21)))
    const v = Math.hypot(Number(a.get(12)), Number(a.get(22)))
    expect(u * a.num(13)).toBeCloseTo(8.5, 6)
    expect(v * a.num(23)).toBeCloseTo(30, 6)
    expect(close(xy(a), tf(p.vessel.orientation as Orientation, 180, 100))).toBe(true)
    // Each image has its reactor, and the reactor points back at it.
    const reactors = d.sections.get('OBJECTS')!.filter((o) => o.type === 'IMAGEDEF_REACTOR')
    for (const img of imgs) expect(reactors.find((x) => x.get(5) === img.get(360))!.get(330)).toBe(img.get(5))
    // Without a size from the file: v5.0's 40 px per inch.
    const plain = readDxf(exportDxf(p).text)
    const pa = entities(plain).find((e) => e.type === 'IMAGE')!
    expect(pa.num(13)).toBe(fallbackPixels(24, 48)[0])
  })

  it('no images when "Use scan images" is off', () => {
    const d = readDxf(exportDxf({ ...sample, settings: { ...sample.settings, generateOverlayDrawing: false } }).text)
    expect(entities(d).filter((e) => e.type === 'IMAGE')).toHaveLength(0)
    expect(d.sections.get('OBJECTS')!.filter((o) => o.type === 'IMAGEDEF')).toHaveLength(0)
  })

  it('a moved label is where it was moved', () => {
    const moved = setOverride(sample, 'shellNozzles', 0, { label: { dx: 30, dy: 10 } })
    const pl = buildDrawing(moved).labels.find((l) => l.key === 'shellNozzles:0')!
    const d = readDxf(exportDxf(moved).text)
    const t = onLayer(d, 'SHELL_NOZZLE_TEXT', 'TEXT').find((e) => e.get(1) === 'N1')!
    expect(close(xy(t, 11), tf(moved.vessel.orientation as Orientation, pl.x, pl.y))).toBe(true)
  })

  it('MUT areas: solid outline, hatch lines, the ID', () => {
    const d = readDxf(exportDxf(sample).text)
    const a = mutAreaOf(sample, 'shellMut', 2)!
    const outlines = onLayer(d, 'MANUAL_UT', 'LWPOLYLINE')
    expect(outlines.some((e) => e.get(70) === '1' && e.num(90) === a.pieces[0].length)).toBe(true)
    expect(onLayer(d, 'MANUAL_UT_HATCH', 'LINE').length).toBeGreaterThan(10)
    expect(onLayer(d, 'SHELL_MUT_TEXT', 'TEXT').some((e) => e.get(1) === a.id)).toBe(true)
    const layers = d.sections.get('TABLES')!.filter((t) => t.type === 'LAYER')
    expect(layers.find((l) => l.get(2) === 'MANUAL_UT')!.get(62)).toBe('7')
  })

  it('arrowheads: closed ones as SOLIDs, dots as filled donuts', () => {
    const d = readDxf(exportDxf(sample).text)
    expect(onLayer(d, 'NOZZLE_LEADERS', 'SOLID').length).toBeGreaterThan(0)
    expect(entities(d).filter((e) => e.type === 'SOLID' && (e.get(8) === 'X_AXIS' || e.get(8) === 'Y_AXIS'))).toHaveLength(2)
    const dots = readDxf(exportDxf({ ...sample, settings: { ...sample.settings, arrowheadStyle: 'Dot' } }).text)
    const donut = onLayer(dots, 'NOZZLE_LEADERS', 'LWPOLYLINE').find((e) => e.get(42) === '1')!
    expect(donut.get(70)).toBe('1')
    expect(donut.num(43)).toBeGreaterThan(0)
  })

  it('layers: the .lsp set-up (SL_SetupLayers), colors, standard line weights, transparency, hidden ones off', () => {
    // The list here is the library's.
    const lib = lspOf(sample)
    const block = lib.slice(lib.indexOf('(defun SL_SetupLayers ()'), lib.indexOf('(SL_SetLayerTransparency "AUT_HATCH'))
    const vp = lib.slice(lib.indexOf('(defun SL_SetupViewportLayers ()'), lib.indexOf('(defun SL_AssignNormalViewportsToNonPlotLayer'))
    const fromLib = [...(block + vp).matchAll(/\(SL_Layer \\?"([A-Z_]+)\\?" (\d+)\)/g)].map((m) => [m[1], Number(m[2])])
    expect(fromLib).toEqual(SETUP_LAYERS.map(([n, c]) => [n, c]))
    const d = readDxf(exportDxf(sample, { hidden: new Set(['welds']) }).text)
    const layers = new Map(d.sections.get('TABLES')!.filter((t) => t.type === 'LAYER').map((t) => [t.get(2)!, t]))
    for (const name of [...SETUP_LAYERS.map(([n]) => n), 'NOZZLE_LEADERS', 'HEAD_NOZZLE_LEADERS', 'X_AXIS_LABEL_TEXT', 'Y_AXIS_LABEL_TEXT', 'REFERENCE_TEXT']) expect(layers.has(name)).toBe(true)
    expect(layers.get('X_AXIS')!.get(62)).toBe('1')
    expect(layers.get('CIRC_WELDS')!.get(62)).toBe('-7')
    expect(layers.get('VESSEL')!.get(370)).toBe('35')
    expect(layers.get('AUT_HATCH')!.get(370)).toBe('13')
    expect(layers.get('AUT_HATCH')!.get(1071)).toBe(String(transparencyValue(50)))
    expect(layers.get('CENTERLINE')!.get(1001)).toBe('AcCmTransparency')
    expect(layers.get('SCANS')!.get(1001)).toBeUndefined()
    expect(layers.get('SLG_VIEWPORTS')!.get(290)).toBe('0')
    expect(nearestLineWeight(0.18)).toBe(18)
    expect(nearestLineWeight(0.33)).toBe(35)
    // A color changed on the Drawing step.
    const red = readDxf(exportDxf({ ...sample, settings: { ...sample.settings, vesselColor: 1 } }).text)
    expect(red.sections.get('TABLES')!.find((t) => t.type === 'LAYER' && t.get(2) === 'VESSEL')!.get(62)).toBe('1')
  })

  it('text in the Standard style with Arial; the degree sign written as a CAD code', () => {
    const p = sampleProject()
    const d = readDxf(exportDxf({ ...p, vessel: { ...p.vessel, referenceLabelMode: 'Auto Cardinal', referenceLabelSet: 'NamePlate DC' }, settings: { ...p.settings, showVesselReferenceLabels: true } }).text)
    const style = d.sections.get('TABLES')!.find((t) => t.type === 'STYLE')!
    expect(style.get(2)).toBe('Standard')
    expect(style.get(3)).toBe('arial.ttf')
    expect(entities(d).some((e) => e.type === 'TEXT' && e.get(1)!.includes('\\U+00B0'))).toBe(true)
  })
})
