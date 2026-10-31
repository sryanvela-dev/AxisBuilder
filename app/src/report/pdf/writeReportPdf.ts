// The report PDF (report design 7): draws the page model (report/pageModel.ts) and nothing else, with pdf-lib in the
// browser, offline:
// - the brand fonts (Montserrat, Roboto) embedded whole (pdf-lib's subsetting dropped letters in Edge), real text
// - rules, boxes, tables and picture marks as vector paths
// - each picture embedded once (by its key) and placed with its phone (EXIF) orientation, turn and crop applied by
//   the placement matrix and a clip, never left to the viewer; marks drawn over it, clipped to it
// - drawing sheets through the drawing PDF's own code (export/pdf/writePdf drawSheetModel), so they always match
// - uploaded PDF pages copied as vectors (embedPage)
// - links from the contents, bookmarks for every section and every scan, title and author

import fontkit from '@pdf-lib/fontkit'
import {
  LineCapStyle, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, appendBezierCurve, clip, closePath, concatTransformationMatrix,
  beginText, drawObject, endPath, endText, fill, fillAndStroke, lineTo, moveTo, popGraphicsState, pushGraphicsState, rectangle, setFillingRgbColor, setFontAndSize, setGraphicsState,
  setLineCap, setLineWidth, setStrokingRgbColor, setTextMatrix, showText, stroke, type PDFEmbeddedPage, type PDFFont, type PDFImage, type PDFOperator, type PDFPage,
} from 'pdf-lib'
import { photoNeeds } from '../../engine/sheetModel.ts'
import { drawSheetModel, type PdfPhoto } from '../../export/pdf/writePdf.ts'
import { measure, type ReportFontId } from '../fonts.ts'
import { markItems } from '../marks.ts'
import { rectPath, storedToPage, type Bookmark, type ImageItem, type PageItem, type PathCmd, type ReportDocument } from '../pageModel.ts'
import type { FracBox } from '../schema.ts'

/** A picture ready to embed: its bytes and what part of the upright picture they show. */
export interface PreparedImage {
  bytes: Uint8Array
  format: 'jpg' | 'png'
  /** EXIF orientation still to apply to the bytes (1 when the bytes are already upright). */
  orientation: number
  /** Part of the upright picture the bytes show (a picture already cut to its crop); null = all of it. */
  region: FracBox | null
}

export interface ReportPdfInput {
  doc: ReportDocument
  fonts: Record<ReportFontId, Uint8Array>
  /** The drawing's font (Arimo), for drawing sheets. */
  drawingFont: Uint8Array
  /** ImageItem.key -> picture; a picture left out prints as a grey box. */
  images: ReadonlyMap<string, PreparedImage>
  /** Drawing photos by photoKey (as the drawing PDF), for the overlay drawing. */
  sheetPhotos: ReadonlyMap<string, PdfPhoto>
  /** Uploaded PDFs by file name. */
  pdfs: ReadonlyMap<string, Uint8Array>
  /** Fixed for tests; now otherwise. */
  date?: Date
}

const PT = 72
/** No ligatures or contextual forms: each letter its own glyph, so the text is exactly as measured and copies cleanly. */
const PLAIN = { liga: false, clig: false, calt: false, dlig: false }
const FULL: FracBox = { x0: 0, y0: 0, x1: 1, y1: 1 }
const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255]
const round = (n: number) => Math.round(n * 1000) / 1000

