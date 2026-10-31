// Photos and pages edits (report/pagesEdits.ts), uploaded PDF info (report/pdfInfo.ts) and the report's file name.
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { reportPdfName } from '../../src/export/files.ts'
import { buildReport } from '../../src/report/pages/index.ts'
import {
  addBlock,
  addCustomSheet,
  addUploads,
  isPdfUpload,
  moveBlock,
  moveCustomSheet,
  moveUpload,
  newBlock,
  pictureAt,
  removeBlock,
  removeCustomSheet,
  removeUpload,
  setBlock,
  setCustomSheet,
  setPictureEdits,
  setUpload,
  tableFromText,
  tableToText,
} from '../../src/report/pagesEdits.ts'
import { PDF_DAMAGED, PDF_LOCKED, readPdfInfo } from '../../src/report/pdfInfo.ts'
import { photoSchema } from '../../src/report/schema.ts'
import { fakeImages, sampleWithReport } from './pages/fixture.ts'

const CROP = { x0: 0.1, y0: 0.2, x1: 0.9, y1: 0.8 }

describe('picture edits by place', () => {
  it('sets crop and turn on every kind of picture, and nothing when unchanged', () => {
    let p = sampleWithReport((q) => {
      q.report!.coverPhoto = 'cover.jpg'
      q.report!.calibration.dynamicImage = 'cal.png'
      q.report!.photos = [photoSchema.parse({ file: 'a.jpg' })]
    })
    p = addCustomSheet(p).project
    p = addBlock(p, 'sheet1', newBlock('image', 'b.jpg'))
    p = addUploads(p, [{ file: 'nameplate.jpg', page: null }])
    const scan = p.report!.scanResults[0].scanId
    const places = [
      { kind: 'cover' as const }, { kind: 'calibration' as const }, { kind: 'photo' as const, index: 0 },
      { kind: 'dataImage' as const, scanId: scan }, { kind: 'sheetImage' as const, sheetId: 'sheet1', block: 0 }, { kind: 'upload' as const, index: 0 },
    ]
    for (const at of places) {
      const q = setPictureEdits(p, at, { crop: CROP, rotate: 90 })
      expect(pictureAt(q.report!, at)!.edits, at.kind).toMatchObject({ crop: CROP, rotate: 90 })
      expect(setPictureEdits(q, at, { crop: CROP, rotate: 90 })).toBe(q)
      // Nothing else changed.
      const others = places.filter((x) => x !== at).map((x) => pictureAt(q.report!, x)!.edits.crop)
      expect(others.every((c) => c === null)).toBe(true)
    }
  })

  it('marks stay where they are on the picture when it is cropped', () => {
    const p = sampleWithReport((q) => {
      q.report!.photos = [photoSchema.parse({ file: 'a.jpg', markup: [{ id: 'm', kind: 'arrow', from: [0.1, 0.1], to: [0.3, 0.3] }] })]
    })
    const q = setPictureEdits(p, { kind: 'photo', index: 0 }, { crop: CROP })
    expect(q.report!.photos[0].markup).toEqual(p.report!.photos[0].markup)
  })
})

