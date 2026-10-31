import { describe, expect, it } from 'vitest'
import type { Project } from '../../../src/data/schema.ts'
import { measure } from '../../../src/report/fonts.ts'
import { imagePoint, imageNeeds, orientPoint, storedToPage, uprightSize, visibleAspect, type ImageItem, type PageItem, type ReportPage, type TextItem } from '../../../src/report/pageModel.ts'
import { CONTENT, LETTER_LANDSCAPE, LETTER_PORTRAIT } from '../../../src/report/pages/layout.ts'
import { buildReport } from '../../../src/report/pages/index.ts'
import { photoPages, rowLayout } from '../../../src/report/pages/photos.ts'
import { layoutTable, splitRows, type TableRow } from '../../../src/report/pages/table.ts'
import { blockSchema, customSheetSchema, markSchema, photoSchema, uploadSchema } from '../../../src/report/schema.ts'
import { readImageInfo } from '../../../src/report/imageInfo.ts'
import { fakeImages, sampleWithReport } from './fixture.ts'
import { madeUpPhoto } from './photos.ts'

const texts = (page: ReportPage) => page.items.filter((i): i is TextItem => i.t === 'text').map((t) => t.text)
const pageText = (page: ReportPage) => texts(page).join(' ')
const images = (page: ReportPage) => page.items.filter((i): i is ImageItem => i.t === 'image' && i.ref.source !== 'brand')
const build = (p: Project) => buildReport({ project: p, image: fakeImages })
const photo = (file: string, extra: Record<string, unknown> = {}) => photoSchema.parse({ file, ...extra })

