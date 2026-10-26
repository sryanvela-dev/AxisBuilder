// A small ASCII DXF writer, R2000 (AC1015): header, classes, tables, blocks, entities and objects, with unique handles
// and owners, for the model-space drawing (export/dxf/exportDxf.ts). Only what the drawing needs: LINE, LWPOLYLINE,
// CIRCLE, ARC, TEXT, SOLID and IMAGE (with IMAGEDEF, IMAGEDEF_REACTOR and RASTERVARIABLES), layers with color, line
// weight and transparency, one text style. Written here rather than taken from a library: the format is plain text
// pairs, and the drawing needs exact control over layers, handles and image objects. Pure, no I/O.

export type Pt = [number, number]

/** Standard CAD line weights (hundredths of a millimetre). */
export const LINE_WEIGHTS_MM100 = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211] as const

/** The nearest standard line weight to `mm` millimetres (DXF code 370). */
export function nearestLineWeight(mm: number): number {
  const v = mm * 100
  return LINE_WEIGHTS_MM100.reduce((best, w) => (Math.abs(w - v) < Math.abs(best - v) ? w : best), 25 as number)
}

/** Layer transparency as AutoCAD keeps it (xdata AcCmTransparency): 0 = solid .. 90 = faint. */
export function transparencyValue(percent: number): number {
  const t = Math.min(90, Math.max(0, percent))
  return 0x02000000 + Math.round(255 * (1 - t / 100))
}

/** A number as DXF text: up to 6 decimals, no "-0". */
export function num(v: number): string {
  if (!Number.isFinite(v)) return '0'
  const r = Math.round(v * 1e6) / 1e6
  return Object.is(r, -0) || r === 0 ? '0' : String(r)
}

/** Text for a TEXT entity in an ANSI DXF: characters outside plain ASCII as \U+XXXX (the degree sign, accents). */
export function dxfText(s: string): string {
  let out = ''
  for (const ch of s.replace(/[\r\n]+/g, ' ')) {
    const c = ch.codePointAt(0)!
    out += c >= 32 && c < 127 ? ch : `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}`
  }
  return out
}

export interface DxfLayer {
  name: string
  /** ACI color 1-255. */
  color: number
  /** Hundredths of a millimetre (a standard weight). */
  lineWeight: number
  /** 0-90 %, or 0 for none. */
  transparency: number
  /** Turned off (written, but not shown). */
  off: boolean
  /** False: not printed (DXF 290). */
  plot: boolean
}

export type DxfEntity =
  | { t: 'LINE'; layer: string; a: Pt; b: Pt }
  | { t: 'LWPOLYLINE'; layer: string; pts: Pt[]; closed: boolean; bulges?: number[]; width?: number }
  | { t: 'CIRCLE'; layer: string; c: Pt; r: number }
  /** Degrees, counter-clockwise from a0 to a1. */
  | { t: 'ARC'; layer: string; c: Pt; r: number; a0: number; a1: number }
  /** just: MC (middle centre) or ML (middle left); at = the justification point; base = where the baseline starts (CAD recomputes it). */
  | { t: 'TEXT'; layer: string; at: Pt; base: Pt; h: number; rot: number; text: string; just: 'MC' | 'ML' }
  /** Three or four corners (a triangle repeats the last). */
  | { t: 'SOLID'; layer: string; pts: Pt[] }
  /** An image: insertion = its lower-left corner; u, v = one pixel across and up; px = its size in pixels. */
  | { t: 'IMAGE'; layer: string; file: string; at: Pt; u: Pt; v: Pt; px: [number, number] }

export interface DxfDrawing {
  layers: DxfLayer[]
  entities: DxfEntity[]
  /** Drawing extents (for Zoom Extents and the opening view). */
  extents: [number, number, number, number]
  /** Image frames shown (IMAGEFRAME). */
  imageFrames: boolean
  /** Text style font file (the CAD default style's font). */
  font: string
}

