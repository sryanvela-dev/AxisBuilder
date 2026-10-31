import fontkit from '@pdf-lib/fontkit'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream, type PDFPage } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { REPORT_FONT_FILES } from '../../scripts/gen-font-metrics.ts'
import type { Project } from '../../src/data/schema.ts'
import { buildReport } from '../../src/report/pages/index.ts'
import { writeReportPdf } from '../../src/report/pdf/writeReportPdf.ts'
import { customSheetSchema, photoSchema, uploadSchema } from '../../src/report/schema.ts'
import { sampleWithReport } from './pages/fixture.ts'
import { DRAWING_FONT, REPORT_FONTS, folderImages } from './pages/nodeFiles.ts'
import { madeUpPhoto } from './pages/photos.ts'

const DATE = new Date(2026, 9, 13)

/** A one-page PDF to upload (portrait letter with a line of text). */
async function uploadPdf(): Promise<Uint8Array> {
  const d = await PDFDocument.create()
  d.addPage([612, 792]).drawText('Plant drawing', { x: 72, y: 700 })
  return d.save()
}

async function reportPdf(p: Project, pictures: Record<string, Uint8Array> = {}, pdfs: Record<string, Uint8Array> = {}) {
  const files = folderImages({}, new Map(Object.entries(pictures)))
  const pdfPages = async (f: string) => {
    const b = pdfs[f]
    if (!b) return null
    const d = await PDFDocument.load(b)
    return d.getPages().map((pg) => ({ w: pg.getWidth() / 72, h: pg.getHeight() / 72 }))
  }
  const sizes = new Map<string, { w: number; h: number }[] | null>()
  for (const f of Object.keys(pdfs)) sizes.set(f, await pdfPages(f))
  const doc = buildReport({ project: p, image: files.image, pdfPages: (f) => sizes.get(f) ?? null })
  const bytes = await writeReportPdf({ doc, fonts: REPORT_FONTS, drawingFont: DRAWING_FONT, images: files.prepared(doc), sheetPhotos: new Map(), pdfs: new Map(Object.entries(pdfs)), date: DATE })
  return { doc, bytes, pdf: await PDFDocument.load(bytes) }
}

function contentOf(page: PDFPage): string {
  const c = page.node.Contents()
  const streams = c instanceof PDFArray ? c.asArray().map((r) => page.doc.context.lookup(r) as PDFStream) : c ? [c] : []
  return streams.map((s) => new TextDecoder('latin1').decode(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents())).join('\n')
}

/** The text a page shows, decoded through each font's glyphs (pdf-lib writes glyph ids). */
function pageText(page: PDFPage): string {
  const glyphMaps = new Map<string, Map<number, string>>()
  const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict)
  const byBase = Object.fromEntries(Object.values(REPORT_FONT_FILES).map((f) => [f.replace('.ttf', ''), f]))
  for (const [name, ref] of fonts?.entries() ?? []) {
    const dict = page.doc.context.lookup(ref, PDFDict)
    // pdf-lib names an embedded font "/Roboto-Regular-8717".
    const base = String(dict.get(PDFName.of('BaseFont'))).replace(/^\//, '').replace(/-\d+$/, '')
    const file = byBase[base]
    if (!file) continue
    const font = fontkit.create(Buffer.from(REPORT_FONTS[(Object.entries(REPORT_FONT_FILES).find(([, f]) => f === file)![0]) as keyof typeof REPORT_FONTS]))
    const map = new Map<number, string>()
    for (let cp = 32; cp < 0x2300; cp++) {
      const g = font.glyphForCodePoint(cp)
      if (g.id && !map.has(g.id)) map.set(g.id, String.fromCodePoint(cp))
    }
    glyphMaps.set(name.toString(), map)
  }
  let current: Map<number, string> | undefined
  const out: string[] = []
  for (const m of contentOf(page).matchAll(/(\/[\w-]+) [\d.]+ Tf|<([0-9A-Fa-f]*)> Tj/g)) {
    if (m[1]) current = glyphMaps.get(m[1])
    else if (current) out.push((m[2].match(/.{4}/g) ?? []).map((h) => current!.get(parseInt(h, 16)) ?? '?').join(''))
  }
  return out.join(' ')
}

function outline(pdf: PDFDocument): { title: string; children: number }[] {
  const root = pdf.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict)
  if (!root) return []
  const out: { title: string; children: number }[] = []
  let ref = root.get(PDFName.of('First')) as PDFRef | undefined
  while (ref) {
    const d = pdf.context.lookup(ref, PDFDict)
    const count = d.get(PDFName.of('Count'))
    out.push({ title: (d.get(PDFName.of('Title')) as unknown as { decodeText(): string }).decodeText(), children: count instanceof PDFNumber ? Math.abs(count.asNumber()) : 0 })
    ref = d.get(PDFName.of('Next')) as PDFRef | undefined
  }
  return out
}