describe('report pages: the whole report', () => {
  const doc = build(sampleWithReport())

  it('prints the sections in template order: cover, contents, scope, calibration, drawings, scan sheet, manual UT, a page per scan, fixed pages', () => {
    const order = [...new Set(doc.pages.map((p) => p.sectionId))]
    expect(order).toEqual(['cover', 'contents', 'scope-summary', 'calibration', 'drawings', 'scan-sheet', 'manual-ut', 'cscan', 'equipment', 'guide'])
    expect(doc.pages.filter((p) => p.sectionId === 'cscan')).toHaveLength(17)
    expect(doc.pages).toHaveLength(27)
  })

  it('cover portrait, every other page landscape; every page but the cover has "Page X of Y"', () => {
    expect(doc.pages[0].size).toEqual(LETTER_PORTRAIT)
    expect(doc.pages.slice(1).every((p) => p.size.w === LETTER_LANDSCAPE.w)).toBe(true)
    expect(texts(doc.pages[0]).some((t) => t.startsWith('Page '))).toBe(false)
    doc.pages.slice(1).forEach((p, i) => expect(texts(p)).toContain(`Page ${i + 2} of 27`))
  })

  it('the contents list each section with the page it starts on, each a link to it', () => {
    expect(doc.contents.map((e) => [e.title, e.page + 1])).toEqual([
      ['Scope & Summary', 3], ['Calibration', 4], ['Drawings', 5], ['Scan Sheet', 7], ['Manual UT', 8], ['C-Scan Data', 9], ['AUT Equipment', 26], ['Guide to Interpretation', 27],
    ])
    const links = doc.pages[1].items.filter((i) => i.t === 'link')
    expect(links.slice(0, doc.contents.length).map((l) => (l as { page: number }).page)).toEqual(doc.contents.map((e) => e.page))
    expect(texts(doc.pages[1])).toContain('26')
  })

  it('the contents span the full content width: numbers at the right margin, dot leaders to them', () => {
    const page = doc.pages[1]
    const links = page.items.filter((i): i is Extract<PageItem, { t: 'link' }> => i.t === 'link').slice(0, doc.contents.length)
    for (const l of links) {
      expect(l.x).toBeCloseTo(CONTENT.x, 9)
      expect(l.w).toBeCloseTo(CONTENT.w, 9)
    }
    const numbers = page.items.filter((i): i is TextItem => i.t === 'text' && i.align === 'right' && /^\d+$/.test(i.text))
    expect(numbers[0].x).toBeCloseTo(CONTENT.x + CONTENT.w, 9)
    expect(page.items.some((i) => i.t === 'text' && /^( \.){10,}$/.test(i.text))).toBe(true)
  })

  it('a Scans index under the contents: every scan with its C-Scan Data page, 3 columns filled top to bottom, each a link', () => {
    const page = doc.pages[1]
    expect(texts(page)).toContain('Scans')
    const scanLinks = page.items.filter((i): i is Extract<PageItem, { t: 'link' }> => i.t === 'link').slice(doc.contents.length)
    const cscanStart = doc.contents.find((e) => e.title === 'C-Scan Data')!.page
    expect(scanLinks.map((l) => l.page)).toEqual(Array.from({ length: 17 }, (_, i) => cscanStart + i))
    for (let i = 0; i < 17; i++) expect(texts(page)).toContain(`Scan ${i + 1}`)
    // 17 scans in 3 columns: 6 rows; scan 7 starts the second column at the top.
    const xs = [...new Set(scanLinks.map((l) => l.x.toFixed(4)))]
    expect(xs).toHaveLength(3)
    expect(scanLinks[6].y).toBeCloseTo(scanLinks[0].y, 9)
    expect(scanLinks[6].x).toBeGreaterThan(scanLinks[5].x)
    expect(scanLinks[5].y).toBeGreaterThan(scanLinks[4].y)
    expect(scanLinks.every((l) => l.y + l.h <= CONTENT.y + CONTENT.h + 1e-9)).toBe(true)
  })

  it('no Scans index while the C-Scan Data section is off', () => {
    const d = build(sampleWithReport((q) => { q.report!.sections = { cscan: { on: false } } }))
    expect(texts(d.pages[1])).not.toContain('Scans')
    expect(d.pages[1].items.filter((i) => i.t === 'link')).toHaveLength(d.contents.length)
  })

  it('bookmarks every section and every scan', () => {
    expect(doc.bookmarks.map((b) => b.title)).toEqual(['Table of Contents', ...doc.contents.map((e) => e.title)])
    const cscan = doc.bookmarks.find((b) => b.title === 'C-Scan Data')!
    expect(cscan.children.map((b) => b.title)).toEqual(Array.from({ length: 17 }, (_, i) => `Scan ${i + 1}`))
    expect(cscan.children[16].page).toBe(24)
  })

  it('the standard frame: header fields, section title, footer with the lead field and the job number', () => {
    const page = doc.pages[2]
    const t = pageText(page)
    expect(t).toContain('Scope & Summary')
    expect(t).toContain('Sample Client')
    expect(t).toContain('0" Reference')
    expect(t).toContain('302.000"')
    expect(t).toContain('Job 1000001')
    expect(t).toContain('AUT Corrosion Mapping Examination')
    expect(page.items.some((i) => i.t === 'image' && i.ref.source === 'brand')).toBe(true)
  })

  it('scope and summary: the template text filled in, figures in the summary tiles', () => {
    const t = pageText(doc.pages[2])
    expect(t).toContain('seventeen (17)')
    expect(t).toContain('AUT scans')
    expect(t).toContain('0.716"')
    expect(t).toContain('2.72%')
    expect(t).not.toMatch(/\{\w+\}/)
  })

  it('a C-scan page: title, screenshot on the left, comments and statistics on the right', () => {
    const page = doc.pages.find((p) => p.label === 'Scan 3')!
    const t = pageText(page)
    expect(t).toContain('Scan 3')
    expect(t).toContain('Comments')
    expect(t).toContain('Minimum thickness')
    expect(t).toContain('No significant I.D. wall loss detected.')
    const shot = images(page)[0]
    expect(shot.ref).toEqual({ source: 'screenshots', file: 'Scan 3.png' })
    expect(shot.x).toBeCloseTo(CONTENT.x)
    expect(shot.w).toBeGreaterThan(CONTENT.w * 0.6)
  })

  it('missing things print the quiet placeholder, never "Click here"', () => {
    const p = sampleWithReport((q) => {
      q.report!.scanResults[0].dataImage = null
    })
    const d = buildReport({ project: p })
    const all = d.pages.map(pageText).join(' ')
    expect(all).toContain('No screenshot')
    expect(all).not.toMatch(/click/i)
    expect(d.notes.some((n) => n.includes('Scan 1 has no data-page screenshot yet'))).toBe(true)
  })

  it('drawings: the rollout and the scan overlay as vector sheets fitted in the content area', () => {
    const sheets = doc.pages.filter((p) => p.sectionId === 'drawings')
    expect(sheets.map((p) => p.label)).toEqual(['Rollout drawing', 'Scan overlay drawing'])
    for (const p of sheets) {
      const s = p.items.find((i) => i.t === 'sheet')!
      if (s.t !== 'sheet') throw new Error()
      expect(s.box.x).toBeGreaterThanOrEqual(CONTENT.x - 1e-9)
      expect(s.box.x + s.box.w).toBeLessThanOrEqual(CONTENT.x + CONTENT.w + 1e-9)
      expect(s.box.y + s.box.h).toBeLessThanOrEqual(CONTENT.y + CONTENT.h + 1e-9)
      expect(s.box.w / s.box.h).toBeCloseTo(s.region.w / s.region.h, 6)
    }
    const rollout = sheets[0].items.find((i) => i.t === 'sheet')
    expect(rollout?.t === 'sheet' && rollout.model.drawing.some((x) => x.t === 'image')).toBe(false)
    const overlay = sheets[1].items.find((i) => i.t === 'sheet')
    expect(overlay?.t === 'sheet' && overlay.model.drawing.some((x) => x.t === 'image')).toBe(true)
  })

  it('section sheets print as scans, as overlays or both, with or without the rollout ticked', () => {
    const labels = (sections: 'as drawing' | 'overlays' | 'both' | 'off', rollout = true, overlay = true, images = true) => {
      const p = sampleWithReport((q) => {
        q.settings.makeSectionSheets = true
        q.settings.generateOverlayDrawing = images
        q.report!.options.drawings = { rollout, overlay, sections }
      })
      const sheets = build(p).pages.filter((x) => x.sectionId === 'drawings')
      const photos = sheets.map((x) => { const s = x.items.find((i) => i.t === 'sheet'); return s?.t === 'sheet' && s.model.drawing.some((d) => d.t === 'image') })
      return sheets.map((x, i) => `${x.label}${photos[i] ? ' +photos' : ''}`)
    }
    const scans = labels('as drawing')
    expect(scans.slice(0, 2)).toEqual(['Rollout drawing', 'Scan overlay drawing +photos'])
    expect(scans[2]).toBe('Overview')
    expect(scans.slice(3).every((l) => /^Section \d+/.test(l) && !l.includes('photos'))).toBe(true)
    const n = scans.length - 3
    expect(n).toBeGreaterThan(0)
    const over = labels('overlays')
    expect(over.slice(2)).toEqual(scans.slice(2).map((l) => `${l} +photos`))
    const both = labels('both')
    expect(both.slice(2)).toEqual([...scans.slice(2), ...scans.slice(2).map((l) => `${l} (overlay) +photos`)])
    expect(labels('off')).toEqual(['Rollout drawing', 'Scan overlay drawing +photos'])
    // Sections no longer need the rollout ticked; without scan images the overlay sets print nothing.
    expect(labels('overlays', false, false)).toEqual(over.slice(2))
    expect(labels('overlays', true, true, false)).toEqual(['Rollout drawing'])
    expect(labels('both', true, true, false)).toEqual(['Rollout drawing', ...scans.slice(2)])
  })

  it('a section turned off prints nothing; a renamed section prints its own title', () => {
    const p = sampleWithReport((q) => {
      q.report!.sections = { calibration: { on: false }, 'scan-sheet': { on: true, title: 'AUT Scan Sheet' } }
    })
    const d = build(p)
    expect(d.pages.some((x) => x.sectionId === 'calibration')).toBe(false)
    expect(d.contents.map((e) => e.title)).toContain('AUT Scan Sheet')
  })

  it('fixed pages print placeholders for the pictures not in the app yet, and say so', () => {
    const eq = doc.pages.find((p) => p.sectionId === 'equipment')!
    expect(pageText(eq)).toContain('Picture to come: Equipment scanner')
    expect(doc.notes.some((n) => n.startsWith('AUT Equipment: 4 template pictures'))).toBe(true)
  })
})

