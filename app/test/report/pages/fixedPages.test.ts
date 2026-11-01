// The fixed pages (AUT Equipment, Guide to Interpretation): every picture slot is a bundled picture or the app's drawn
// scan views diagram (no example rollouts, user 2026-11-01); each picture embedded once in the PDF.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { checkReport } from '../../../src/report/checks.ts'
import { readImageInfo } from '../../../src/report/imageInfo.ts'
import type { ImageItem, PageItem, ReportPage, TextItem } from '../../../src/report/pageModel.ts'
import { buildReport } from '../../../src/report/pages/index.ts'
import { CONTENT } from '../../../src/report/pages/layout.ts'
import { writeReportPdf } from '../../../src/report/pdf/writeReportPdf.ts'
import { templateOf } from '../../../src/report/templates/registry.ts'
import type { FixedPicture } from '../../../src/report/templates/types.ts'
import { fakeImages, sampleWithReport } from './fixture.ts'
import { DRAWING_FONT, REPORT_ASSETS, REPORT_FONTS, folderImages } from './nodeFiles.ts'

const t = templateOf('generic-aut')
const slots: FixedPicture[] = t.fixedPages.flatMap((f) => f.parts.flatMap((p) => p.pictures))
const doc = buildReport({ project: sampleWithReport(), image: fakeImages })
const pagesOf = (id: string) => doc.pages.filter((p) => p.sectionId === id)
const imagesOn = (p: ReportPage) => p.items.filter((i): i is ImageItem => i.t === 'image' && i.ref.source === 'asset')
const textsOn = (p: ReportPage) => p.items.filter((i): i is TextItem => i.t === 'text').map((x) => x.text)

describe('fixed pages: the pictures', () => {
  it('every slot is a bundled picture of the right size or the drawn diagram; no example rollouts', () => {
    for (const s of slots) {
      if (s.kind !== 'asset') continue
      const info = readImageInfo(new Uint8Array(readFileSync(join(REPORT_ASSETS, s.file))))
      expect(info, s.file).not.toBeNull()
      expect({ w: info!.width, h: info!.height }, s.file).toEqual(s.px)
    }
    expect(slots.map((s) => s.slot)).toEqual(['equipment-scanner', 'equipment-unit', 'equipment-bscan', 'guide-cscan-example'])
    expect(slots.some((s) => s.slot === 'equipment-cscan')).toBe(false)
  })

  it('src/assets/report holds exactly the cleared pictures', () => {
    const files = slots.flatMap((s) => (s.kind === 'asset' ? [s.file] : [])).sort()
    expect(readdirSync(REPORT_ASSETS).sort()).toEqual(files)
    expect(files).toEqual(['aut-scanner.png', 'example-cscan.jpg', 'proscan-xt.png'])
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
    // The scan views diagram is drawn as vectors, no picture.
    expect(imagesOn(two)).toEqual([])
    expect(textsOn(two)).toEqual(expect.arrayContaining(['A-SCAN', 'B-SCAN', 'C-SCAN', "D-SCAN (B')", 'Y-axis stroke (scan)', 'X-axis index', 'Front wall', 'Internal reflector', 'Back wall']))
    expect(textsOn(two).some((x) => /stoke/.test(x))).toBe(false)
    const paths = two.items.filter((i): i is Extract<PageItem, { t: 'path' }> => i.t === 'path')
    const pts = paths.flatMap((p) => p.d.flatMap((c) => (c[0] === 'Z' ? [] : [[c[c.length - 2], c[c.length - 1]] as [number, number]])))
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const displays = two.items.find((i): i is TextItem => i.t === 'text' && i.text === 'Displays')!
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(CONTENT.x)
    expect(Math.max(...xs)).toBeLessThanOrEqual(CONTENT.x + CONTENT.w)
    expect(Math.min(...ys)).toBeGreaterThan(displays.y)
    expect(Math.max(...ys)).toBeLessThanOrEqual(CONTENT.y + CONTENT.h)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(6)
    // The A-scan: a white full-wave trace on black (never below its baseline).
    const trace = paths.find((p) => p.stroke === '#FFFFFF' && p.d.length > 1000)!
    expect(trace).toBeDefined()
    expect(paths.some((p) => p.fill === '#000000')).toBe(true)
  })

  it('Guide: the example C-scan carries a label for each part the text names', () => {
    const [one] = pagesOf('guide')
    const [cscan] = imagesOn(one)
    expect(textsOn(one)).toEqual(expect.arrayContaining(['C-SCAN (plan view)', 'B-SCAN (Y-axis section)', 'A-SCAN', 'COLOR SCALE']))
    for (const r of one.items.filter((i) => i.t === 'rect' && i.y > cscan.y - 1e-9)) {
      if (r.t !== 'rect') continue
      expect(r.x).toBeGreaterThanOrEqual(cscan.x - 1e-9)
      expect(r.x + r.w).toBeLessThanOrEqual(cscan.x + cscan.w + 1e-9)
      expect(r.y + r.h).toBeLessThanOrEqual(cscan.y + cscan.h + 1e-9)
    }
  })

  it('Guide: one page, the example C-scan large under its text; no example rollout', () => {
    const pages = pagesOf('guide')
    expect(pages).toHaveLength(1)
    const [cscan] = imagesOn(pages[0])
    expect(cscan.ref.file).toBe('example-cscan.jpg')
    expect(cscan.w).toBeGreaterThan(9)
    expect(cscan.y + cscan.h).toBeLessThanOrEqual(CONTENT.y + CONTENT.h + 1e-9)
    expect(pages[0].items.some((i) => i.t === 'sheet')).toBe(false)
    expect(textsOn(pages[0]).some((x) => /rollout/i.test(x))).toBe(false)
  })

  it('no Review note about the Guide pictures', () => {
    expect(checkReport(sampleWithReport()).some((c) => /rollout|guide/i.test(c.text))).toBe(false)
  })
})

describe('fixed pages: the PDF', () => {
  it('embeds each bundled picture once', async () => {
    const p = sampleWithReport()
    const files = folderImages({})
    const d = buildReport({ project: p, image: files.image })
    const bytes = await writeReportPdf({ doc: d, fonts: REPORT_FONTS, drawingFont: DRAWING_FONT, images: files.prepared(d), sheetPhotos: new Map(), pdfs: new Map(), date: new Date(2026, 10, 1) })
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
