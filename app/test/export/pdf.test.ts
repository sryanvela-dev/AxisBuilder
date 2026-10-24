// The PDF and the report images (Phase 4b), for every golden job and the sample job, section sheets off and on.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFStream, decodePDFRawStream, type PDFPage } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { FONT_FILE, renderFontMetrics } from '../../scripts/gen-font-metrics.ts'
import { buildDrawing, type LayerGroup } from '../../src/engine/drawing.ts'
import { activeSectionPlan } from '../../src/engine/sections.ts'
import { drawSteps, photoNeeds, sheetModels, textGeometry, type SheetModel } from '../../src/engine/sheetModel.ts'
import type { Project } from '../../src/data/schema.ts'
import { exportRuns } from '../../src/export/exportSets.ts'
import { reportImageNames } from '../../src/export/files.ts'
import { printPhotoSize } from '../../src/export/pdf/photos.ts'
import { pdfLayerName } from '../../src/export/pdf/writePdf.ts'
import { drawReportSheet, encodeReportJpeg, jpegInfo, reportFrame, type Ctx2D, type ReportCrop } from '../../src/export/report/reportImages.ts'
import { SheetsView } from '../../src/ui/preview/SheetsView.tsx'
import { FONT, PHOTO, goldenJobs, jobPdf, withSections } from './pdfJobs.ts'

/** Largest PDF allowed for a golden job (made-up photos at 300 dpi): the biggest today is about 1.3 MB. */
const PDF_LIMIT = 5 * 1024 * 1024
const LETTER = [[612, 792], [792, 612]]

function contentText(page: PDFPage): string {
  const c = page.node.Contents()
  const streams = c instanceof PDFArray ? c.asArray().map((r) => page.doc.context.lookup(r) as PDFStream) : c ? [c] : []
  return streams.map((s) => new TextDecoder('latin1').decode(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents())).join('\n')
}

function toUnicodeMaps(doc: PDFDocument): string {
  const out: string[] = []
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) continue
    const text = new TextDecoder('latin1').decode(decodePDFRawStream(obj).decode())
    if (text.includes('begincmap')) out.push(text.toLowerCase())
  }
  return out.join('\n')
}

const jobs = goldenJobs()

describe.each(jobs.flatMap((j) => [false, true].map((on) => ({ ...j, on }))))('PDF of $name, sections $on', ({ project, on }) => {
  it('has a letter page per sheet, its text, photos and layers, within the size limit', async () => {
    const p = withSections(project, on)
    const r = await jobPdf(p)
    expect(r.bytes.length).toBeLessThan(PDF_LIMIT)
    const doc = await PDFDocument.load(r.bytes)
    const plan = activeSectionPlan(p)
    expect(doc.getPageCount()).toBe(r.models.length)
    expect(r.models.length).toBe(on && plan ? 1 + (plan.overview ? 1 : 0) + plan.sections.length : 1)
    expect(r.models[0].kind).toBe('main')
    const chars = new Set<string>()
    doc.getPages().forEach((page, i) => {
      const m = r.models[i]
      const { width, height } = page.getSize()
      expect(LETTER).toContainEqual([width, height])
      expect([width, height]).toEqual([m.paper.w * 72, m.paper.h * 72])
      // Every text of the sheet is real text (one Tj each).
      const texts = [...m.drawing, ...m.sheet].filter((x) => x.t === 'text')
      for (const t of texts) for (const ch of t.text) chars.add(ch)
      expect(contentText(page).match(/ Tj$/gm)?.length ?? 0).toBe(texts.length)
    })
    expect(chars.size).toBeGreaterThan(10)
    // Searchable: the font's ToUnicode map has every character used.
    const cmap = toUnicodeMaps(doc)
    for (const ch of chars) if (ch !== ' ') expect(cmap, `character ${ch}`).toContain(`<${ch.codePointAt(0)!.toString(16).padStart(4, '0')}>`)
    // Photos: each embedded once, at the shape-fixed size capped at 300 dpi of its largest printed size.
    const needs = photoNeeds(r.models)
    expect(r.photoSizes.size).toBe(needs.length)
    for (const n of needs) {
      const part = n.crop ? Math.round(PHOTO.width * n.crop[1]) - Math.round(PHOTO.width * n.crop[0]) : PHOTO.width
      expect(r.photoSizes.get(n.key)).toEqual(printPhotoSize(part, PHOTO.height, n.printedW, n.printedH, 300))
      expect(r.photoSizes.get(n.key)!.width).toBeLessThanOrEqual(Math.round(n.printedW * 300) + 1)
    }
    const images = [...doc.context.enumerateIndirectObjects()].filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))
    expect(images.length).toBe(needs.length)
    const embedded = images.map(([, o]) => `${((o as PDFRawStream).dict.get(PDFName.of('Width')) as PDFNumber).asNumber()}x${((o as PDFRawStream).dict.get(PDFName.of('Height')) as PDFNumber).asNumber()}`).sort()
    expect(embedded).toEqual([...r.photoSizes.values()].map((s) => `${s.width}x${s.height}`).sort())
    // PDF layers named like the CAD groups.
    const oc = doc.catalog.lookup(PDFName.of('OCProperties'), PDFDict)
    const names = (oc.lookup(PDFName.of('OCGs'), PDFArray).asArray().map((ref) => (doc.context.lookup(ref, PDFDict).get(PDFName.of('Name')) as unknown as { decodeText(): string }).decodeText()))
    expect(names).toContain('Scans')
    expect(names).toContain('Legend and title')
    if (needs.length) expect(names).toContain('Photos')
  }, 60000)
})

