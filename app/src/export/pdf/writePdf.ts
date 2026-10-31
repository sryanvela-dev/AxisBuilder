// The PDF (Phase 4b): one letter page per sheet of the sheet model (engine/sheetModel.ts), the same model the
// Sheets view and the report images draw. pdf-lib writes it in the browser, offline:
// - lines, rectangles, circles, arcs and hatch as vector paths, with the print color and the layer's line
//   weight; hatch and centerline transparency as ExtGState opacity
// - text as real text in the bundled Arimo font (embedded as a subset, with a ToUnicode map, so it can be
//   searched and copied)
// - each photo embedded once as a JPEG (made by the caller at about the PDF photo resolution of its largest
//   printed size) and placed on every sheet that shows it
// - optionally PDF layers (optional content groups) named like the CAD groups, so a viewer can switch off
//   Photos, Hatch, Welds, ... as ABIMAGES, ABHATCH, ... do in CAD.

import fontkit from '@pdf-lib/fontkit'
import {
  LineCapStyle, LineJoinStyle, PDFDict, PDFDocument, PDFHexString, PDFName, PDFOperator, PDFOperatorNames, PDFRef, appendBezierCurve, clip,
  closePath, concatTransformationMatrix, degrees, drawObject, endMarkedContent, endPath, lineTo, moveTo, popGraphicsState, pushGraphicsState,
  rectangle, rgb, setGraphicsState, setLineCap, setLineJoin, setLineWidth, setFillingRgbColor, setStrokingRgbColor, fillAndStroke, stroke, type PDFFont, type PDFImage, type PDFPage,
} from 'pdf-lib'
import { printRgb } from '../../engine/aci.ts'
import { LAYER_GROUPS } from '../../engine/drawing.ts'
import { drawSteps, photoKey, textGeometry, type DrawStep, type ImagePrim, type PrimGroup, type SheetModel, type TextPrim } from '../../engine/sheetModel.ts'

export interface PdfPhoto {
  /** JPEG bytes, already cropped (seam pieces) and fitted to the scan's shape. */
  jpeg: Uint8Array
  width: number
  height: number
}

export interface PdfInput {
  models: readonly SheetModel[]
  /** The bundled TrueType font. */
  font: Uint8Array
  /** photoKey -> photo; photos left out are not drawn (the summary says which). */
  photos: ReadonlyMap<string, PdfPhoto>
  /** Write PDF layers named like the CAD groups. */
  layers: boolean
  title: string
  /** Fixed for tests; now otherwise. */
  date?: Date
}

/** PDF layer names: the preview's group names ("Photos" for the images, as on the layer toggles). */
export function pdfLayerName(g: PrimGroup): string | null {
  if (g === 'always' || g === 'sheet' || g === 'sections') return null
  if (g === 'panel') return pdfLayerName('info')
  if (g === 'images') return 'Photos'
  return LAYER_GROUPS.find((x) => x.id === g)?.name ?? null
}

const PT = 72

export async function writePdf(input: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  // The whole font: pdf-lib's subsetting dropped most letters in Edge (only a few glyphs survived).
  const font = await doc.embedFont(input.font, { subset: false })
  const date = input.date ?? new Date()
  doc.setTitle(input.title)
  doc.setCreator('AxisBuilder')
  doc.setProducer('AxisBuilder (pdf-lib)')
  doc.setCreationDate(date)
  doc.setModificationDate(date)

  const images = new Map<string, PDFImage>()
  for (const [key, ph] of input.photos) images.set(key, await doc.embedJpg(ph.jpeg))

  // PDF layers, in the order of the preview's layer toggles.
  const ocgs = new Map<string, PDFRef>()
  if (input.layers) {
    const used = new Set<string>()
    for (const m of input.models) for (const p of [...m.drawing, ...m.sheet]) {
      const n = pdfLayerName(p.group)
      if (n) used.add(n)
    }
    const order = [...LAYER_GROUPS.map((g) => pdfLayerName(g.id)!), ...used].filter((n, i, a) => used.has(n) && a.indexOf(n) === i)
    for (const name of order) ocgs.set(name, doc.context.register(doc.context.obj({ Type: 'OCG', Name: PDFHexString.fromText(name) })))
    if (ocgs.size) {
      const refs = [...ocgs.values()]
      doc.catalog.set(PDFName.of('OCProperties'), doc.context.obj({ OCGs: refs, D: { Name: PDFHexString.fromText('Layers'), Order: refs, ON: refs, OFF: [] } }))
    }
  }

  for (const m of input.models) {
    const page = doc.addPage([m.paper.w * PT, m.paper.h * PT])
    drawSheetModel({ doc, page, font, images, ocgs }, m, [PT, 0, 0, PT, 0, 0])
  }
  return doc.save({ useObjectStreams: true })
}

/** What drawing a sheet on a page needs: the document, the page, the drawing font, the embedded photos and layers. */
export interface SheetTarget {
  doc: PDFDocument
  page: PDFPage
  font: PDFFont
  /** photoKey -> embedded photo. */
  images: ReadonlyMap<string, PDFImage>
  ocgs: ReadonlyMap<string, PDFRef>
}

/**
 * Draws a sheet model on a page: `matrix` maps the sheet's paper inches (y up) to the page's points. The drawing PDF
 * places it at 72 points per inch; the report PDF scales it into a box (report/pdf), so both print the same sheet.
 */
