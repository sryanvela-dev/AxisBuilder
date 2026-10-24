import { describe, expect, it, vi } from 'vitest'
import { excelSize, fitSize } from '../../src/export/images/fit.ts'
import { MARKER_FILE, markerText, parseMarker } from '../../src/export/images/marker.ts'
import { checkTargetFolder, planProcessing, processedFolderName, runProcessing, type ProcessIO } from '../../src/export/images/process.ts'
import type { Project } from '../../src/data/schema.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'

/** Photo sizes like the reference jobs (screen captures) and a few odd ones. */
const PHOTOS: [number, number][] = [[1915, 957], [1532, 767], [1687, 562], [1341, 442], [800, 1200], [1000, 1000], [37, 23]]
/** Scan sizes in inches: wide, tall, square, long and thin, fractions, very long. */
const SCANS: [number, number][] = [[23, 10], [14, 20], [24, 24], [92, 6.5], [6.5, 92], [12.375, 7.125], [180, 12.75], [2.5, 47], [1, 1.5], [33.3333, 3], [280, 20]]
const CASES = PHOTOS.flatMap((ph) => SCANS.map((sc) => [...ph, ...sc] as const))

/** The shape is exact to the pixel: the rounded side is within half a pixel of the scan's width:height. */
function expectExactShape(f: { width: number; height: number }, sw: number, sh: number) {
  const r = sw / sh
  expect(Math.min(Math.abs(f.width - f.height * r), Math.abs(f.height - f.width / r))).toBeLessThanOrEqual(0.5)
  expect(Number.isInteger(f.width) && Number.isInteger(f.height)).toBe(true)
}

describe('processed image size', () => {
  it.each(CASES)('photo %ix%i, scan %s x %s in: exact shape, nothing shrunk, never below the Excel version', (pw, ph, sw, sh) => {
    const f = fitSize(pw, ph, sw, sh, 1e9)
    const excel = excelSize(sw, sh)
    expectExactShape(f, sw, sh)
    expect(f.width).toBeGreaterThanOrEqual(pw)
    expect(f.height).toBeGreaterThanOrEqual(ph)
    expect(f.width).toBeGreaterThanOrEqual(excel.width)
    expect(f.height).toBeGreaterThanOrEqual(excel.height)
    // Stretched in one direction only, unless it had to grow to the Excel version's size.
    if (!f.raised) expect(f.width === pw || f.height === ph).toBe(true)
    expect(f.capped).toBe(false)
  })

  it.each(CASES)('photo %ix%i, scan %s x %s in, 1000 px cap: at most the cap or the Excel size, shape still exact', (pw, ph, sw, sh) => {
    const free = fitSize(pw, ph, sw, sh, 1e9)
    const f = fitSize(pw, ph, sw, sh, 1000)
    const excel = excelSize(sw, sh)
    expectExactShape(f, sw, sh)
    expect(f.width).toBeGreaterThanOrEqual(excel.width)
    expect(f.height).toBeGreaterThanOrEqual(excel.height)
    if (Math.max(free.width, free.height) <= 1000) expect(f).toEqual(free)
    else if (!f.raised) expect(Math.max(f.width, f.height)).toBe(1000)
    else expect(Math.max(f.width, f.height)).toBeLessThanOrEqual(Math.max(excel.width, excel.height) + 1)
  })

  it('examples', () => {
    expect(fitSize(1915, 957, 23, 10, 1e9)).toEqual({ width: 2201, height: 957, capped: false, raised: false, stretched: 'width' })
    expect(fitSize(1915, 957, 14, 20, 1e9)).toEqual({ width: 1915, height: 2736, capped: false, raised: false, stretched: 'height' })
    expect(fitSize(1000, 500, 20, 10, 1e9)).toEqual({ width: 1000, height: 500, capped: false, raised: false, stretched: 'none' })
    expect(excelSize(23, 10)).toEqual({ width: 920, height: 400 })
    expect(excelSize(1, 1.5)).toEqual({ width: 100, height: 100 })
  })

  it('the cap scales both directions together, but never below the Excel version', () => {
    // 92 x 6.5 in: the cap gives 4096 x 289, the Excel version 3680 x 260, so the cap stands.
    expect(fitSize(1915, 957, 92, 6.5, 4096)).toEqual({ width: 4096, height: 289, capped: true, raised: false, stretched: 'width' })
    expect(fitSize(1915, 957, 6.5, 92, 4096)).toEqual({ width: 289, height: 4096, capped: true, raised: false, stretched: 'height' })
    // 280 x 20 in: the cap would give 4096 x 293, but the Excel version made 11200 x 800, so that is used.
    expect(fitSize(1915, 957, 280, 20, 4096)).toEqual({ width: 11200, height: 800, capped: true, raised: true, stretched: 'width' })
    expect(excelSize(280, 20)).toEqual({ width: 11200, height: 800 })
  })

  it('a small photo grows to the Excel version size', () => {
    // 400 x 200 px photo, 23 x 10 in scan: stretching alone gives 460 x 200; the Excel version made 920 x 400.
    expect(fitSize(400, 200, 23, 10, 4096)).toEqual({ width: 920, height: 400, capped: false, raised: true, stretched: 'width' })
    // A tiny scan: 100 px minimum each way, shape kept (1 x 1.5 in -> 100 x 150).
    expect(fitSize(37, 23, 1, 1.5, 4096)).toEqual({ width: 100, height: 150, capped: false, raised: true, stretched: 'height' })
  })

  it('refuses a photo or scan without a size', () => {
    expect(() => fitSize(0, 10, 1, 1, 100)).toThrow('photo')
    expect(() => fitSize(10, 10, 0, 1, 100)).toThrow('scan')
  })
})

