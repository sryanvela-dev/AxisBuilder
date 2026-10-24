import { describe, expect, it } from 'vitest'
import {
  defaultImageName,
  defaultProcessedName,
  matchScanImages,
  namingPattern,
  processedImageNames,
  resolveImageFile,
  scanNumberFromName,
  applyImageChoices,
  createEmptyProject,
  openProject,
  saveProject,
  type ImageMatchResult,
} from '../../src/data/index.ts'

const scans = (...ids: string[]) => ids.map((id) => ({ id }))
const byScan = (r: ImageMatchResult) =>
  Object.fromEntries(r.scans.map((s) => [s.scanId, s.status === 'choose' ? `choose ${s.candidates.join('|')}` : `${s.status} ${s.file ?? ''}`.trim()]))

describe('v5.0 naming rules', () => {
  it('takes the first digit group as the scan number', () => {
    expect(scanNumberFromName('SCAN01')).toBe(1)
    expect(scanNumberFromName('Scan 12b')).toBe(12)
    expect(scanNumberFromName('S3_FIT_B12')).toBe(3)
    expect(scanNumberFromName('CAL')).toBe(-1)
    expect(scanNumberFromName('S1234567890')).toBe(-1) // longer than 9 digits
  })

  it('builds default and processed names like v5.0', () => {
    expect(defaultImageName('SCAN01')).toBe('S1')
    expect(defaultProcessedName('SCAN01')).toBe('S1_FIT_B12.png')
    expect(defaultImageName('NORTH')).toBe('SNORTH')
  })

  it('derives the naming pattern from the base name', () => {
    expect(namingPattern('S1.png')).toBe('S#')
    expect(namingPattern('IMG_0042.jpg')).toBe('IMG_#')
    expect(namingPattern('Scan 3-final.JPEG')).toBe('Scan #-final')
    expect(namingPattern('photo.png')).toBeNull()
  })

  it('resolves an image name with or without extension, ignoring case', () => {
    const files = ['S1.PNG', 'S2.jpg', 'S2.jpeg', 'S3.jpeg']
    expect(resolveImageFile('s1.png', files)).toBe('S1.PNG')
    expect(resolveImageFile('S2', files)).toBe('S2.jpg') // .png, then .jpg, then .jpeg
    expect(resolveImageFile('S3.png', files)).toBe('S3.jpeg')
    expect(resolveImageFile('S9', files)).toBeNull()
    expect(resolveImageFile('', files)).toBeNull()
  })
})

