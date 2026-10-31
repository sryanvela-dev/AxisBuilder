import { describe, expect, it } from 'vitest'
import { addPhotos, movePhotoTo, removePhoto, rotatePhoto, setPhoto, setPhotosPerPage } from '../../src/report/edits.ts'
import { checkReport } from '../../src/report/checks.ts'
import { markSchema } from '../../src/report/schema.ts'
import { stepOfReportCheck } from '../../src/state/reportSteps.ts'
import { sampleWithReport } from './pages/fixture.ts'

describe('photo edits (Photos and pages, R3)', () => {
  it('adds photos at the end, skipping names already in the list (any case) and repeats', () => {
    const p = addPhotos(sampleWithReport(), ['a.jpg', 'b.jpg'])
    const q = addPhotos(p, ['A.JPG', 'c.jpg', 'c.jpg'])
    expect(q.report!.photos.map((x) => x.file)).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
    expect(addPhotos(q, ['a.jpg'])).toBe(q)
  })

  it('caption, own page, a quarter turn either way, move and remove', () => {
    let p = addPhotos(sampleWithReport(), ['a.jpg', 'b.jpg', 'c.jpg'])
    p = setPhoto(p, 1, { caption: 'North', alone: true })
    expect(p.report!.photos[1]).toMatchObject({ caption: 'North', alone: true })
    expect(setPhoto(p, 1, { caption: 'North' })).toBe(p)
    p = rotatePhoto(p, 0, 'left')
    expect(p.report!.photos[0].rotate).toBe(270)
    p = rotatePhoto(rotatePhoto(p, 0, 'right'), 0, 'right')
    expect(p.report!.photos[0].rotate).toBe(90)
    p = movePhotoTo(p, 0, 2)
    expect(p.report!.photos.map((x) => x.file)).toEqual(['b.jpg', 'c.jpg', 'a.jpg'])
    expect(movePhotoTo(p, 0, 0)).toBe(p)
    p = removePhoto(p, 1)
    expect(p.report!.photos.map((x) => x.file)).toEqual(['b.jpg', 'a.jpg'])
  })

  it('Photos per page: the template default removes the job choice', () => {
    let p = setPhotosPerPage(sampleWithReport(), 'photos', 4)
    expect(p.report!.options.photosPerPage).toEqual({ photos: 4 })
    p = setPhotosPerPage(p, 'photos', 'auto')
    expect(p.report!.options.photosPerPage).toEqual({})
    expect(setPhotosPerPage(p, 'photos', 'auto')).toBe(p)
  })

  it('Review notes a redacted picture (the PDF removes the pixels), on the Photos and pages step', () => {
    const p = sampleWithReport((q) => {
      q.report!.photos = [{ file: 'a.jpg', caption: '', alone: false, crop: null, rotate: 0, adjust: { autoLevels: false, darken: 0 }, markup: [markSchema.parse({ id: 'r', kind: 'redaction', box: { x0: 0, y0: 0, x1: 0.2, y1: 0.2 } })] }]
    })
    const c = checkReport(p).find((x) => x.place.kind === 'picture')!
    expect(c.severity).toBe('note')
    expect(c.text).toContain('with those pixels removed')
    expect(stepOfReportCheck(c)).toBe('pages')
  })
})
