// The fixed pages (AUT Equipment, Guide to Interpretation): every picture slot is a bundled picture or an example job's
// sheet (no vertical rollout, user 2026-11-01), each picture is embedded once in the PDF.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { photoNeeds } from '../../../src/engine/sheetModel.ts'
import { checkReport } from '../../../src/report/checks.ts'
import { exampleJobsIn, exampleSheet, parseExampleScanId } from '../../../src/report/exampleJobs.ts'
import { readImageInfo } from '../../../src/report/imageInfo.ts'
import type { ImageItem, PageItem, ReportPage, SheetItem, TextItem } from '../../../src/report/pageModel.ts'
import { buildReport } from '../../../src/report/pages/index.ts'
import { CONTENT } from '../../../src/report/pages/layout.ts'
import { writeReportPdf } from '../../../src/report/pdf/writeReportPdf.ts'
import { templateOf } from '../../../src/report/templates/registry.ts'
import type { FixedPicture } from '../../../src/report/templates/types.ts'
import { fakeImages, sampleWithReport } from './fixture.ts'
import { DRAWING_FONT, REPORT_ASSETS, REPORT_FONTS, folderImages, sheetPhotosFor } from './nodeFiles.ts'

const t = templateOf('generic-aut')
const slots: FixedPicture[] = t.fixedPages.flatMap((f) => f.parts.flatMap((p) => p.pictures))
const doc = buildReport({ project: sampleWithReport(), image: fakeImages })
const pagesOf = (id: string) => doc.pages.filter((p) => p.sectionId === id)
const imagesOn = (p: ReportPage) => p.items.filter((i): i is ImageItem => i.t === 'image' && i.ref.source === 'asset')
const textsOn = (p: ReportPage) => p.items.filter((i): i is TextItem => i.t === 'text').map((x) => x.text)

describe('fixed pages: the pictures', () => {
  it('every slot is a bundled picture of the right size or an example job; no vertical rollout', () => {
    for (const s of slots) {
      if (s.kind === 'asset') {
        const info = readImageInfo(new Uint8Array(readFileSync(join(REPORT_ASSETS, s.file))))
        expect(info, s.file).not.toBeNull()
        expect({ w: info!.width, h: info!.height }, s.file).toEqual(s.px)
      } else expect(exampleSheet(s.job), s.slot).not.toBeNull()
    }
    expect(slots.map((s) => s.slot)).toEqual(['equipment-scanner', 'equipment-unit', 'equipment-bscan', 'guide-cscan-example', 'guide-rollout-horizontal'])
    expect(slots.some((s) => s.slot === 'equipment-cscan')).toBe(false)
  })

  it('src/assets/report holds exactly the cleared pictures', () => {
    const files = slots.flatMap((s) => (s.kind === 'asset' ? [s.file] : [])).sort()
    expect(readdirSync(REPORT_ASSETS).sort()).toEqual(files)
    expect(files).toEqual(['aut-scanner.png', 'example-cscan.jpg', 'proscan-xt.png', 'scan-views-diagram.jpg'])
  })

  it('no "Picture to come" box anywhere, and no placeholder note', () => {
    for (const p of doc.pages) expect(textsOn(p).some((x) => /to come/i.test(x)), p.label).toBe(false)
    expect(doc.notes.some((n) => /placeholder|to come/i.test(n))).toBe(false)
  })
})

