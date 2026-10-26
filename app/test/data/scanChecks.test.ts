import { describe, expect, it } from 'vitest'
import { replaceScans } from '../../src/data/autCsvImport.ts'
import { checkProject, type Check } from '../../src/data/checks.ts'
import { syncScanImages, TABLE_COLUMNS } from '../../src/data/columns.ts'
import { buildPastedRows, guessMapping, parseClipboardTable } from '../../src/data/paste.ts'
import { photoState, setPhotoLink } from '../../src/data/photos.ts'
import type { Project, Scan } from '../../src/data/schema.ts'
// The sample as it was when these tests were written (test/fixtures/olderSample.ts).
import { olderSample as sampleProject } from '../fixtures/olderSample.ts'

const scan = (id: string, xStart: number, xStop: number, yStart: number, yStop: number, include = true): Scan => ({ id, xStart, xStop, yStart, yStop, include, noWrap: false, acrossSeam: false })

function withScans(scans: Scan[], settings: Partial<Project['settings']> = {}): Project {
  const p = sampleProject()
  return {
    ...p,
    settings: { ...p.settings, ...settings },
    scans,
    scanImages: scans.map((s) => ({ scanId: s.id, imageFile: `${s.id}.png`, processedImage: '', include: true })),
  }
}

const scanChecks = (p: Project) => checkProject(p).filter((c) => (c.place.kind === 'row' && c.place.list === 'scans') || c.place.kind === 'photo')
const texts = (cs: Check[]) => cs.map((c) => `${c.severity}: ${c.text}`)

