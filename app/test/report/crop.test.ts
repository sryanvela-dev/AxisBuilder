// The crop tool's geometry (report/crop.ts): boxes on the turned picture <-> the stored crop, shapes, dragging.
import { describe, expect, it } from 'vitest'
import { boxAspect, dragBox, fitAspect, presetAspect, presetBox, storedCrop, turnBox, turned, turnedSize, turnPoint, unturnBox, unturnPoint } from '../../src/report/crop.ts'
import { imagePoint, uprightSize, visibleAspect } from '../../src/report/pageModel.ts'
import type { FracBox, Rotation } from '../../src/report/schema.ts'

const close = (a: FracBox, b: FracBox) => {
  for (const k of ['x0', 'y0', 'x1', 'y1'] as const) expect(a[k], k).toBeCloseTo(b[k], 9)
}

describe('turning boxes', () => {
  it('turnPoint matches how the page turns a picture (pageModel imagePoint), and unturnPoint undoes it', () => {
    for (const r of [0, 90, 180, 270] as Rotation[]) {
      for (const pt of [[0.1, 0.2], [0.9, 0.3], [0.5, 0.5]] as [number, number][]) {
        const page = imagePoint({ x: 0, y: 0, w: 1, h: 1, crop: null, rotate: r }, pt)
        expect(turnPoint(r, pt)).toEqual(page)
        const back = unturnPoint(r, turnPoint(r, pt))
        expect(back[0]).toBeCloseTo(pt[0], 12)
        expect(back[1]).toBeCloseTo(pt[1], 12)
      }
    }
  })

  it('a box drawn on the turned picture is stored unturned, and shown again where it was drawn', () => {
    const drawn = { x0: 0.1, y0: 0.2, x1: 0.4, y1: 0.9 }
    for (const r of [0, 90, 180, 270] as Rotation[]) close(turnBox(r, unturnBox(r, drawn)), drawn)
    // A quarter turn right: the top band of what you see is the left band of the upright picture.
    close(unturnBox(90, { x0: 0, y0: 0, x1: 1, y1: 0.25 }), { x0: 0, y0: 0, x1: 0.25, y1: 1 })
  })

  it("EXIF 6 phone photo, turned a quarter more and cropped: prints exactly the drawn box's shape", () => {
    // Stored 1200 x 900 with EXIF 6 = upright 900 x 1200 (portrait); a quarter turn shows it 1200 x 900.
    const upright = uprightSize({ width: 1200, height: 900, orientation: 6 })
    expect(upright).toEqual({ w: 900, h: 1200 })
    const shown = turnedSize(upright, 90)
    expect(shown).toEqual({ w: 1200, h: 900 })
    const drawn = { x0: 0.25, y0: 0.1, x1: 0.75, y1: 0.6 }
    const crop = unturnBox(90, drawn)
    expect(visibleAspect(upright, crop, 90)).toBeCloseTo(boxAspect(drawn, shown), 9)
    expect(boxAspect(drawn, shown)).toBeCloseTo((0.5 * 1200) / (0.5 * 900), 9)
  })
})

describe('shapes', () => {
  const landscape = { w: 4000, h: 2000 }
  const portrait = { w: 1500, h: 2000 }
  it('presets lie the way the picture lies; original is its own shape', () => {
    expect(presetAspect('4:3', landscape)).toBeCloseTo(4 / 3)
    expect(presetAspect('4:3', portrait)).toBeCloseTo(3 / 4)
    expect(presetAspect('3:2', portrait)).toBeCloseTo(2 / 3)
    expect(presetAspect('square', portrait)).toBe(1)
    expect(presetAspect('original', landscape)).toBe(2)
  })

  it('the preset box is the largest centred box of that shape', () => {
    const sq = presetBox(1, landscape)
    close(sq, { x0: 0.25, y0: 0, x1: 0.75, y1: 1 })
    expect(boxAspect(sq, landscape)).toBeCloseTo(1)
    close(presetBox(2, landscape), { x0: 0, y0: 0, x1: 1, y1: 1 })
    const wide = presetBox(4, landscape)
    expect(boxAspect(wide, landscape)).toBeCloseTo(4)
    expect(wide.x1 - wide.x0).toBeCloseTo(1)
  })

  it('fitAspect keeps the centre and stays on the picture', () => {
    const b = fitAspect({ x0: 0.8, y0: 0, x1: 1, y1: 1 }, 1, landscape)
    expect(boxAspect(b, landscape)).toBeCloseTo(1)
    expect(b.x1).toBeLessThanOrEqual(1 + 1e-12)
    expect(b.y0).toBeGreaterThanOrEqual(0)
  })
})

describe('dragging', () => {
  const size = { w: 2000, h: 1000 }
  const box = { x0: 0.2, y0: 0.2, x1: 0.6, y1: 0.8 }

  it('moves the box and keeps it on the picture', () => {
    close(dragBox(box, 'move', 0.1, -0.1, null, size), { x0: 0.3, y0: 0.1, x1: 0.7, y1: 0.7 })
    close(dragBox(box, 'move', 1, 1, null, size), { x0: 0.6, y0: 0.4, x1: 1, y1: 1 })
  })

  it('free: a corner moves alone, the opposite corner stays; never smaller than the minimum', () => {
    close(dragBox(box, 'se', 0.1, 0.1, null, size), { x0: 0.2, y0: 0.2, x1: 0.7, y1: 0.9 })
    const tiny = dragBox(box, 'nw', 1, 1, null, size)
    expect(tiny.x1 - tiny.x0).toBeGreaterThan(0.02)
    expect(tiny.x1).toBe(0.6)
  })

  it('shape kept: corners and sides keep the aspect, the fixed side stays, and the box stays on the picture', () => {
    const a = boxAspect(box, size)
    const se = dragBox(box, 'se', 0.1, 0, a, size)
    expect(boxAspect(se, size)).toBeCloseTo(a, 9)
    expect(se.x0).toBe(0.2)
    expect(se.y0).toBe(0.2)
    const e = dragBox(box, 'e', 0.05, 0, a, size)
    expect(boxAspect(e, size)).toBeCloseTo(a, 9)
    expect((e.y0 + e.y1) / 2).toBeCloseTo(0.5, 9)
    const big = dragBox(box, 'se', 5, 5, a, size)
    expect(boxAspect(big, size)).toBeCloseTo(a, 9)
    expect(big.x1).toBeLessThanOrEqual(1 + 1e-9)
    expect(big.y1).toBeLessThanOrEqual(1 + 1e-9)
  })
})

describe('storing', () => {
  it('a crop of (almost) the whole picture is no crop; a quarter turn wraps round', () => {
    expect(storedCrop({ x0: 0.0004, y0: 0, x1: 1, y1: 0.9996 })).toBeNull()
    expect(storedCrop({ x0: 0.1, y0: 0, x1: 1, y1: 1 })).toEqual({ x0: 0.1, y0: 0, x1: 1, y1: 1 })
    expect(turned(270, 'right')).toBe(0)
    expect(turned(0, 'left')).toBe(270)
  })
})
