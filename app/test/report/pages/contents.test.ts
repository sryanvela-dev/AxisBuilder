// The contents layout (user, 2026-10-31): full-width section lines, then a Scans index in 3 or 4 columns, flowing onto
// further contents pages when it does not fit; the two-pass numbering stays right.
import { describe, expect, it } from 'vitest'
import type { Scan } from '../../../src/data/schema.ts'
import { contentsLayout, contentsPageCount, scanColumns } from '../../../src/report/pages/contents.ts'
import { buildReport } from '../../../src/report/pages/index.ts'
import { CONTENT } from '../../../src/report/pages/layout.ts'
import { fakeImages, sampleWithReport } from './fixture.ts'

describe('contents layout', () => {
  it('3 columns for a short list, 4 for a long one', () => {
    expect(scanColumns(17)).toBe(3)
    expect(scanColumns(45)).toBe(3)
    expect(scanColumns(46)).toBe(4)
    expect(scanColumns(150)).toBe(4)
  })

  it('fills each column top to bottom, then the next; every scan placed once, inside the content area', () => {
    const [page] = contentsLayout(8, 17)
    expect(page.scans.map((s) => s.index)).toEqual(Array.from({ length: 17 }, (_, i) => i))
    const cols = [...new Set(page.scans.map((s) => s.cell.x))]
    expect(cols).toHaveLength(3)
    // 17 in 3 columns: 6, 6, 5.
    expect(cols.map((x) => page.scans.filter((s) => s.cell.x === x).length)).toEqual([6, 6, 5])
    for (const s of page.scans) {
      expect(s.cell.x + s.cell.w).toBeLessThanOrEqual(CONTENT.x + CONTENT.w + 1e-9)
      expect(s.cell.y + s.cell.h).toBeLessThanOrEqual(CONTENT.y + CONTENT.h + 1e-9)
    }
    expect(page.heading!.top).toBeGreaterThan(page.sections.at(-1)!.top)
  })

  it('a long index flows onto a second contents page, its heading marked continued; nothing lost or repeated', () => {
    const pages = contentsLayout(8, 150)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.slice(1).every((p) => p.sections.length === 0)).toBe(true)
    expect(pages[1].heading?.continued).toBe(true)
    expect(pages[1].heading?.top).toBeCloseTo(CONTENT.y, 9)
    expect(pages.flatMap((p) => p.scans.map((s) => s.index))).toEqual(Array.from({ length: 150 }, (_, i) => i))
    expect(contentsPageCount(8, 150)).toBe(pages.length)
    expect(contentsPageCount(8, 0)).toBe(1)
  })
})

describe('contents in the report: the flow-on case', () => {
  // The sample with 100 scans (copies of its scans): 44 fit under the sections, the rest go on a second contents page.
  const p = sampleWithReport((q) => {
    const base = q.scans
    const more: Scan[] = []
    for (let i = base.length; i < 100; i++) {
      const s = base[i % base.length]
      more.push({ ...s, id: `SCAN ${i + 1}` })
    }
    q.scans = [...base, ...more]
  })
  const doc = buildReport({ project: p, image: fakeImages })
  const contentsPages = doc.pages.filter((x) => x.sectionId === 'contents')

  it('takes two pages, both under the standard header, and every page number still points at the right page', () => {
    expect(contentsPages.length).toBe(2)
    expect(contentsPages[1].label).toBe('Contents 2')
    const links = contentsPages.flatMap((pg) => pg.items.filter((i) => i.t === 'link')) as { page: number }[]
    const cscan = doc.contents.find((e) => e.title === 'C-Scan Data')!
    expect(doc.pages[cscan.page].sectionId).toBe('cscan')
    const scanLinks = links.slice(doc.contents.length)
    expect(scanLinks).toHaveLength(100)
    scanLinks.forEach((l, i) => expect(l.page).toBe(cscan.page + i))
    // The second contents page shifted everything after it by one; the numbers printed say so.
    expect(doc.contents[0].page).toBe(3)
  })
})