describe('report pages: tables', () => {
  const rows = (n: number): TableRow[] => [
    ...Array.from({ length: n }, (_, i): TableRow => ({ cells: [{ text: `S${i}` }, { text: 'No significant I.D. wall loss detected.' }], kind: 'data' })),
    { cells: [{ text: 'Totals', span: 2 }], kind: 'total' },
  ]
  const cols = [{ header: 'Scan', align: 'center' as const }, { header: 'Comment', align: 'left' as const, wrap: true }]

  it('repeats the header on every page, never splits a row, keeps the totals with a data row', () => {
    const r = rows(60)
    const layout = layoutTable(cols, r, 10)
    const pages = splitRows(layout, r, 6, 6)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages[0][0]).toBe(0)
    expect(pages[pages.length - 1][1]).toBe(r.length)
    for (let i = 1; i < pages.length; i++) expect(pages[i][0]).toBe(pages[i - 1][1])
    for (const [a, b] of pages) expect(layout.headerHeight + layout.rowHeights.slice(a, b).reduce((x, y) => x + y, 0)).toBeLessThanOrEqual(6 + 1e-9)
    const last = pages[pages.length - 1]
    expect(last[1] - last[0]).toBeGreaterThanOrEqual(2)
  })

  it('a totals row that would start a page alone takes the row before it along', () => {
    const r = rows(4)
    const layout = layoutTable(cols, r, 10)
    const fit = layout.headerHeight + layout.rowHeights.slice(0, 4).reduce((x, y) => x + y, 0) + 0.01
    const pages = splitRows(layout, r, fit, 10)
    expect(pages).toEqual([[0, 3], [3, 5]])
  })

  it('a long comment wraps (the row grows) instead of being cut', () => {
    const r: TableRow[] = [{ cells: [{ text: '1' }, { text: 'Moderate localized I.D. corrosion detected. Mid-wall lamination detected. '.repeat(4) }], kind: 'data' }]
    const layout = layoutTable(cols, r, 4)
    expect(layout.lines[0][1].length).toBeGreaterThan(1)
    expect(layout.rowHeights[0]).toBeGreaterThan(0.25)
  })

  it('the scan sheet splits onto more pages with many scans, the header on each, totals at the end', () => {
    const p = sampleWithReport((q) => {
      const extra = Array.from({ length: 40 }, (_, i) => ({ ...q.scans[0], id: `SCAN ${100 + i}` }))
      q.scans = [...q.scans, ...extra]
    })
    const d = build(p)
    const sheet = d.pages.filter((x) => x.sectionId === 'scan-sheet')
    expect(sheet.length).toBe(3)
    for (const pg of sheet) expect(texts(pg)).toContain('Comments / Analysis')
    expect(pageText(sheet[2])).toContain('Totals (57 scans)')
    expect(pageText(sheet[0])).not.toContain('Totals')
  })

  it('manual UT: N/A prints its reason, negative wall loss says so', () => {
    const p = sampleWithReport((q) => {
      const r = q.report!
      r.readings = [
        { ...r.readings[0], na: 'U-Bolt Obstruction' },
        { ...r.readings[1], link: null, name: 'N3', location: 'North', type: 'UTT', minT: 0.8, nominalMode: 'custom', nominal: 0.75 },
      ]
    })
    const t = pageText(build(p).pages.find((x) => x.sectionId === 'manual-ut')!)
    expect(t).toContain('N/A – U-Bolt Obstruction')
    expect(t).toContain('No wall loss (6.7% above nominal)')
    expect(t).toContain('minimum 0.800" (N3)')
  })
})