export async function writeReportPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const { doc: model } = input
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const fonts = {} as Record<ReportFontId, PDFFont>
  for (const [id, bytes] of Object.entries(input.fonts) as [ReportFontId, Uint8Array][]) fonts[id] = await pdf.embedFont(bytes, { subset: false, features: PLAIN })
  const hasSheets = model.pages.some((p) => p.items.some((i) => i.t === 'sheet'))
  const drawingFont = hasSheets ? await pdf.embedFont(input.drawingFont, { subset: false }) : null

  const date = input.date ?? new Date()
  pdf.setTitle(model.title)
  if (model.author) pdf.setAuthor(model.author)
  pdf.setSubject('AUT report')
  pdf.setCreator('AxisBuilder')
  pdf.setProducer('AxisBuilder (pdf-lib)')
  pdf.setCreationDate(date)
  pdf.setModificationDate(date)

  // Pictures, drawing photos and uploaded pages, each embedded once.
  const images = new Map<string, PDFImage>()
  for (const [key, im] of input.images) images.set(key, im.format === 'png' ? await pdf.embedPng(im.bytes) : await pdf.embedJpg(im.bytes))
  const photos = new Map<string, PDFImage>()
  const sheets = model.pages.flatMap((p) => p.items.flatMap((i) => (i.t === 'sheet' ? [i.model] : [])))
  for (const need of photoNeeds(sheets)) {
    const ph = input.sheetPhotos.get(need.key)
    if (ph && !photos.has(need.key)) photos.set(need.key, await pdf.embedJpg(ph.jpeg))
  }
  const embedded = new Map<string, PDFEmbeddedPage>()
  for (const page of model.pages) for (const it of page.items) {
    if (it.t !== 'pdfPage') continue
    const key = `${it.file}#${it.page}`
    const bytes = input.pdfs.get(it.file)
    if (!bytes || embedded.has(key)) continue
    try {
      const [e] = await pdf.embedPdf(bytes, [it.page - 1])
      embedded.set(key, e)
    } catch {
      // drawn as a grey box below
    }
  }

  const pages: PDFPage[] = model.pages.map((p) => pdf.addPage([p.size.w * PT, p.size.h * PT]))
  model.pages.forEach((p, i) => {
    const w = new ReportPageWriter(pdf, pages[i], p.size.h, fonts, images, input.images)
    for (const it of p.items) {
      if (it.t === 'sheet') {
        if (!drawingFont) continue
        const { box, region } = it
        const k = box.w / region.w
        const H = p.size.h
        w.ops(pushGraphicsState(), rectangle(box.x * PT, (H - box.y - box.h) * PT, box.w * PT, box.h * PT), clip(), endPath())
        drawSheetModel({ doc: pdf, page: pages[i], font: drawingFont, images: photos, ocgs: new Map() }, it.model, [PT * k, 0, 0, PT * k, PT * (box.x - region.x * k), PT * (H - box.y - (region.y + region.h) * k)])
        w.ops(popGraphicsState())
      } else if (it.t === 'pdfPage') {
        const e = embedded.get(`${it.file}#${it.page}`)
        if (e) w.pdfPage(e, it)
        else w.item({ t: 'rect', ...it.box, fill: '#EEF0F3', stroke: '#C9DAEA', width: 0.5, radius: 0 })
      } else if (it.t === 'link') {
        const H = p.size.h
        const annot = pdf.context.obj({
          Type: 'Annot', Subtype: 'Link', Border: [0, 0, 0],
          Rect: [it.x * PT, (H - it.y - it.h) * PT, (it.x + it.w) * PT, (H - it.y) * PT].map(round),
          Dest: [pages[it.page].ref, 'XYZ', null, null, null],
        })
        pages[i].node.addAnnot(pdf.context.register(annot))
      } else w.item(it)
    }
  })

  writeOutline(pdf, pages, model.bookmarks)
  return pdf.save({ useObjectStreams: true })
}

/** PDF bookmarks (the outline), opened beside the pages. */
function writeOutline(pdf: PDFDocument, pages: PDFPage[], bookmarks: readonly Bookmark[]) {
  if (bookmarks.length === 0) return
  const root = pdf.context.nextRef()
  const level = (list: readonly Bookmark[], parent: PDFRef): { first: PDFRef; last: PDFRef; count: number } => {
    const refs = list.map(() => pdf.context.nextRef())
    list.forEach((b, i) => {
      const dict = pdf.context.obj({ Title: PDFHexString.fromText(b.title), Parent: parent, Dest: [pages[b.page].ref, 'Fit'] })
      if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1])
      if (i < list.length - 1) dict.set(PDFName.of('Next'), refs[i + 1])
      if (b.children.length) {
        const kids = level(b.children, refs[i])
        dict.set(PDFName.of('First'), kids.first)
        dict.set(PDFName.of('Last'), kids.last)
        // Closed by default (negative count): scans stay folded under C-Scan Data.
        dict.set(PDFName.of('Count'), PDFNumber.of(-kids.count))
      }
      pdf.context.assign(refs[i], dict)
    })
    return { first: refs[0], last: refs[refs.length - 1], count: list.length }
  }
  const top = level(bookmarks, root)
  pdf.context.assign(root, pdf.context.obj({ Type: 'Outlines', First: top.first, Last: top.last, Count: top.count }))
  pdf.catalog.set(PDFName.of('Outlines'), root)
  pdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))
}

class ReportPageWriter {
  private gs = new Map<string, PDFName>()
  private xo = new Map<string, PDFName>()
  private pdf: PDFDocument
  private page: PDFPage
  private H: number
  private fonts: Record<ReportFontId, PDFFont>
  private images: ReadonlyMap<string, PDFImage>
  private prepared: ReadonlyMap<string, PreparedImage>

  constructor(pdf: PDFDocument, page: PDFPage, H: number, fonts: Record<ReportFontId, PDFFont>, images: ReadonlyMap<string, PDFImage>, prepared: ReadonlyMap<string, PreparedImage>) {
    this.pdf = pdf
    this.page = page
    this.H = H
    this.fonts = fonts
    this.images = images
    this.prepared = prepared
  }

  ops(...o: PDFOperator[]) {
    this.page.pushOperators(...o)
  }

  private fontKeys = new Map<ReportFontId, PDFName>()
  /** One font resource per font on the page (drawText would add one per text). */
  private fontKey(id: ReportFontId): PDFName {
    let key = this.fontKeys.get(id)
    if (!key) {
      key = this.page.node.newFontDictionary(id, this.fonts[id].ref)
      this.fontKeys.set(id, key)
    }
    return key
  }