/** Writes the whole DXF file (CRLF line ends, ANSI text). */
export function writeDxf(d: DxfDrawing): string {
  const out: string[] = []
  const pair = (code: number, value: string | number) => {
    out.push(String(code).padStart(3, ' '), typeof value === 'number' ? num(value) : value)
  }
  const int = (code: number, value: number) => pair(code, String(Math.round(value)))
  let next = 0x20
  const handle = () => (next++).toString(16).toUpperCase()
  const pt = (code: number, q: Pt) => {
    pair(code, q[0])
    pair(code + 10, q[1])
    pair(code + 20, 0)
  }

  // Handles fixed before writing, as tables and objects point at each other.
  const H = {
    tVport: handle(), tLtype: handle(), tLayer: handle(), tStyle: handle(), tView: handle(), tUcs: handle(), tAppid: handle(), tDimstyle: handle(), tBlockRecord: handle(),
    vport: handle(), ltByBlock: handle(), ltByLayer: handle(), ltContinuous: handle(), style: handle(), appAcad: handle(), appTransp: handle(), dimstyle: handle(),
    brModel: handle(), brPaper: handle(), blkModel: handle(), endModel: handle(), blkPaper: handle(), endPaper: handle(),
    root: handle(), groups: handle(), plotStyles: handle(), plotNormal: handle(), layouts: handle(), layoutModel: handle(), layoutPaper: handle(), imageDict: handle(), imageVars: handle(),
  }
  const layerHandles = d.layers.map(() => handle())
  const entityHandles = d.entities.map(() => handle())
  const images = d.entities.flatMap((e, i) => (e.t === 'IMAGE' ? [{ e, h: entityHandles[i] }] : []))
  const files = [...new Set(images.map((x) => x.e.file))]
  const defHandles = new Map(files.map((f) => [f, handle()]))
  const reactorHandles = images.map(() => handle())
  const seed = handle()

  const [x0, y0, x1, y1] = d.extents
  const section = (name: string) => {
    pair(0, 'SECTION')
    pair(2, name)
  }
  const endsec = () => pair(0, 'ENDSEC')

  // --- HEADER
  section('HEADER')
  const hv = (name: string, code: number, value: string | number) => {
    pair(9, name)
    if (typeof value === 'number' && (code === 70 || code === 290 || code === 280 || code === 370 || code === 380)) int(code, value)
    else pair(code, value)
  }
  hv('$ACADVER', 1, 'AC1015')
  hv('$DWGCODEPAGE', 3, 'ANSI_1252')
  pair(9, '$INSBASE')
  pt(10, [0, 0])
  pair(9, '$EXTMIN')
  pt(10, [x0, y0])
  pair(9, '$EXTMAX')
  pt(10, [x1, y1])
  pair(9, '$LIMMIN')
  pair(10, x0)
  pair(20, y0)
  pair(9, '$LIMMAX')
  pair(10, x1)
  pair(20, y1)
  hv('$INSUNITS', 70, 1)
  hv('$MEASUREMENT', 70, 0)
  hv('$LUNITS', 70, 2)
  hv('$CLAYER', 8, '0')
  hv('$CELTYPE', 6, 'ByLayer')
  hv('$TEXTSTYLE', 7, 'Standard')
  hv('$LWDISPLAY', 290, 1)
  hv('$CELWEIGHT', 370, -1)
  hv('$HANDSEED', 5, seed)
  endsec()

  // --- CLASSES (the objects that are not built into R12: layouts, the plot style dictionary, the image objects)
  section('CLASSES')
  const cls = (name: string, cpp: string, proxy: number, entity: number, app = 'ISM') => {
    pair(0, 'CLASS')
    pair(1, name)
    pair(2, cpp)
    pair(3, app)
    int(90, proxy)
    int(280, 0)
    int(281, entity)
  }
  cls('ACDBDICTIONARYWDFLT', 'AcDbDictionaryWithDefault', 0, 0, 'ObjectDBX Classes')
  cls('ACDBPLACEHOLDER', 'AcDbPlaceHolder', 0, 0, 'ObjectDBX Classes')
  cls('LAYOUT', 'AcDbLayout', 0, 0, 'ObjectDBX Classes')
  cls('RASTERVARIABLES', 'AcDbRasterVariables', 0, 0)
  cls('IMAGEDEF', 'AcDbRasterImageDef', 0, 0)
  cls('IMAGEDEF_REACTOR', 'AcDbRasterImageDefReactor', 1, 0)
  cls('IMAGE', 'AcDbRasterImage', 127, 1)
  endsec()

  // --- TABLES
  section('TABLES')
  const table = (name: string, h: string, count: number, sub?: () => void) => {
    pair(0, 'TABLE')
    pair(2, name)
    pair(5, h)
    pair(330, '0')
    pair(100, 'AcDbSymbolTable')
    int(70, count)
    sub?.()
  }
  const record = (type: string, h: string, owner: string, sub: string, name: string, handleCode = 5) => {
    pair(0, type)
    pair(handleCode, h)
    pair(330, owner)
    pair(100, 'AcDbSymbolTableRecord')
    pair(100, sub)
    pair(2, name)
    int(70, 0)
  }
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const height = Math.max(1, (y1 - y0) * 1.1)
  table('VPORT', H.tVport, 1)
  record('VPORT', H.vport, H.tVport, 'AcDbViewportTableRecord', '*Active')
  pair(10, 0); pair(20, 0); pair(11, 1); pair(21, 1); pair(12, cx); pair(22, cy); pair(13, 0); pair(23, 0); pair(14, 0.5); pair(24, 0.5)
  pair(15, 0.5); pair(25, 0.5); pair(16, 0); pair(26, 0); pair(36, 1); pair(17, 0); pair(27, 0); pair(37, 0)
  pair(40, height); pair(41, Math.max(0.2, (x1 - x0) / Math.max(1e-6, y1 - y0))); pair(42, 50); pair(43, 0); pair(44, 0); pair(50, 0); pair(51, 0)
  int(71, 0); int(72, 1000); int(73, 1); int(74, 3); int(75, 0); int(76, 0); int(77, 0); int(78, 0)
  pair(0, 'ENDTAB')

  table('LTYPE', H.tLtype, 3)
  for (const [h, name, text] of [[H.ltByBlock, 'ByBlock', ''], [H.ltByLayer, 'ByLayer', ''], [H.ltContinuous, 'Continuous', 'Solid line']]) {
    record('LTYPE', h, H.tLtype, 'AcDbLinetypeTableRecord', name)
    pair(3, text)
    int(72, 65)
    int(73, 0)
    pair(40, 0)
  }
  pair(0, 'ENDTAB')

  table('LAYER', H.tLayer, d.layers.length)
  d.layers.forEach((l, i) => {
    record('LAYER', layerHandles[i], H.tLayer, 'AcDbLayerTableRecord', l.name)
    int(62, l.off ? -l.color : l.color)
    pair(6, 'Continuous')
    if (!l.plot) int(290, 0)
    int(370, l.lineWeight)
    // AutoCAD refuses an R2000 layer without its plot style (the Normal placeholder below).
    pair(390, H.plotNormal)
    if (l.transparency > 0) {
      pair(1001, 'AcCmTransparency')
      int(1071, transparencyValue(l.transparency))
    }
  })
  pair(0, 'ENDTAB')

  table('STYLE', H.tStyle, 1)
  record('STYLE', H.style, H.tStyle, 'AcDbTextStyleTableRecord', 'Standard')
  pair(40, 0)
  pair(41, 1)
  pair(50, 0)
  int(71, 0)
  pair(42, 2.5)
  pair(3, d.font)
  pair(4, '')
  pair(0, 'ENDTAB')

  table('VIEW', H.tView, 0)
  pair(0, 'ENDTAB')
  table('UCS', H.tUcs, 0)
  pair(0, 'ENDTAB')

  table('APPID', H.tAppid, 2)
  record('APPID', H.appAcad, H.tAppid, 'AcDbRegAppTableRecord', 'ACAD')
  record('APPID', H.appTransp, H.tAppid, 'AcDbRegAppTableRecord', 'AcCmTransparency')
  pair(0, 'ENDTAB')

  table('DIMSTYLE', H.tDimstyle, 1, () => {
    pair(100, 'AcDbDimStyleTable')
    int(71, 0)
  })
  record('DIMSTYLE', H.dimstyle, H.tDimstyle, 'AcDbDimStyleTableRecord', 'Standard', 105)
  pair(340, H.style)
  pair(0, 'ENDTAB')

  table('BLOCK_RECORD', H.tBlockRecord, 2)
  for (const [h, name, layout] of [[H.brModel, '*Model_Space', H.layoutModel], [H.brPaper, '*Paper_Space', H.layoutPaper]]) {
    pair(0, 'BLOCK_RECORD')
    pair(5, h)
    pair(330, H.tBlockRecord)
    pair(100, 'AcDbSymbolTableRecord')
    pair(100, 'AcDbBlockTableRecord')
    pair(2, name)
    pair(340, layout)
  }
  pair(0, 'ENDTAB')
  endsec()

  // --- BLOCKS
  section('BLOCKS')
  for (const [bh, eh, rec, name, paper] of [[H.blkModel, H.endModel, H.brModel, '*Model_Space', false], [H.blkPaper, H.endPaper, H.brPaper, '*Paper_Space', true]] as const) {
    pair(0, 'BLOCK')
    pair(5, bh)
    pair(330, rec)
    pair(100, 'AcDbEntity')
    if (paper) int(67, 1)
    pair(8, '0')
    pair(100, 'AcDbBlockBegin')
    pair(2, name)
    int(70, 0)
    pt(10, [0, 0])
    pair(3, name)
    pair(1, '')
    pair(0, 'ENDBLK')
    pair(5, eh)
    pair(330, rec)
    pair(100, 'AcDbEntity')
    if (paper) int(67, 1)
    pair(8, '0')
    pair(100, 'AcDbBlockEnd')
  }
  endsec()

  // --- ENTITIES (all in model space, BYLAYER)
  section('ENTITIES')
  let imageNo = 0
  d.entities.forEach((e, i) => {
    pair(0, e.t)
    pair(5, entityHandles[i])
    pair(330, H.brModel)
    pair(100, 'AcDbEntity')
    pair(8, e.layer)
    switch (e.t) {
      case 'LINE':
        pair(100, 'AcDbLine')
        pt(10, e.a)
        pt(11, e.b)
        break
      case 'LWPOLYLINE':
        pair(100, 'AcDbPolyline')
        int(90, e.pts.length)
        int(70, e.closed ? 1 : 0)
        pair(43, e.width ?? 0)
        e.pts.forEach((q, k) => {
          pair(10, q[0])
          pair(20, q[1])
          if (e.bulges && e.bulges[k]) pair(42, e.bulges[k])
        })
        break
      case 'CIRCLE':
        pair(100, 'AcDbCircle')
        pt(10, e.c)
        pair(40, e.r)
        break
      case 'ARC':
        pair(100, 'AcDbCircle')
        pt(10, e.c)
        pair(40, e.r)
        pair(100, 'AcDbArc')
        pair(50, angle(e.a0))
        pair(51, angle(e.a1))
        break
      case 'TEXT':
        pair(100, 'AcDbText')
        pt(10, e.base)
        pair(40, e.h)
        pair(1, dxfText(e.text))
        pair(50, angle(e.rot))
        pair(7, 'Standard')
        int(72, e.just === 'MC' ? 1 : 0)
        pt(11, e.at)
        pair(100, 'AcDbText')
        int(73, 2)
        break
      case 'SOLID': {
        const q = e.pts.length === 3 ? [e.pts[0], e.pts[1], e.pts[2], e.pts[2]] : e.pts
        pair(100, 'AcDbTrace')
        pt(10, q[0])
        pt(11, q[1])
        pt(12, q[2])
        pt(13, q[3])
        break
      }
      case 'IMAGE':
        pair(100, 'AcDbRasterImage')
        int(90, 0)
        pt(10, e.at)
        pt(11, e.u)
        pt(12, e.v)
        pair(13, e.px[0])
        pair(23, e.px[1])
        pair(340, defHandles.get(e.file)!)
        int(70, 7)
        int(280, 0)
        int(281, 50)
        int(282, 50)
        int(283, 0)
        pair(360, reactorHandles[imageNo])
        int(71, 1)
        int(91, 2)
        pair(14, -0.5)
        pair(24, -0.5)
        pair(14, e.px[0] - 0.5)
        pair(24, e.px[1] - 0.5)
        imageNo++
        break
    }
  })
  endsec()

  // --- OBJECTS
  section('OBJECTS')
  const dict = (h: string, owner: string, entries: [string, string][]) => {
    pair(0, 'DICTIONARY')
    pair(5, h)
    pair(330, owner)
    pair(100, 'AcDbDictionary')
    int(281, 1)
    for (const [name, eh] of entries) {
      pair(3, name)
      pair(350, eh)
    }
  }
  dict(H.root, '0', [['ACAD_GROUP', H.groups], ['ACAD_IMAGE_DICT', H.imageDict], ['ACAD_IMAGE_VARS', H.imageVars], ['ACAD_LAYOUT', H.layouts], ['ACAD_PLOTSTYLENAME', H.plotStyles]])
  dict(H.groups, H.root, [])
  // The plot style names: "Normal" only, the default every layer points at.
  pair(0, 'ACDBDICTIONARYWDFLT')
  pair(5, H.plotStyles)
  pair(102, '{ACAD_REACTORS')
  pair(330, H.root)
  pair(102, '}')
  pair(330, H.root)
  pair(100, 'AcDbDictionary')
  int(281, 1)
  pair(3, 'Normal')
  pair(350, H.plotNormal)
  pair(100, 'AcDbDictionaryWithDefault')
  pair(340, H.plotNormal)
  pair(0, 'ACDBPLACEHOLDER')
  pair(5, H.plotNormal)
  pair(102, '{ACAD_REACTORS')
  pair(330, H.plotStyles)
  pair(102, '}')
  pair(330, H.plotStyles)
  dict(H.layouts, H.root, [['Layout1', H.layoutPaper], ['Model', H.layoutModel]])
  const imageName = (f: string) => f.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '')
  dict(H.imageDict, H.root, files.map((f): [string, string] => [imageName(f), defHandles.get(f)!]))
  layout(H.layoutModel, 'Model', 0, H.brModel, true)
  layout(H.layoutPaper, 'Layout1', 1, H.brPaper, false)

  pair(0, 'RASTERVARIABLES')
  pair(5, H.imageVars)
  pair(102, '{ACAD_REACTORS')
  pair(330, H.root)
  pair(102, '}')
  pair(330, H.root)
  pair(100, 'AcDbRasterVariables')
  int(90, 0)
  int(70, d.imageFrames ? 1 : 0)
  int(71, 1)
  int(72, 0)

  for (const f of files) {
    const users = images.map((x, k) => ({ ...x, r: reactorHandles[k] })).filter((x) => x.e.file === f)
    const first = users[0].e
    pair(0, 'IMAGEDEF')
    pair(5, defHandles.get(f)!)
    pair(102, '{ACAD_REACTORS')
    pair(330, H.imageDict)
    for (const u of users) pair(330, u.r)
    pair(102, '}')
    pair(330, H.imageDict)
    pair(100, 'AcDbRasterImageDef')
    int(90, 0)
    pair(1, f)
    pair(10, first.px[0])
    pair(20, first.px[1])
    pair(11, Math.hypot(first.u[0], first.u[1]))
    pair(21, Math.hypot(first.v[0], first.v[1]))
    int(280, 1)
    int(281, 0)
  }
  images.forEach((x, k) => {
    pair(0, 'IMAGEDEF_REACTOR')
    pair(5, reactorHandles[k])
    pair(330, x.h)
    pair(100, 'AcDbRasterImageDefReactor')
    int(90, 2)
    pair(330, x.h)
  })
  endsec()
  pair(0, 'EOF')
  return out.join('\r\n') + '\r\n'

  /** A LAYOUT object (plot settings left at CAD's defaults). */
  function layout(h: string, name: string, tab: number, blockRecord: string, model: boolean) {
    pair(0, 'LAYOUT')
    pair(5, h)
    pair(102, '{ACAD_REACTORS')
    pair(330, H.layouts)
    pair(102, '}')
    pair(330, H.layouts)
    pair(100, 'AcDbPlotSettings')
    pair(1, '')
    pair(2, 'none_device')
    pair(4, '')
    pair(6, '')
    for (const c of [40, 41, 42, 43, 44, 45, 46, 47, 48, 49]) pair(c, 0)
    pair(140, 0)
    pair(141, 0)
    pair(142, 1)
    pair(143, 1)
    int(70, model ? 1712 : 688)
    int(72, 0)
    int(73, 0)
    int(74, 5)
    pair(7, '')
    int(75, 16)
    pair(147, 1)
    pair(148, 0)
    pair(149, 0)
    pair(100, 'AcDbLayout')
    pair(1, name)
    int(70, 1)
    int(71, tab)
    pair(10, 0)
    pair(20, 0)
    pair(11, 12)
    pair(21, 9)
    pt(12, [0, 0])
    pt(14, model ? [x0, y0] : [0, 0])
    pt(15, model ? [x1, y1] : [0, 0])
    pair(146, 0)
    pt(13, [0, 0])
    pair(16, 1)
    pair(26, 0)
    pair(36, 0)
    pair(17, 0)
    pair(27, 1)
    pair(37, 0)
    int(76, 0)
    pair(330, blockRecord)
  }
}

/** An angle in degrees in 0..360. */
function angle(a: number): number {
  const r = ((a % 360) + 360) % 360
  return Math.abs(r - 360) < 1e-9 ? 0 : r
}