describe('scan checks', () => {
  it('a reversed start/stop is a warning; the drawing swaps it while the data check is on (v5.0)', () => {
    const noWrap = (s: Scan) => ({ ...s, noWrap: true })
    const on = scanChecks(withScans([noWrap(scan('S1', 30, 10, 0, 20))]))
    expect(texts(on)).toEqual(['warning: X start (30 in) is more than X stop (10 in).'])
    expect(on[0].fix).toContain('swaps them, so the scan runs from 10 in to 30 in')
    const off = scanChecks(withScans([noWrap(scan('S1', 30, 10, 0, 20))], { enableValidation: false }))
    expect(off[0].fix).toContain('is off, so the drawing uses them as typed')
    // Y has no seam: always the Excel version's check.
    expect(texts(scanChecks(withScans([scan('S1', 0, 10, 20, 5)])))).toEqual(['warning: Y start (20 in) is more than Y stop (5 in).'])
  })

  it('a reversed X asks: swapped, or across the seam? (one click each)', () => {
    const cs = scanChecks(withScans([scan('S1', 180, 10, 0, 20)]))
    expect(texts(cs)).toEqual(['warning: X start (180 in) is more than X stop (10 in).'])
    expect(cs[0].fix).toContain('Until you choose, the drawing swaps them.')
    expect(cs[0].actions).toEqual([
      { label: 'Swap start and stop', list: 'scans', index: 0, changes: { xStart: 10, xStop: 180 } },
      { label: 'Runs across the seam', list: 'scans', index: 0, changes: { acrossSeam: true } },
    ])
    // Marked across: no question.
    expect(scanChecks(withScans([{ ...scan('S1', 180, 10, 0, 20), acrossSeam: true }]))).toEqual([])
  })

  it('a scan running past the seam, or wholly past it, is fine; one wider than the shell is a warning', () => {
    // 240 long, 188.5 around
    expect(texts(scanChecks(withScans([scan('S1', 180, 200, 230, 250)])))).toEqual(['warning: Y stop (250 in) is past the shell length (240 in).'])
    expect(scanChecks(withScans([scan('S1', 190, 200, 0, 20)]))).toEqual([])
    expect(texts(scanChecks(withScans([scan('S1', 0, 200, 0, 20)])))).toEqual([
      "warning: It is 200 in wide, as wide as the circumference (188.5 in) or wider, so it can't be wrapped across the seam.",
    ])
    // Don't wrap: the Excel version's check.
    expect(texts(scanChecks(withScans([{ ...scan('S1', 180, 200, 0, 20), noWrap: true }])))).toEqual(['warning: X stop (200 in) is past the circumference (188.5 in).'])
  })

  it('overlaps are found across the seam too', () => {
    // S1 runs 180 to 200 (180..188.5 and 0..11.5); S2 at 5..15 overlaps its second piece by 6.5 x 20.
    const cs = scanChecks(withScans([scan('S1', 180, 200, 0, 20), scan('S2', 5, 15, 0, 20)], { overlapDetection: 'WARN' }))
    expect(texts(cs)).toEqual(['warning: Overlaps S1 (row 1) by 130 sq in.'])
  })

  it('a scan with no width or height saves, but is an error that blocks export', async () => {
    const { setCell } = await import('../../src/data/columns.ts')
    expect(setCell('scans', scan('S1', 0, 10, 0, 10), 'xStart', 10)).toMatchObject({ ok: true })
    expect(setCell('scans', scan('S1', 0, 10, 0, 10), 'xStop', 0)).toMatchObject({ ok: true })
    const cs = scanChecks(withScans([scan('S1', 24, 24, 0, 48), scan('S2', 0, 24, 10, 10)]))
    expect(texts(cs)).toEqual([
      'error: X start and X stop are both 24 in, so the scan has no width.',
      'error: Y start and Y stop are both 10 in, so the scan has no height.',
    ])
    expect(cs[0].place).toEqual({ kind: 'row', list: 'scans', index: 0, field: 'xStop' })
    const { saveProject } = await import('../../src/data/projectFile.ts')
    expect(() => saveProject(withScans([scan('S1', 24, 24, 0, 48)]))).not.toThrow()
  })

  const overlapping = [scan('S1', 0, 24, 0, 48), scan('S2', 20, 44, 40, 88), scan('S3', 100, 110, 0, 10), scan('S4', 24, 48, 0, 48)]

  it('overlaps follow Overlap Detection: OFF nothing, WARN a warning, BLOCK an error', () => {
    expect(scanChecks(withScans(overlapping, { overlapDetection: 'OFF' }))).toEqual([])
    const warn = scanChecks(withScans(overlapping, { overlapDetection: 'WARN' }))
    expect(texts(warn)).toEqual(['warning: Overlaps S1 (row 1) by 32 sq in.', 'warning: Overlaps S2 (row 2) by 160 sq in.'])
    expect(warn[1].place).toEqual({ kind: 'row', list: 'scans', index: 3, field: 'id' })
    const block = scanChecks(withScans(overlapping, { overlapDetection: 'BLOCK' }))
    expect(block.map((c) => c.severity)).toEqual(['error', 'error'])
    expect(block[0].fix).toContain('is BLOCK, so export stops')
  })

  it('touching edges and switched-off scans do not overlap; reversed scans do', () => {
    expect(scanChecks(withScans([scan('S1', 0, 24, 0, 48), scan('S2', 24, 48, 0, 48)]))).toEqual([])
    expect(scanChecks(withScans([scan('S1', 0, 24, 0, 48), scan('S2', 10, 20, 10, 20, false)]))).toEqual([])
    expect(texts(scanChecks(withScans([scan('S1', 0, 24, 0, 48), scan('S2', 20, 10, 10, 20)])))).toContain('warning: Overlaps S1 (row 1) by 100 sq in.')
  })
})