describe('job marker file', () => {
  it('names the job; reads back; one value per line', () => {
    const text = markerText({ jobId: 'abc-123', jobName: 'V-100\r\nUnit 2' }, 6, new Date(2026, 9, 23, 14, 5))
    expect(text).toBe('AXISBUILDER PROCESSED IMAGES\r\nJOB ID: abc-123\r\nJOB NAME: V-100 Unit 2\r\nMADE: 2026-10-23 14:05\r\nIMAGES: 6\r\n')
    expect(parseMarker(text)).toEqual({ jobId: 'abc-123', jobName: 'V-100 Unit 2' })
    expect(parseMarker('hello')).toBeNull()
    expect(parseMarker('AXISBUILDER PROCESSED IMAGES\nJOB NAME: x\n')).toBeNull()
  })
})

const withPhotos = (p: Project, files: Record<string, string>): Project => ({
  ...p,
  scanImages: Object.entries(files).map(([scanId, imageFile]) => ({ scanId, imageFile, processedImage: '', include: true })),
})

describe('which scans are processed', () => {
  it('uses the drawing file names and lists why the others are skipped', () => {
    const base = sampleProject()
    const p = withPhotos(
      { ...base, scans: base.scans.map((s, i) => (i === 3 ? { ...s, include: false } : s)) },
      { 'SCAN 1': 'S1.png', 'SCAN 2': 'S2.png', 'SCAN 3': 'missing.png', 'SCAN 4': 'S4.png' },
    )
    p.scanImages.push({ scanId: 'SCAN 5', imageFile: 'S5.png', processedImage: '', include: false })
    const plan = planProcessing(p, ['S1.png', 'S2.PNG', 'S4.png', 'S5.png'])
    expect(plan.jobs).toEqual([
      { scanId: 'SCAN 1', scanIndex: 0, photoName: 'S1.png', outName: 'SCAN_1_FIT.png', scanW: 24, scanH: 48 },
      { scanId: 'SCAN 2', scanIndex: 1, photoName: 'S2.PNG', outName: 'SCAN_2_FIT.png', scanW: 24, scanH: 48 },
    ])
    expect(plan.skipped).toEqual([
      { scanId: 'SCAN 3', reason: 'missing.png is not in the photo folder.' },
      { scanId: 'SCAN 4', reason: 'The scan is not drawn (Include is off).' },
      { scanId: 'SCAN 5', reason: 'Its photo is switched off.' },
      { scanId: 'SCAN 6', reason: 'No photo is chosen for it.' },
    ])
    expect(planProcessing(p, null).jobs).toEqual([])
  })

  it('a reversed scan has the same shape as its swapped one', () => {
    const base = sampleProject()
    const p = withPhotos({ ...base, scans: [{ ...base.scans[0], xStart: 24, xStop: 0 }] }, { 'SCAN 1': 'S1.png' })
    expect(planProcessing(p, ['S1.png']).jobs[0]).toMatchObject({ scanW: 24, scanH: 48 })
  })

  it('the folder name is the setting only when it is a plain name', () => {
    expect(processedFolderName('Processed_Images')).toBe('Processed_Images')
    expect(processedFolderName(' Fit ')).toBe('Fit')
    expect(processedFolderName('')).toBe('Processed_Images')
    expect(processedFolderName('C:\\Jobs\\X')).toBe('Processed_Images')
  })
})