describe('report pages: photos', () => {
  const area = CONTENT
  const shapes = (list: [number, boolean?][]) => list.map(([aspect, alone]) => ({ aspect, alone: !!alone }))

  it('Automatic: two portraits side by side, a lone photo alone, "own page" alone, wide photos that would be tiny alone', () => {
    expect(photoPages(shapes([[0.75], [0.75], [0.75]]), 'auto', area)).toEqual([[0, 1], [2]])
    expect(photoPages(shapes([[0.75], [1.33, true], [0.75]]), 'auto', area)).toEqual([[0], [1], [2]])
    expect(photoPages(shapes([[3], [1.33]]), 'auto', area)).toEqual([[0], [1]])
    expect(photoPages(shapes([[1.33], [0.75]]), 'auto', area)).toEqual([[0, 1]])
  })

  it('fixed 1, 2 and 4 per page', () => {
    const five = shapes([[1.33], [1.33], [0.75], [1.33], [1.33]])
    expect(photoPages(five, 1, area)).toEqual([[0], [1], [2], [3], [4]])
    expect(photoPages(five, 2, area)).toEqual([[0, 1], [2, 3], [4]])
    expect(photoPages(five, 4, area)).toEqual([[0, 1, 2, 3], [4]])
  })

  it('a pair of mixed shapes gets equal heights: nothing squashed, shapes kept', () => {
    const [a, b] = rowLayout([0.75, 1.5], area, true)
    expect(a.h).toBeCloseTo(b.h, 9)
    expect(a.w / a.h).toBeCloseTo(0.75, 9)
    expect(b.w / b.h).toBeCloseTo(1.5, 9)
    expect(b.x + b.w - a.x).toBeLessThanOrEqual(area.w + 1e-9)
  })

  it('the photo pages keep every photo shape and caption; Photos per page from the option', () => {
    const p = sampleWithReport((q) => {
      q.report!.photos = [photo('900x1200.jpg', { caption: 'Portrait A' }), photo('900x1200b.jpg'), photo('1600x1200.jpg', { caption: 'Landscape' }), photo('missing.jpg')]
    })
    const auto = build(p).pages.filter((x) => x.sectionId === 'photos')
    expect(auto.map((pg) => images(pg).length)).toEqual([2, 1])
    expect(pageText(auto[0])).toContain('Portrait A')
    const [i0] = images(auto[0])
    expect(i0.w / i0.h).toBeCloseTo(0.75, 6)
    expect(pageText(auto[1])).toContain('Photo not found')
    p.report!.options.photosPerPage = { photos: 4 }
    expect(build(p).pages.filter((x) => x.sectionId === 'photos')).toHaveLength(1)
  })
})