describe('the photo rule (v5.0)', () => {
  const p = withScans([scan('S1', 0, 24, 0, 48), scan('S2', 24, 48, 0, 48), scan('S3', 48, 72, 0, 48, false)])
  const noPhoto = { ...p, scanImages: p.scanImages.filter((l) => l.scanId === 'S1') }

  it('a drawn scan without a photo blocks export while the data check is on; a switched-off scan needs none', () => {
    expect(texts(scanChecks(noPhoto))).toEqual(['error: No photo chosen.'])
    expect(scanChecks(noPhoto)[0].place).toEqual({ kind: 'photo', index: 1, scanId: 'S2' })
  })

  it('with the data check off it is a warning; with "Use scan images" off there is nothing to check', () => {
    expect(texts(scanChecks({ ...noPhoto, settings: { ...noPhoto.settings, enableValidation: false } }))).toEqual(['warning: No photo chosen.'])
    expect(scanChecks({ ...noPhoto, settings: { ...noPhoto.settings, generateOverlayDrawing: false } })).toEqual([])
  })

  it('switching the photo off draws the scan without one', () => {
    const off = setPhotoLink(noPhoto, 'S2', { include: false })
    expect(scanChecks(off)).toEqual([])
    expect(off.scanImages.map((l) => [l.scanId, l.include])).toEqual([['S1', true], ['S2', false]])
    expect(photoState(off.scans[1], off.scanImages[1], ['S1.png']).state).toBe('photoOff')
    expect(photoState(off.scans[0], off.scanImages[0], ['s1.PNG'])).toEqual({ state: 'found', file: 's1.PNG' })
    expect(photoState(off.scans[0], off.scanImages[0], ['other.png']).state).toBe('missing')
    expect(photoState(off.scans[0], off.scanImages[0], null).state).toBe('chosen')
    expect(photoState(off.scans[2], null, null).state).toBe('scanOff')
  })
})

describe('scans and their photos stay in step', () => {
  const p = withScans([scan('S1', 0, 24, 0, 48), scan('S2', 24, 48, 0, 48)])

  it('a CSV import replaces the scans and clears the old photo links', () => {
    const next = replaceScans(p, [scan('A1', 0, 1, 0, 1)])
    expect(next.scans.map((s) => s.id)).toEqual(['A1'])
    expect(next.scanImages).toEqual([])
  })

  it('renaming a scan keeps its photo; deleting it drops the link', () => {
    const renamed = syncScanImages(p, { ...p, scans: [{ ...p.scans[0], id: 'S1b' }, p.scans[1]] })
    expect(renamed.scanImages.map((l) => [l.scanId, l.imageFile])).toEqual([['S1b', 'S1.png'], ['S2', 'S2.png']])
    const deleted = syncScanImages(p, { ...p, scans: [p.scans[1]] })
    expect(deleted.scanImages.map((l) => l.scanId)).toEqual(['S2'])
    expect(syncScanImages(p, p)).toBe(p)
  })

  it('scans paste from Excel, with or without the title row', () => {
    expect(TABLE_COLUMNS.scans.map((c) => c.key)).toEqual(['id', 'xStart', 'xStop', 'yStart', 'yStop', 'include', 'noWrap', 'acrossSeam'])
    expect(TABLE_COLUMNS.scans.filter((c) => c.advanced).map((c) => c.key)).toEqual(['noWrap', 'acrossSeam'])
    const rows = parseClipboardTable('Scan Name\tX Start\tX Stop\tY Start\tY Stop\nSCAN 7\t0\t24 1/2\t0\t48')
    const r = buildPastedRows(p, 'scans', rows, guessMapping('scans', rows))
    expect(r.items).toEqual([{ id: 'SCAN 7', xStart: 0, xStop: 24.5, yStart: 0, yStop: 48, include: true, noWrap: false, acrossSeam: false }])
  })
})

describe('swapping reversed scans', () => {
  it('swaps every reversed start/stop in one change; nothing else changes', async () => {
    const { reversedScans, swapReversedScans } = await import('../../src/data/columns.ts')
    const p = withScans([scan('S1', 30, 10, 0, 20), scan('S2', 0, 24, 48, 0), scan('S3', 0, 24, 0, 48)])
    expect(reversedScans(p)).toEqual(['S1', 'S2'])
    const swapped = swapReversedScans(p)
    expect(swapped.scans).toEqual([scan('S1', 10, 30, 0, 20), scan('S2', 0, 24, 0, 48), scan('S3', 0, 24, 0, 48)])
    expect(swapped.scans[2]).toBe(p.scans[2])
    expect(swapped.scanImages).toBe(p.scanImages)
    expect(reversedScans(swapped)).toEqual([])
    expect(scanChecks(swapped).filter((c) => c.text.includes('is more than'))).toEqual([])
    expect(swapReversedScans(swapped)).toBe(swapped)
  })
})