describe('PDF options', () => {
  it('embeds the whole font (a subset lost most letters in Edge)', async () => {
    const r = await jobPdf(jobs[0].project)
    const doc = await PDFDocument.load(r.bytes)
    const sizes = [...doc.context.enumerateIndirectObjects()].flatMap(([, o]) =>
      o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image') ? [decodePDFRawStream(o).decode().length] : [])
    expect(Math.max(...sizes)).toBe(FONT.length)
  })

  it('writes no layers when PDF layers are off', async () => {
    const r = await jobPdf(jobs[0].project, 300, false)
    const doc = await PDFDocument.load(r.bytes)
    expect(doc.catalog.get(PDFName.of('OCProperties'))).toBeUndefined()
  })

  it('embeds photos smaller at a lower photo resolution', async () => {
    const hi = await jobPdf(jobs[0].project, 300)
    const lo = await jobPdf(jobs[0].project, 100)
    expect(lo.bytes.length).toBeLessThan(hi.bytes.length)
  })

  it('names the PDF layers like the preview toggles', () => {
    expect(pdfLayerName('images')).toBe('Photos')
    expect(pdfLayerName('panel')).toBe('Legend and title')
    expect(pdfLayerName('sheet')).toBeNull()
    expect(pdfLayerName('always')).toBeNull()
  })
})

describe('export sets and the main sheet', () => {
  const p = jobs.find((j) => j.name === 'REF1')!.project
  const groups = (run: { hidden: ReadonlySet<LayerGroup> }) => {
    const [m] = sheetModels(p, buildDrawing(p), null, { hidden: run.hidden })
    return new Set(m.drawing.map((x) => x.group))
  }

  it('scans leave out the photos, overlays the hatch; the other preview chips still count', () => {
    const [scans, overlays] = exportRuns('Both scans and overlays', ['welds', 'images', 'hatch', 'scans'])
    expect(scans.suffix).toBe(' - Scans')
    expect(overlays.suffix).toBe(' - Overlays')
    const a = groups(scans)
    expect(a.has('images')).toBe(false)
    expect(a.has('hatch')).toBe(true)
    expect(a.has('scans')).toBe(true)
    expect(a.has('welds')).toBe(false)
    const b = groups(overlays)
    expect(b.has('images')).toBe(true)
    expect(b.has('hatch')).toBe(false)
    expect(b.has('scans')).toBe(true)
    expect(b.has('welds')).toBe(false)
    expect(exportRuns('Scans', []).map((r) => r.suffix)).toEqual([' - Scans'])
    expect(exportRuns('Overlays', []).map((r) => r.suffix)).toEqual([' - Overlays'])
    const same = exportRuns('As the preview', ['nozzles'])
    expect(same).toEqual([{ suffix: '', label: 'As the preview', hidden: new Set(['nozzles']) }])
  })

  it('turns the main sheet as set', () => {
    const turned = (o: Project['settings']['mainSheetOrientation']) => sheetModels({ ...p, settings: { ...p.settings, mainSheetOrientation: o } }, buildDrawing(p), null)[0].paper
    expect(turned('Automatic')).toEqual({ w: 11, h: 8.5 })
    expect(turned('Landscape')).toEqual({ w: 11, h: 8.5 })
    expect(turned('Portrait')).toEqual({ w: 8.5, h: 11 })
  })
})

describe('printed photo size', () => {
  it('fixes the shape by stretching one way, then caps at the resolution', () => {
    // 1915 x 957 photo, scan 2:1 printed 2 x 1 in: shape already fine, capped at 600 x 300.
    expect(printPhotoSize(1915, 957, 2, 1, 300)).toEqual({ width: 600, height: 300 })
    // Printed big: keeps the photo's own detail (stretched to the shape), never more.
    expect(printPhotoSize(1915, 957, 40, 4, 300)).toEqual({ width: 9570, height: 957 })
    expect(printPhotoSize(1915, 957, 20, 2, 300)).toEqual({ width: 6000, height: 600 })
    expect(printPhotoSize(1000, 1000, 2, 4, 300)).toEqual({ width: 600, height: 1200 })
    expect(printPhotoSize(10, 10, 0.01, 0.01, 300)).toEqual({ width: 3, height: 3 })
  })
})

// --- Report images -----------------------------------------------------------------------------------

/** Records what a sheet draws, and where photo corners land (pixels). */
function recorder() {
  const calls: { op: string; args: unknown[] }[] = []
  let m = [1, 0, 0, 1, 0, 0]
  const stack: number[][] = []
  const mul = (a: number[], b: number[]) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
  const ctx = {
    save: () => stack.push(m),
    restore: () => (m = stack.pop()!),
    setTransform: (...a: number[]) => (m = a),
    transform: (...a: number[]) => (m = mul(m, a)),
    beginPath() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {}, closePath() {}, rect() {}, clip() {}, fillRect() {},
    stroke: () => calls.push({ op: 'stroke', args: [] }),
    fillText: (t: string) => calls.push({ op: 'text', args: [t] }),
    drawImage: (...a: unknown[]) => {
      const [dw, dh] = [a[7] as number, a[8] as number]
      const at = (x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
      calls.push({ op: 'image', args: [at(0, 0), at(dw, 0), at(0, dh)] })
    },
    lineWidth: 1, lineCap: 'round', lineJoin: 'round', strokeStyle: '', fillStyle: '', globalAlpha: 1, font: '', textBaseline: 'alphabetic', textAlign: 'left',
  }
  return { ctx: ctx as unknown as Ctx2D, calls }
}

const photoMap = (m: SheetModel) => new Map(m.drawing.flatMap((x) => (x.t === 'image' ? [[x.scanId, { image: {} as CanvasImageSource, ...PHOTO }] as const] : [])))

describe.each(jobs.map((j) => ({ ...j })))('report images of $name', ({ project }) => {
  it('one per sheet, sized from the extents, drawn from the sheet model', () => {
    for (const on of [false, true]) {
      const p = withSections(project, on)
      const models = sheetModels(p, buildDrawing(p), activeSectionPlan(p))
      const names = reportImageNames('Job - AUT Coverage', models.length)
      expect(names.length).toBe(models.length)
      for (const m of models) {
        for (const crop of ['Everything printed', 'Drawing only'] as ReportCrop[]) {
          const f = reportFrame(m, crop, 300, 8)
          const b = crop === 'Drawing only' ? m.extents.drawingOnly : m.extents.all
          expect(f.width).toBe(Math.ceil((b[2] - b[0]) * 300 - 1e-6) + 16)
          expect(f.height).toBe(Math.ceil((b[3] - b[1]) * 300 - 1e-6) + 16)
          // Inside the sheet.
          expect(b[0]).toBeGreaterThanOrEqual(-1e-6)
          expect(b[2]).toBeLessThanOrEqual(m.paper.w + 1e-6)
          const { ctx, calls } = recorder()
          drawReportSheet(ctx, m, f, crop, photoMap(m))
          const all = [...m.drawing, ...m.sheet]
          const texts = all.filter((x) => x.t === 'text')
          const n = calls.filter((c) => c.op === 'text').length
          if (crop === 'Everything printed') {
            expect(n).toBe(texts.length)
            expect(calls.filter((c) => c.op === 'image').length).toBe(all.filter((x) => x.t === 'image').length)
            expect(calls.filter((c) => c.op === 'stroke').length).toBe(drawSteps(m.drawing).filter((s) => s.kind === 'path').length + drawSteps(m.sheet).filter((s) => s.kind === 'path').length)
          } else expect(n).toBeLessThan(texts.length)
        }
      }
    }
  })
})

describe('report image photos and text', () => {
  it('puts each photo corner where the sheet model has it (CW, CCW, Vertical)', () => {
    for (const name of ['REF1', 'REF1-CCW', 'REF3']) {
      const p = jobs.find((j) => j.name === name)!.project
      const [m] = sheetModels(p, buildDrawing(p), null)
      const f = reportFrame(m, 'Everything printed', 100, 0)
      const { ctx, calls } = recorder()
      drawReportSheet(ctx, m, f, 'Everything printed', photoMap(m))
      const prims = m.drawing.filter((x) => x.t === 'image')
      const px = (x: number, y: number) => [(x - f.left) * 100, (f.top - y) * 100]
      calls.filter((c) => c.op === 'image').forEach((c, i) => {
        const q = prims[i]
        const r = (q.rot * Math.PI) / 180
        // Photo top-left = the image's corner at v = h; its top-right = that + w along the rotation.
        const tl = [q.x - q.h * Math.sin(r), q.y + q.h * Math.cos(r)]
        const tr = [tl[0] + q.w * Math.cos(r), tl[1] + q.w * Math.sin(r)]
        const [a, b] = c.args as number[][]
        expect(a[0]).toBeCloseTo(px(tl[0], tl[1])[0], 6)
        expect(a[1]).toBeCloseTo(px(tl[0], tl[1])[1], 6)
        expect(b[0]).toBeCloseTo(px(tr[0], tr[1])[0], 6)
        expect(b[1]).toBeCloseTo(px(tr[0], tr[1])[1], 6)
      })
      expect(prims.length).toBeGreaterThan(0)
    }
  })

  it('measures text with the bundled font', () => {
    const g = textGeometry({ x: 0, y: 0, h: 1, rot: 0, text: 'AUT', just: 'MC' })
    expect(g.start[0]).toBeCloseTo(-g.width / 2, 9)
    expect(g.size).toBeCloseTo(2048 / 1409, 6)
    expect(g.width).toBeGreaterThan(0)
  })
})

describe('report JPEG', () => {
  const rgba = new Uint8Array(40 * 30 * 4).fill(200)

  it('has no chroma subsampling, the DPI and the quality asked for', () => {
    const j = encodeReportJpeg(rgba, 40, 30, 95, 300)
    expect(jpegInfo(j)).toEqual({ width: 40, height: 30, units: 1, xDpi: 300, yDpi: 300, sampling: [0x11, 0x11, 0x11] })
    // Quality 95 scales the standard tables by 10 % (IJG, as Pillow and TightPDF): luminance DC 16 -> 2.
    const dqt = j.findIndex((v, i) => v === 0xff && j[i + 1] === 0xdb)
    expect(j[dqt + 5]).toBe(2)
    const q50 = encodeReportJpeg(rgba, 40, 30, 50, 150)
    expect(q50[q50.findIndex((v, i) => v === 0xff && q50[i + 1] === 0xdb) + 5]).toBe(16)
    expect(jpegInfo(q50).xDpi).toBe(150)
  })

  it('names the images like TightPDF', () => {
    expect(reportImageNames('V-100 - AUT Coverage', 1)).toEqual(['V-100 - AUT Coverage.jpg'])
    expect(reportImageNames('V-100 - AUT Coverage', 3)).toEqual(['V-100 - AUT Coverage_001.jpg', 'V-100 - AUT Coverage_002.jpg', 'V-100 - AUT Coverage_003.jpg'])
    expect(reportImageNames('a:b', 1)).toEqual(['a_b.jpg'])
  })
})

describe('one sheet model for the Sheets view, the PDF and the report images', () => {
  it('the Sheets view draws the model: same texts and paths', () => {
    const p = withSections(jobs[0].project, true)
    const d = buildDrawing(p)
    const plan = activeSectionPlan(p)
    const [m] = sheetModels(p, d, plan)
    const html = renderToStaticMarkup(createElement(SheetsView, { drawing: d, plan, project: p, hidden: new Set<LayerGroup>(), thumbs: new Map() }))
    const texts = [...m.drawing, ...m.sheet].filter((x) => x.t === 'text').length
    expect(html.match(/<text /g)?.length).toBe(texts)
    const paths = drawSteps(m.drawing).filter((s) => s.kind === 'path').length + drawSteps(m.sheet).filter((s) => s.kind === 'path').length
    expect(html.match(/<path /g)?.length).toBe(paths)
  })

  it('the font metrics are up to date', () => {
    expect(new Uint8Array(readFileSync(FONT_FILE))).toEqual(FONT)
    expect(readFileSync(new URL('../../src/engine/fontMetrics.generated.ts', import.meta.url), 'utf8')).toBe(renderFontMetrics())
  })
})