describe('the target folder', () => {
  const p = withPhotos(sampleProject(), { 'SCAN 1': 'S1.png', 'SCAN 2': 'S2.png' })
  const plan = planProcessing(p, ['S1.png', 'S2.png'])
  const mine = markerText({ jobId: p.jobId, jobName: 'Sample' }, 2)
  const theirs = markerText({ jobId: 'other-job', jobName: 'Other job' }, 9)

  it('another job: stop', () => {
    expect(checkTargetFolder([MARKER_FILE, 'SCAN_1_FIT.png'], theirs, p.jobId, plan)).toEqual({ kind: 'otherJob', marker: { jobId: 'other-job', jobName: 'Other job' } })
  })

  it('this job: lists the images that would be replaced', () => {
    expect(checkTargetFolder([MARKER_FILE, 'scan_1_fit.png', 'notes.txt'], mine, p.jobId, plan)).toEqual({ kind: 'ok', existing: ['SCAN_1_FIT.png'], unmarked: false })
  })

  it('files without a marker (the Excel version): ask; an empty or new folder: nothing to ask', () => {
    expect(checkTargetFolder(['S1_FIT_B12.png'], null, p.jobId, plan)).toEqual({ kind: 'ok', existing: [], unmarked: true })
    expect(checkTargetFolder([], null, p.jobId, plan)).toEqual({ kind: 'ok', existing: [], unmarked: false })
  })
})

describe('a processing run', () => {
  const p = withPhotos(sampleProject(), { 'SCAN 1': 'S1.png', 'SCAN 2': 'S2.png', 'SCAN 3': 'S3.png' })
  const plan = planProcessing(p, ['S1.png', 'S2.png', 'S3.png'])
  const marker = { jobId: p.jobId, jobName: 'Sample' }

  function fakeIO(fail: Partial<Record<'read' | 'fit' | 'write', string>> = {}) {
    const written: string[] = []
    const io: ProcessIO = {
      readPhoto: vi.fn(async (name) => {
        if (fail.read === name) throw new Error('locked')
        return new Blob([name])
      }),
      fit: vi.fn(async (photo, w, h) => {
        if (fail.fit === (await photo.text())) throw new Error('not a picture')
        return { blob: new Blob(['png']), width: Math.round(w * 10), height: Math.round(h * 10), capped: false, raised: false }
      }),
      write: vi.fn(async (name) => {
        if (fail.write === name) throw new Error('disk full')
        written.push(name)
      }),
    }
    return { io, written }
  }

  it('writes the marker first, then every image; keeps the ones the user chose to keep', async () => {
    const { io, written } = fakeIO()
    const progress: number[] = []
    const r = await runProcessing({ plan, keep: new Set(['SCAN_2_FIT.png']), maxSide: 4096, marker, io, onProgress: (d) => progress.push(d) })
    expect(written).toEqual([MARKER_FILE, 'SCAN_1_FIT.png', 'SCAN_3_FIT.png'])
    expect(r.processed.map((x) => x.outName)).toEqual(['SCAN_1_FIT.png', 'SCAN_3_FIT.png'])
    expect(r.skipped.find((s) => s.scanId === 'SCAN 2')?.reason).toBe('SCAN_2_FIT.png was already there and kept.')
    expect(r.failed).toEqual([])
    expect(progress).toEqual([0, 1, 2])
    expect(io.fit).toHaveBeenCalledWith(expect.any(Blob), 24, 48, 4096, undefined)
  })

  it('a failure is listed with its reason and the run goes on', async () => {
    const { io } = fakeIO({ read: 'S1.png', fit: 'S2.png', write: 'SCAN_3_FIT.png' })
    const r = await runProcessing({ plan, keep: new Set(), maxSide: 4096, marker, io })
    expect(r.failed).toEqual([
      { scanId: 'SCAN 1', reason: 'S1.png could not be read (locked).' },
      { scanId: 'SCAN 2', reason: 'S2.png could not be opened as a picture (not a picture).' },
      { scanId: 'SCAN 3', reason: 'SCAN_3_FIT.png could not be written (disk full).' },
    ])
    expect(r.processed).toEqual([])
  })

  it('cancel stops before the next image', async () => {
    const { io, written } = fakeIO()
    const controller = new AbortController()
    const r = await runProcessing({ plan, keep: new Set(), maxSide: 4096, marker, io, signal: controller.signal, onProgress: (d) => d === 1 && controller.abort() })
    expect(r.cancelled).toBe(true)
    expect(written).toEqual([MARKER_FILE, 'SCAN_1_FIT.png'])
    expect(r.skipped.filter((s) => s.reason === 'Not done: cancelled.').map((s) => s.scanId)).toEqual(['SCAN 2', 'SCAN 3'])
  })
})