describe('matching a folder to scans', () => {
  it('matches one naming pattern and lists files it ignored', () => {
    const r = matchScanImages(scans('SCAN1', 'SCAN2', 'SCAN3'), ['S1.png', 'S2.JPG', 'notes.txt', 'overview.png'])
    expect(r.chosenPattern).toBe('S#')
    expect(r.needsPatternChoice).toBe(false)
    expect(byScan(r)).toEqual({ SCAN1: 'matched S1.png', SCAN2: 'matched S2.JPG', SCAN3: 'noMatch' })
    expect(r.scans[2].reason).toBe('No image file with number 3 (expected e.g. S3.png).')
    expect(r.ignoredFiles).toEqual([
      { name: 'notes.txt', reason: 'Not a .png, .jpg or .jpeg file.' },
      { name: 'overview.png', reason: 'No number in the file name.' },
    ])
    expect(r.counts).toEqual({ matched: 2, choose: 0, noMatch: 1 })
  })

  it('picks the pattern covering most scans and flags the choice when patterns are mixed', () => {
    const files = ['S1.png', 'S2.png', 'S3.png', 'IMG_0003.jpg', 'IMG_0004.jpg', 'Scan 1-final.jpeg']
    const r = matchScanImages(scans('SCAN1', 'SCAN2', 'SCAN3', 'SCAN4'), files)
    expect(r.patterns).toEqual([
      { pattern: 'S#', scanCount: 3, fileCount: 3, example: 'S1.png' },
      { pattern: 'IMG_#', scanCount: 2, fileCount: 2, example: 'IMG_0003.jpg' },
      { pattern: 'Scan #-final', scanCount: 1, fileCount: 1, example: 'Scan 1-final.jpeg' },
    ])
    expect(r.chosenPattern).toBe('S#')
    expect(r.needsPatternChoice).toBe(true)
    // SCAN4 only has a file in another pattern: v5.0 asked, so the user chooses.
    expect(byScan(r)).toEqual({
      SCAN1: 'matched S1.png', SCAN2: 'matched S2.png', SCAN3: 'matched S3.png', SCAN4: 'choose IMG_0004.jpg',
    })
    expect(r.scans[3].reason).toBe('No file in the "S#" pattern; 1 file(s) with number 4 in another pattern; choose one.')
  })

  it('uses a pattern chosen by the user', () => {
    const files = ['S1.png', 'S2.png', 'IMG_1.jpg', 'IMG_2.jpg']
    const r = matchScanImages(scans('SCAN1', 'SCAN2'), files, { pattern: 'img_#' })
    expect(r.chosenPattern).toBe('IMG_#')
    expect(r.needsPatternChoice).toBe(false)
    expect(byScan(r)).toEqual({ SCAN1: 'matched IMG_1.jpg', SCAN2: 'matched IMG_2.jpg' })
  })

  it('asks when several files in the chosen pattern have the same number', () => {
    const r = matchScanImages(scans('SCAN1', 'SCAN2'), ['S1.png', 'S1.jpg', 'S01.png', 'S2.png'])
    expect(byScan(r)).toEqual({ SCAN1: 'choose S1.png|S1.jpg|S01.png', SCAN2: 'matched S2.png' })
    expect(r.scans[0].reason).toBe('3 files with number 1 in the "S#" pattern; choose one.')
  })

  it('keeps the current image file when it is one of the candidates', () => {
    const r = matchScanImages([{ id: 'SCAN1', imageFile: 'S01' }], ['S1.png', 'S01.png'])
    expect(r.scans[0]).toMatchObject({ status: 'matched', file: 'S01.png', keptExisting: true })
  })

  it('flags a match that differs from the current image file', () => {
    const r = matchScanImages([{ id: 'SCAN1', imageFile: 'old1.png' }, { id: 'SCAN2', imageFile: 'S2' }], ['S1.png', 'S2.png'])
    expect(r.scans[0]).toMatchObject({ status: 'matched', file: 'S1.png', replacesExisting: true })
    expect(r.scans[0].reason).toBe('Matched S1.png; differs from the current image file old1.png.')
    expect(r.scans[1]).toMatchObject({ status: 'matched', file: 'S2.png', replacesExisting: false })
  })

  it('handles scans without a number', () => {
    const r = matchScanImages([{ id: 'NORTH' }, { id: 'SOUTH', imageFile: 'south view.png' }], ['south view.png', 'S1.png'])
    expect(byScan(r)).toEqual({ NORTH: 'noMatch', SOUTH: 'matched south view.png' })
    expect(r.scans[0].reason).toBe('No number in the scan name, so no file can be matched.')
  })

  it('reports no match for an empty folder', () => {
    const r = matchScanImages(scans('SCAN1'), [])
    expect(r.chosenPattern).toBeNull()
    expect(r.nothingFits).toBe(true)
    expect(byScan(r)).toEqual({ SCAN1: 'noMatch' })
  })

  it('lists formats that fit no scan and flags a folder where nothing fits', () => {
    const r = matchScanImages(scans('SCAN1', 'SCAN2'), ['T-1420A S1.png', 'T-1420A S2.png', 'DSC_0901.jpg'])
    expect(r.patterns).toEqual([
      { pattern: 'T-#A S1', scanCount: 0, fileCount: 1, example: 'T-1420A S1.png' },
      { pattern: 'T-#A S2', scanCount: 0, fileCount: 1, example: 'T-1420A S2.png' },
      { pattern: 'DSC_#', scanCount: 0, fileCount: 1, example: 'DSC_0901.jpg' },
    ])
    expect(r.chosenPattern).toBeNull()
    expect(r.nothingFits).toBe(true)
    expect(r.needsPatternChoice).toBe(false)
  })

  it('does not flag a folder where some scans fit', () => {
    expect(matchScanImages(scans('SCAN1', 'SCAN2'), ['S1.png']).nothingFits).toBe(false)
  })
})

describe('saving the chosen files', () => {
  const base = {
    ...createEmptyProject(),
    scans: ['SCAN1', 'SCAN2', 'SCAN3'].map((id, i) => ({ id, xStart: i * 10, xStop: i * 10 + 10, yStart: 0, yStop: 10, include: true, noWrap: false, acrossSeam: false })),
    scanImages: [{ scanId: 'SCAN2', imageFile: 'old2.png', processedImage: 'S2_FIT_B12.png', include: false }],
  }

  it('writes chosen files and keeps the rest', () => {
    const p = applyImageChoices(base, new Map([['SCAN1', 'S1.png'], ['SCAN2', 'S2.png']]))
    expect(p.scanImages).toEqual([
      { scanId: 'SCAN1', imageFile: 'S1.png', processedImage: '', include: true },
      // An existing link keeps its processed name and Include setting.
      { scanId: 'SCAN2', imageFile: 'S2.png', processedImage: 'S2_FIT_B12.png', include: false },
    ])
    expect(openProject(saveProject(p)).ok).toBe(true)
  })

  it('leaves current links alone for scans that were skipped', () => {
    expect(applyImageChoices(base, new Map()).scanImages).toEqual(base.scanImages)
  })
})

describe('processed image names (app)', () => {
  it('names each file after its scan, file-safe and unique', () => {
    const names = processedImageNames(['SCAN 1', 'SCAN01', 'NORTH', 'a/b', 'A:B', 'scan  1'])
    expect([...names.values()]).toEqual([
      'SCAN_1_FIT.png', 'SCAN01_FIT.png', 'NORTH_FIT.png', 'a_b_FIT.png', 'A_B_2_FIT.png', 'scan_1_2_FIT.png',
    ])
  })
})