describe('fixed pages: the layout', () => {
  it('AUT Equipment: the text with the scanner and the ProScan (at most 2 in wide), then Displays with the diagram, large', () => {
    const [one, two] = pagesOf('equipment')
    const [scanner, unit] = imagesOn(one)
    expect([scanner.ref.file, unit.ref.file]).toEqual(['aut-scanner.png', 'proscan-xt.png'])
    expect(unit.w).toBeLessThanOrEqual(2 + 1e-9)
    expect(scanner.w).toBeGreaterThan(3)
    expect(textsOn(one)).toEqual(expect.arrayContaining(['AUT Scanner Equipment', 'Advantages', 'AUT scanner', 'ProScan XT']))
    expect(textsOn(one)).not.toContain('Displays')
    expect(textsOn(two)).toContain('Displays')
    const [diagram] = imagesOn(two)
    expect(diagram.ref.file).toBe('scan-views-diagram.jpg')
    expect(diagram.w).toBeGreaterThan(7)
    expect(diagram.w / diagram.h).toBeCloseTo(1589 / 990, 6)
  })

  it('Guide: the example C-scan large under its text, then the V-100 rollout as a vector sheet with its photos', () => {
    const [one, two] = pagesOf('guide')
    const [cscan] = imagesOn(one)
    expect(cscan.ref.file).toBe('example-cscan.jpg')
    expect(cscan.w).toBeGreaterThan(9)
    expect(cscan.y + cscan.h).toBeLessThanOrEqual(CONTENT.y + CONTENT.h + 1e-9)
    const sheets = two.items.filter((i): i is SheetItem => i.t === 'sheet')
    expect(sheets).toHaveLength(1)
    const sheet = sheets[0]
    expect(sheet.box.h).toBeGreaterThan(5)
    expect(sheet.box.y + sheet.box.h).toBeLessThanOrEqual(CONTENT.y + CONTENT.h + 1e-9)
    expect(sheet.place).toBeUndefined()
    expect(exampleJobsIn([sheet.model])).toEqual(['v100'])
    const photos = sheet.model.drawing.filter((x) => x.t === 'image')
    expect(photos.length).toBeGreaterThan(0)
    expect(photos.every((x) => x.t === 'image' && parseExampleScanId(x.scanId)?.job === 'v100')).toBe(true)
    // Overlays: photos, no hatch.
    expect(sheet.model.drawing.some((x) => 'layer' in x && x.layer === 'AUT_HATCH')).toBe(false)
    expect(textsOn(two)).toContain('Horizontal vessel')
    expect(two.items.filter((i: PageItem) => i.t === 'sheet' || (i.t === 'image' && i.ref.source === 'asset'))).toHaveLength(1)
  })

  it('no Review note about the Guide pictures', () => {
    expect(checkReport(sampleWithReport()).some((c) => /rollout|guide/i.test(c.text))).toBe(false)
  })
})

describe('fixed pages: the PDF', () => {
  it('embeds each bundled picture once, and the example rollout with its photos from public/sample-photos', async () => {
    const p = sampleWithReport()
    const files = folderImages({})
    const d = buildReport({ project: p, image: files.image })
    const sheetPhotos = await sheetPhotosFor(p, d, undefined, p.settings.pdfPhotoDpi)
    const sheetModels = d.pages.flatMap((pg) => pg.items.flatMap((i) => (i.t === 'sheet' ? [i.model] : [])))
    const exampleNeeds = photoNeeds(sheetModels).filter((n) => parseExampleScanId(n.scanId))
    expect(exampleNeeds.length).toBeGreaterThan(0)
    for (const n of exampleNeeds) expect(sheetPhotos.has(n.key), n.key).toBe(true)
    const bytes = await writeReportPdf({ doc: d, fonts: REPORT_FONTS, drawingFont: DRAWING_FONT, images: files.prepared(d), sheetPhotos, pdfs: new Map(), date: new Date(2026, 10, 1) })
    const pdf = await PDFDocument.load(bytes)
    const masks = new Set<string>()
    const images: { ref: string; w: number; h: number }[] = []
    for (const [ref, obj] of pdf.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream) || obj.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue
      const mask = obj.dict.get(PDFName.of('SMask'))
      if (mask instanceof PDFRef) masks.add(mask.toString())
      const n = (k: string) => (obj.dict.get(PDFName.of(k)) as PDFNumber).asNumber()
      images.push({ ref: ref.toString(), w: n('Width'), h: n('Height') })
    }
    const shown = images.filter((i) => !masks.has(i.ref))
    for (const s of slots) if (s.kind === 'asset') expect(shown.filter((i) => i.w === s.px.w && i.h === s.px.h), s.file).toHaveLength(1)
    expect(pdf.catalog instanceof PDFDict).toBe(true)
  }, 30_000)
})