export function drawSheetModel(t: SheetTarget, m: SheetModel, matrix: [number, number, number, number, number, number]) {
  const { page } = t
  const w = new PageWriter(t.doc, page, t.font, t.images, t.ocgs, m.soft)
  // Paper inches from here on.
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...matrix), setLineCap(LineCapStyle.Round), setLineJoin(LineJoinStyle.Round))
  if (m.clip) page.pushOperators(pushGraphicsState(), rectangle(m.clip.x, m.clip.y, m.clip.w, m.clip.h), clip(), endPath())
  w.steps(drawSteps(m.drawing))
  if (m.clip) page.pushOperators(popGraphicsState())
  w.steps(drawSteps(m.sheet))
  page.pushOperators(popGraphicsState())
}

class PageWriter {
  private gs = new Map<number, PDFName>()
  private xo = new Map<string, PDFName>()
  private props = new Map<string, PDFName>()
  private open: string | null = null

  private doc: PDFDocument
  private page: PDFPage
  private font: PDFFont
  private images: ReadonlyMap<string, PDFImage>
  private ocgs: ReadonlyMap<string, PDFRef>
  private soft: boolean

  constructor(doc: PDFDocument, page: PDFPage, font: PDFFont, images: ReadonlyMap<string, PDFImage>, ocgs: ReadonlyMap<string, PDFRef>, soft: boolean) {
    this.soft = soft
    this.doc = doc
    this.page = page
    this.font = font
    this.images = images
    this.ocgs = ocgs
  }

  steps(list: readonly DrawStep[]) {
    for (const s of list) {
      this.layer(pdfLayerName(s.kind === 'path' ? s.group : s.prim.group))
      if (s.kind === 'path') this.path(s)
      else if (s.kind === 'text') this.text(s.prim)
      else this.image(s.prim)
    }
    this.layer(null)
  }

  /** Marked content for a PDF layer (BDC /OC /ocN ... EMC). */
  private layer(name: string | null) {
    const ref = name ? this.ocgs.get(name) : undefined
    const want = ref ? name : null
    if (want === this.open) return
    if (this.open) this.page.pushOperators(endMarkedContent())
    this.open = null
    if (!want || !ref) return
    let key = this.props.get(want)
    if (!key) {
      key = PDFName.of(`OC${this.props.size + 1}`)
      const res = this.page.node.Resources()!
      let dict = res.lookupMaybe(PDFName.of('Properties'), PDFDict)
      if (!dict) {
        dict = this.doc.context.obj({})
        res.set(PDFName.of('Properties'), dict)
      }
      dict.set(key, ref)
      this.props.set(want, key)
    }
    this.page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('OC'), key]))
    this.open = want
  }

  private opacity(a: number): PDFName {
    let key = this.gs.get(a)
    if (!key) {
      key = this.page.node.newExtGState('GS', this.doc.context.obj({ Type: 'ExtGState', CA: a, ca: a }))
      this.gs.set(a, key)
    }
    return key
  }

  private path(s: DrawStep & { kind: 'path' }) {
    const [r, g, b] = printRgb(s.style.color, this.soft)
    const ops: PDFOperator[] = [pushGraphicsState(), setLineWidth(round(s.style.weight)), setStrokingRgbColor(r / 255, g / 255, b / 255)]
    if (s.style.opacity < 1) ops.push(setGraphicsState(this.opacity(s.style.opacity)))
    for (const o of s.ops) {
      if (o[0] === 'M') ops.push(moveTo(round(o[1]), round(o[2])))
      else if (o[0] === 'L') ops.push(lineTo(round(o[1]), round(o[2])))
      else if (o[0] === 'C') ops.push(appendBezierCurve(round(o[1]), round(o[2]), round(o[3]), round(o[4]), round(o[5]), round(o[6])))
      else ops.push(closePath())
    }
    if (s.fill) ops.push(setFillingRgbColor(r / 255, g / 255, b / 255), fillAndStroke(), popGraphicsState())
    else ops.push(stroke(), popGraphicsState())
    this.page.pushOperators(...ops)
  }

  private text(p: TextPrim) {
    const g = textGeometry(p)
    const [r, gg, b] = printRgb(p.style.color, this.soft)
    this.page.drawText(p.text, { x: round(g.start[0]), y: round(g.start[1]), size: round(g.size), font: this.font, color: rgb(r / 255, gg / 255, b / 255), rotate: degrees(p.rot) })
  }

  private image(p: ImagePrim) {
    const img = this.images.get(photoKey(p))
    if (!img) return
    let key = this.xo.get(photoKey(p))
    if (!key) {
      key = this.page.node.newXObject('Im', img.ref)
      this.xo.set(photoKey(p), key)
    }
    const rad = (p.rot * Math.PI) / 180
    const c = Math.cos(rad)
    const s = Math.sin(rad)
    // The image's unit square -> its place on the paper: (0,0) at its bottom-left corner, turned with the drawing.
    this.page.pushOperators(pushGraphicsState(), concatTransformationMatrix(round(p.w * c), round(p.w * s), round(-p.h * s), round(p.h * c), round(p.x), round(p.y)), drawObject(key), popGraphicsState())
  }
}

/** Six decimals of an inch are far below what any printer shows, and keep the file small. */
const round = (n: number) => Math.round(n * 1e6) / 1e6