describe('report pages: picture orientation, turn and crop', () => {
  it('EXIF orientation 6 (sideways phone photo) is portrait once upright', () => {
    const info = readImageInfo(madeUpPhoto(900, 1200, 6))!
    expect(info).toMatchObject({ width: 1200, height: 900, orientation: 6, format: 'jpg' })
    expect(uprightSize(info)).toEqual({ w: 900, h: 1200 })
    // The stored top-left corner shows top-right once upright.
    expect(orientPoint(6, [0, 0])).toEqual([1, 0])
    expect(orientPoint(8, [0, 0])).toEqual([0, 1])
  })

  it('the photo page lays a sideways phone photo out as portrait', () => {
    const p = sampleWithReport((q) => {
      q.report!.photos = [photo('1200x900-o6.jpg')]
    })
    const [img] = images(build(p).pages.find((x) => x.sectionId === 'photos')!)
    expect(img.orientation).toBe(6)
    expect(img.h).toBeGreaterThan(img.w)
    expect(img.w / img.h).toBeCloseTo(0.75, 6)
  })

  it('turn and crop: aspect of the visible part, and points map through crop then turn', () => {
    const crop = { x0: 0.25, y0: 0, x1: 0.75, y1: 0.5 }
    expect(visibleAspect({ w: 1000, h: 500 }, crop, 0)).toBeCloseTo(2, 9)
    expect(visibleAspect({ w: 1000, h: 500 }, crop, 90)).toBeCloseTo(0.5, 9)
    const item = { x: 1, y: 2, w: 4, h: 2, crop, rotate: 0 as const }
    expect(imagePoint(item, [0.25, 0])).toEqual([1, 2])
    expect(imagePoint(item, [0.75, 0.5])).toEqual([5, 4])
    const turned = { x: 1, y: 2, w: 2, h: 4, crop, rotate: 90 as const }
    // Turned a quarter clockwise: the crop's top-left goes to the box's top-right.
    expect(imagePoint(turned, [0.25, 0])).toEqual([3, 2])
    expect(imagePoint(turned, [0.25, 0.5])).toEqual([1, 2])
  })

  it('the placement matrix maps the stored corners through EXIF, turn and crop', () => {
    const item = { x: 0, y: 0, w: 3, h: 4, crop: null, rotate: 0 as const }
    const [a, b, c, d, e, f] = storedToPage(item, 6)
    const at = (sx: number, sy: number) => [a * sx + c * sy + e, b * sx + d * sy + f]
    expect(at(0, 0)).toEqual([3, 0])
    expect(at(1, 0)).toEqual([3, 4])
    expect(at(0, 1)).toEqual([0, 0])
  })

  it('marks come with the picture (redactions go to the pixels, R5); each picture is needed once at its largest size', () => {
    const p = sampleWithReport((q) => {
      q.report!.photos = [photo('1600x1200.jpg', { markup: [markSchema.parse({ id: 'a', kind: 'arrow', from: [0.1, 0.1], to: [0.5, 0.5] }), markSchema.parse({ id: 'r', kind: 'redaction', box: { x0: 0, y0: 0, x1: 0.2, y1: 0.2 } })] })]
      q.report!.coverPhoto = '1600x1200.jpg'
    })
    const d = build(p)
    const [img] = images(d.pages.find((x) => x.sectionId === 'photos')!)
    expect(img.marks.map((m) => m.kind)).toEqual(['arrow'])
    expect(img.redactions).toEqual([{ box: { x0: 0, y0: 0, x1: 0.2, y1: 0.2 }, mode: 'black' }])
    expect(img.key).toContain('|r:b')
    const needs = imageNeeds(d).filter((n) => n.ref.file === '1600x1200.jpg')
    expect(needs).toHaveLength(2)
  })
})