describe('custom sheets', () => {
  it('add, title, place, layout, move and remove; ids stay unique', () => {
    let p = sampleWithReport()
    const a = addCustomSheet(p)
    p = a.project
    expect(a.id).toBe('sheet1')
    p = addCustomSheet(p, '4 grid').project
    expect(p.report!.customSheets.map((s) => [s.id, s.title, s.layout])).toEqual([['sheet1', 'Sheet 1', '1 large'], ['sheet2', 'Sheet 2', '4 grid']])
    p = setCustomSheet(p, 'sheet1', { title: 'Boot', after: 'calibration', layout: '2 side by side' })
    expect(p.report!.customSheets[0]).toMatchObject({ title: 'Boot', after: 'calibration', layout: '2 side by side' })
    expect(setCustomSheet(p, 'sheet1', { title: 'Boot' })).toBe(p)
    p = moveCustomSheet(p, 0, 1)
    expect(p.report!.customSheets.map((s) => s.id)).toEqual(['sheet2', 'sheet1'])
    p = removeCustomSheet(p, 'sheet2')
    expect(addCustomSheet(p).id).toBe('sheet2')
  })

  it('blocks: add one of each kind, change, change kind (starts empty), move, remove', () => {
    let p = addCustomSheet(sampleWithReport(), '4 grid').project
    for (const k of ['image', 'view', 'cscanBoxes', 'text', 'table'] as const) p = addBlock(p, 'sheet1', newBlock(k, 'pic.jpg'))
    const blocks = () => p.report!.customSheets[0].blocks
    expect(blocks().map((b) => b.kind)).toEqual(['image', 'view', 'cscanBoxes', 'text', 'table'])
    p = setBlock(p, 'sheet1', 3, { title: 'Notes', body: 'Hello' })
    expect(blocks()[3]).toEqual({ kind: 'text', title: 'Notes', body: 'Hello' })
    p = setBlock(p, 'sheet1', 1, { view: 'head1' })
    expect(blocks()[1]).toEqual({ kind: 'view', view: 'head1' })
    p = setBlock(p, 'sheet1', 3, { kind: 'view' })
    expect(blocks()[3]).toEqual({ kind: 'view', view: 'main' })
    p = moveBlock(p, 'sheet1', 4, 0)
    expect(blocks()[0].kind).toBe('table')
    p = removeBlock(p, 'sheet1', 0)
    expect(blocks()).toHaveLength(4)
  })

  it('a small table as text: rows by line, cells by | or tab', () => {
    expect(tableFromText('A | B\n1\t2\n\n')).toEqual([['A', 'B'], ['1', '2']])
    expect(tableToText([['A', 'B'], ['1', '2']])).toBe('A | B\n1 | 2')
  })

  it('every layout prints its blocks in its slots; blocks past the slots are left out with a note', () => {
    for (const [layout, n] of [['1 large', 1], ['2 side by side', 2], ['2 + side panel', 3], ['4 grid', 4]] as const) {
      let p = addCustomSheet(sampleWithReport(), layout).project
      for (let i = 0; i < 5; i++) p = addBlock(p, 'sheet1', newBlock('text'))
      p = setBlock(p, 'sheet1', 0, { title: 'First' })
      const d = buildReport({ project: p, image: fakeImages })
      const page = d.pages.find((x) => x.label === 'Sheet 1')!
      expect(page.items.some((i) => i.t === 'text' && i.text === 'First'), layout).toBe(true)
      expect(d.notes.some((x) => x.includes(`${5 - n} block(s) more than its layout holds`)), layout).toBe(true)
    }
  })
})

describe('uploads', () => {
  it('one entry per picked PDF page (titled by page) or picture; repeats skipped', () => {
    let p = addUploads(sampleWithReport(), [{ file: 'GA.pdf', page: 1 }, { file: 'GA.pdf', page: 3 }, { file: 'nameplate.jpg', page: null }])
    expect(p.report!.uploads.map((u) => [u.file, u.page, u.title])).toEqual([['GA.pdf', 1, 'GA, page 1'], ['GA.pdf', 3, 'GA, page 3'], ['nameplate.jpg', null, 'nameplate']])
    expect(addUploads(p, [{ file: 'ga.pdf', page: 1 }])).toBe(p)
    expect(isPdfUpload(p.report!.uploads[0])).toBe(true)
    expect(isPdfUpload(p.report!.uploads[2])).toBe(false)
    p = setUpload(p, 1, { frame: 'full', rotate: 90, title: 'GA drawing', after: 'photos' })
    expect(p.report!.uploads[1]).toMatchObject({ frame: 'full', rotate: 90, title: 'GA drawing', after: 'photos' })
    p = moveUpload(p, 2, 0)
    expect(p.report!.uploads[0].file).toBe('nameplate.jpg')
    p = removeUpload(p, 0)
    expect(p.report!.uploads).toHaveLength(2)
  })

  it('reads page sizes in inches; a locked or damaged PDF gets the plain message', async () => {
    const d = await PDFDocument.create()
    d.addPage([612, 792])
    d.addPage([1224, 792])
    const info = await readPdfInfo(await d.save())
    expect(info).toEqual({ ok: true, pages: [{ w: 8.5, h: 11 }, { w: 17, h: 11 }] })
    expect(await readPdfInfo(new TextEncoder().encode('not a pdf at all'))).toEqual({ ok: false, problem: PDF_DAMAGED })
    // A PDF with an /Encrypt entry in its trailer counts as locked.
    const e = await PDFDocument.create()
    e.addPage([612, 792])
    e.context.trailerInfo.Encrypt = e.context.register(e.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -4 }))
    expect(await readPdfInfo(await e.save({ useObjectStreams: false }))).toEqual({ ok: false, problem: PDF_LOCKED })
  })
})

describe('report file name (design 11.4)', () => {
  it('is "<job> - <client> - AUT Report.pdf", without the client when there is none', () => {
    expect(reportPdfName('V-100', 'Example Client')).toBe('V-100 - Example Client - AUT Report.pdf')
    expect(reportPdfName('V-100', '  ')).toBe('V-100 - AUT Report.pdf')
    expect(reportPdfName('V-100')).toBe('V-100 - AUT Report.pdf')
    expect(reportPdfName('V/100', 'A:B')).toBe('V_100 - A_B - AUT Report.pdf')
  })
})