  private X = (x: number) => round(x * PT)
  private Y = (y: number) => round((this.H - y) * PT)

  private opacity(stroke: number, fillA: number): PDFName {
    const key = `${stroke}/${fillA}`
    let name = this.gs.get(key)
    if (!name) {
      name = this.page.node.newExtGState('GS', this.pdf.context.obj({ Type: 'ExtGState', CA: stroke, ca: fillA }))
      this.gs.set(key, name)
    }
    return name
  }

  private pathOps(d: readonly PathCmd[]): PDFOperator[] {
    return d.map((c) => (c[0] === 'M' ? moveTo(this.X(c[1]), this.Y(c[2])) : c[0] === 'L' ? lineTo(this.X(c[1]), this.Y(c[2])) : c[0] === 'C' ? appendBezierCurve(this.X(c[1]), this.Y(c[2]), this.X(c[3]), this.Y(c[4]), this.X(c[5]), this.Y(c[6])) : closePath()))
  }

  private paint(d: readonly PathCmd[], strokeColor: string | null, fillColor: string | null, width: number, opacity = 1, fillOpacity = 1, cap: 'round' | 'butt' = 'butt') {
    if (!strokeColor && !fillColor) return
    const o: PDFOperator[] = [pushGraphicsState()]
    if (opacity < 1 || fillOpacity < 1) o.push(setGraphicsState(this.opacity(opacity, opacity * fillOpacity)))
    if (strokeColor) o.push(setStrokingRgbColor(...hex(strokeColor)), setLineWidth(width), setLineCap(cap === 'round' ? LineCapStyle.Round : LineCapStyle.Butt))
    if (fillColor) o.push(setFillingRgbColor(...hex(fillColor)))
    o.push(...this.pathOps(d), strokeColor && fillColor ? fillAndStroke() : fillColor ? fill() : stroke(), popGraphicsState())
    this.ops(...o)
  }

  item(it: PageItem) {
    switch (it.t) {
      case 'text': {
        if (it.text === '') return
        const font = this.fonts[it.font]
        const w = measure(it.text, it.font, it.size)
        const x = it.align === 'center' ? it.x - w / 2 : it.align === 'right' ? it.x - w : it.x
        this.ops(beginText(), setFontAndSize(this.fontKey(it.font), it.size), setFillingRgbColor(...hex(it.color)), setTextMatrix(1, 0, 0, 1, this.X(x), this.Y(it.y)), showText(font.encodeText(it.text)), endText())
        return
      }
      case 'line':
        this.paint([['M', it.x1, it.y1], ['L', it.x2, it.y2]], it.color, null, it.width)
        return
      case 'rect':
        this.paint(rectPath(it, it.radius), it.stroke, it.fill, it.width)
        return
      case 'path':
        this.paint(it.d, it.stroke, it.fill, it.width, it.opacity, it.fillOpacity, it.cap)
        return
      case 'image':
        this.image(it)
        return
      default:
        return
    }
  }

  private image(it: ImageItem) {
    const im = this.images.get(it.key)
    const prep = this.prepared.get(it.key)
    if (!im || !prep) {
      this.paint(rectPath(it), '#C9DAEA', '#EEF0F3', 0.5)
      return
    }
    let name = this.xo.get(it.key)
    if (!name) {
      name = this.page.node.newXObject('Im', im.ref)
      this.xo.set(it.key, name)
    }
    // Stored pixels -> page (inches, y down) -> PDF image space (unit square, y up) -> points.
    const [a, b, c, d, e, f] = storedToPage(it, prep.orientation, prep.region ?? FULL)
    const H = this.H
    this.ops(
      pushGraphicsState(),
      rectangle(this.X(it.x), this.Y(it.y + it.h), round(it.w * PT), round(it.h * PT)), clip(), endPath(),
      concatTransformationMatrix(round(PT * a), round(-PT * b), round(-PT * c), round(PT * d), round(PT * (c + e)), round(PT * (H - d - f))),
      drawObject(name),
      popGraphicsState(),
    )
    const marks = markItems(it)
    if (marks.length) {
      this.ops(pushGraphicsState(), rectangle(this.X(it.x), this.Y(it.y + it.h), round(it.w * PT), round(it.h * PT)), clip(), endPath())
      for (const m of marks) this.item(m)
      this.ops(popGraphicsState())
    }
  }

  pdfPage(e: PDFEmbeddedPage, it: Extract<PageItem, { t: 'pdfPage' }>) {
    const name = this.page.node.newXObject('Pg', e.ref)
    const [a, b, c, d, ee, f] = storedToPage({ ...it.box, crop: null, rotate: it.rotate }, 1)
    const W = e.width
    const Hs = e.height
    const H = this.H
    this.ops(
      pushGraphicsState(),
      concatTransformationMatrix(round((PT * a) / W), round((-PT * b) / W), round((-PT * c) / Hs), round((PT * d) / Hs), round(PT * (c + ee)), round(PT * (H - d - f))),
      drawObject(name),
      popGraphicsState(),
    )
  }
}