describe('report pages: custom sheets and uploads', () => {
  it('custom sheets: one page each in their layout, placed in their own section or after the section they name', () => {
    const p = sampleWithReport((q) => {
      q.report!.customSheets = [
        customSheetSchema.parse({ id: 's1', title: 'Boot', layout: '2 side by side', blocks: [{ kind: 'image', file: '1600x1200.jpg', caption: 'Boot photo' }, { kind: 'text', title: 'Notes', body: 'Boot scanned by hand.' }] }),
        customSheetSchema.parse({ id: 's2', title: 'Head 1 detail', after: 'calibration', layout: '4 grid', blocks: [{ kind: 'view', view: 'main' }, { kind: 'cscanBoxes', scanId: 'SCAN 1', comment: '', stats: [] }, { kind: 'table', title: 'T', rows: [['A', 'B'], ['1', '2']] }, { kind: 'view', view: 'head1' }] }),
      ]
    })
    const d = build(p)
    const after = d.pages.findIndex((x) => x.label === 'Head 1 detail')
    expect(d.pages[after - 1].sectionId).toBe('calibration')
    const boot = d.pages.find((x) => x.label === 'Boot')!
    expect(d.pages[d.pages.indexOf(boot) - 1].label).toBe('Scan 17')
    expect(pageText(boot)).toContain('Boot photo')
    expect(pageText(boot)).toContain('Boot scanned by hand.')
    const detail = d.pages[after]
    // The main drawing and head 1 alone (its own sheet: the head's items only, nothing next to it).
    const sheets = detail.items.filter((i) => i.t === 'sheet')
    expect(sheets).toHaveLength(2)
    const [main, head] = sheets as Extract<(typeof detail.items)[number], { t: 'sheet' }>[]
    expect(head.model.drawing.length).toBeLessThan(main.model.drawing.length / 3)
    expect(head.model.drawing.some((x) => x.t === 'text' && x.text === p.settings.head1Label.toUpperCase())).toBe(true)
    expect(head.model.drawing.some((x) => x.t === 'text' && x.text === p.settings.head2Label.toUpperCase())).toBe(false)
    expect(pageText(detail)).toContain('Minimum thickness')
    expect(pageText(detail)).not.toContain('View not available')
    // A head the drawing doesn't draw prints a placeholder and a note.
    const none = build(sampleWithReport((q) => {
      q.settings.headViewMode = 'NONE'
      q.report!.customSheets = [customSheetSchema.parse({ id: 's', title: 'Head', blocks: [{ kind: 'view', view: 'head2' }] })]
    }))
    expect(pageText(none.pages.find((x) => x.label === 'Head')!)).toContain('View not available')
    expect(none.notes).toContain("A custom sheet's head 2 view is not in the drawing; a placeholder prints.")
    expect(d.contents.map((e) => e.title)).toEqual(expect.arrayContaining(['Head 1 detail', 'Custom Sheets']))
  })

  it('uploads: a picture under the frame, a PDF page fitted or at its own size with only the page number', () => {
    const p = sampleWithReport((q) => {
      q.report!.uploads = [
        uploadSchema.parse({ file: '2000x1000.png', title: 'Nameplate' }),
        uploadSchema.parse({ file: 'ga.pdf', page: 2, title: 'GA drawing', rotate: 90 }),
        uploadSchema.parse({ file: 'ga.pdf', page: 1, title: 'Client form', frame: 'full' }),
      ]
    })
    const d = buildReport({ project: p, image: fakeImages, pdfPages: (f) => (f === 'ga.pdf' ? [{ w: 8.5, h: 11 }, { w: 17, h: 11 }] : null) })
    const pages = d.pages.filter((x) => x.sectionId === 'reference')
    expect(pages.map((x) => x.label)).toEqual(['Nameplate', 'GA drawing', 'Client form'])
    const ga = pages[1].items.find((i) => i.t === 'pdfPage')!
    expect(ga.t === 'pdfPage' && ga.box.h > ga.box.w).toBe(true)
    expect(pages[2].size).toEqual({ w: 8.5, h: 11 })
    expect(pages[2].footer).toBe('number')
    expect(texts(pages[2]).some((t) => /^Page \d+ of \d+$/.test(t))).toBe(true)
    expect(texts(pages[2]).some((t) => t.includes('Sample Client'))).toBe(false)
  })

  it('every block kind of the schema has a builder', () => {
    const kinds = blockSchema.options.map((o) => o.shape.kind.value)
    expect(kinds).toEqual(['image', 'view', 'cscanBoxes', 'text', 'table'])
  })
})

describe('report pages: text stays inside the page', () => {
  it('no text runs off the paper on any page', () => {
    const d = build(sampleWithReport())
    for (const page of d.pages) {
      for (const it of page.items as PageItem[]) {
        if (it.t !== 'text') continue
        const w = measure(it.text, it.font, it.size)
        const x0 = it.align === 'center' ? it.x - w / 2 : it.align === 'right' ? it.x - w : it.x
        expect(x0, `${page.label}: ${it.text}`).toBeGreaterThanOrEqual(0.3)
        expect(x0 + w, `${page.label}: ${it.text}`).toBeLessThanOrEqual(page.size.w - 0.3)
      }
    }
  })
})