describe('report PDF', async () => {
  const p = sampleWithReport((q) => {
    q.report!.coverPhoto = 'cover.jpg'
    q.report!.photos = [photoSchema.parse({ file: 'phone.jpg', caption: 'Sideways phone photo' }), photoSchema.parse({ file: 'wide.jpg', caption: 'Turned', rotate: 90, alone: true })]
    q.report!.customSheets = [customSheetSchema.parse({ id: 'c1', title: 'Boot', blocks: [{ kind: 'text', title: 'Boot', body: 'Scanned by hand.' }] })]
    q.report!.uploads = [uploadSchema.parse({ file: 'plant.pdf', page: 1, title: 'Plant drawing' })]
  })
  const pictures = { 'cover.jpg': madeUpPhoto(1600, 900), 'phone.jpg': madeUpPhoto(900, 1200, 6), 'wide.jpg': madeUpPhoto(1200, 800) }
  const { doc, bytes, pdf } = await reportPdf(p, pictures, { 'plant.pdf': await uploadPdf() })

  it('one PDF page per page of the model, in the model\'s sizes', () => {
    expect(pdf.getPageCount()).toBe(doc.pages.length)
    pdf.getPages().forEach((pg, i) => {
      expect(pg.getWidth()).toBeCloseTo(doc.pages[i].size.w * 72, 3)
      expect(pg.getHeight()).toBeCloseTo(doc.pages[i].size.h * 72, 3)
    })
  })

  it('every page type is in it: cover, contents, scope, calibration, photos, drawings, tables, C-scans, custom, uploaded, fixed text', () => {
    expect([...new Set(doc.pages.map((x) => x.sectionId))]).toEqual(['cover', 'contents', 'scope-summary', 'calibration', 'photos', 'drawings', 'scan-sheet', 'manual-ut', 'cscan', 'custom', 'reference', 'equipment', 'guide'])
  })

  it('embeds the brand fonts whole (no subset prefix) and the drawing font for the drawing pages', () => {
    const bases = [...pdf.context.enumerateIndirectObjects()].flatMap(([, o]) => (o instanceof PDFDict && o.get(PDFName.of('Type')) === PDFName.of('Font') && o.get(PDFName.of('Subtype')) === PDFName.of('Type0') ? [String(o.get(PDFName.of('BaseFont')))] : []))
    for (const f of ['Montserrat-SemiBold', 'Montserrat-Bold', 'Roboto-Regular', 'Roboto-Medium', 'Roboto-Bold', 'Arimo']) expect(bases.some((b) => b.includes(f)), f).toBe(true)
    expect(bases.every((b) => !/\/[A-Z]{6}\+/.test(b))).toBe(true)
  })

  it('has real text on its pages', () => {
    const pages = pdf.getPages()
    expect(pageText(pages[0])).toContain('Corrosion Mapping')
    expect(pageText(pages[1])).toContain('Table of Contents')
    expect(pageText(pages[2])).toContain('seventeen (17)')
    const sheet = doc.pages.findIndex((x) => x.sectionId === 'scan-sheet')
    expect(pageText(pages[sheet])).toContain('Totals (17 scans)')
    expect(pageText(pages[sheet])).toContain('No significant I.D. wall loss detected.')
    expect(pageText(pages[pages.length - 1])).toContain(`Page ${pages.length} of ${pages.length}`)
  })

  it('bookmarks every section, with every scan under C-Scan Data', () => {
    const o = outline(pdf)
    expect(o.map((x) => x.title)).toEqual(doc.bookmarks.map((b) => b.title))
    expect(o.find((x) => x.title === 'C-Scan Data')!.children).toBe(17)
  })

  it('the contents link to their pages', () => {
    const annots = pdf.getPages()[1].node.Annots()!
    expect(annots.size()).toBe(doc.contents.length)
    const first = pdf.context.lookup(annots.get(0), PDFDict)
    const dest = first.lookup(PDFName.of('Dest'), PDFArray)
    expect(dest.get(0)).toBe(pdf.getPages()[doc.contents[0].page].ref)
  })

  it('title and author', () => {
    expect(pdf.getTitle()).toBe('V-100 - AUT Report')
    expect(pdf.getAuthor()).toBe('A. Tech, B. Helper')
  })

  it('a sideways phone photo prints upright: the placement turns it a quarter', () => {
    const page = pdf.getPages()[doc.pages.findIndex((x) => x.sectionId === 'photos')]
    const text = contentOf(page)
    // The image's cm: a = 0 and d = 0 (turned), b < 0 and c > 0 for EXIF 6 (stored top-left lands top-right).
    const cms = [...text.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm\s*\/Im/g)].map((m) => m.slice(1, 7).map(Number))
    // The first is the logo; the photo is the one turned.
    const turned = cms.filter(([a, , , d]) => Math.abs(a) < 1e-6 && Math.abs(d) < 1e-6)
    expect(turned).toHaveLength(1)
    const [a, b, c, d] = turned[0]
    expect(Math.abs(a)).toBeLessThan(1e-6)
    expect(Math.abs(d)).toBeLessThan(1e-6)
    expect(b).toBeLessThan(0)
    expect(c).toBeGreaterThan(0)
    // Upright it is portrait: the turned width (|b|) is the printed height, |c| the printed width.
    expect(Math.abs(b)).toBeGreaterThan(Math.abs(c))
  })

  it('embeds each picture once and copies the uploaded PDF page as a form (vectors)', () => {
    const images = [...pdf.context.enumerateIndirectObjects()].filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))
    // logo (+ its soft mask), cover, phone, wide
    expect(images.length).toBeGreaterThanOrEqual(4)
    const forms = [...pdf.context.enumerateIndirectObjects()].filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Form'))
    expect(forms.length).toBeGreaterThanOrEqual(1)
    expect(bytes.length).toBeLessThan(4 * 1024 * 1024)
  })
})
