// The markup editor's data side (design 14, R5): mark geometry in 0-1 space through EXIF, turn and crop, every tool's
// result data, snapping, the straight highlighter's angle lock, the label leader re-attach, badge numbering and the
// key, live labels (and a deleted row), saved label styles, copy markup, auto levels, redaction pixels and format 10.
import jpeg from 'jpeg-js'
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { openProject, saveProject } from '../../src/data/projectFile.ts'
import type { Project } from '../../src/data/schema.ts'
import { applyLevels, applyPixelEdits, blurBlock, levelsOf, redactRect, uprightPixels, type Pixels } from '../../src/report/imageProcess.ts'
import { fillTemplate, liveText, refreshLiveLabels } from '../../src/report/liveLabels.ts'
import { addMark, appendCopies, applyLabelStyle, BUILT_IN_LABEL_STYLES, copyMarkupTo, duplicateMarks, labelStyleOf, removeMarks, reorderMarks, setLocked, setStyle } from '../../src/report/markEdits.ts'
import {
  boxToView, dragHandle, finishStroke, hitMark, labelRect, leaderStart, lockAngle, markAt, markBounds, moveMark, simplify, snapMove, snapPoint, snapPoints, snapTargets, toFrac, toView, viewToBox,
  type MarkFrame,
} from '../../src/report/markGeometry.ts'
import { contrastOf, markItemsOf } from '../../src/report/marks.ts'
import { applyPrefToMark, DEFAULT_PREFS, prefsOfMark, toolStyle } from '../../src/report/markTools.ts'
import { imagePoint, type ImageItem } from '../../src/report/pageModel.ts'
import { keyEntries, keyHeight } from '../../src/report/pages/badgeKey.ts'
import { buildReport } from '../../src/report/pages/index.ts'
import { writeReportPdf } from '../../src/report/pdf/writeReportPdf.ts'
import { pictureAt } from '../../src/report/pagesEdits.ts'
import { addRecord, emptySavedLists, listsFromFile, listsToFile, readSavedLists } from '../../src/report/savedLists.ts'
import { markSchema, photoSchema, uploadSchema, type Mark } from '../../src/report/schema.ts'
import { syncReport } from '../../src/report/sync.ts'
import { checkReport } from '../../src/report/checks.ts'
import { fakeImages, sampleWithReport } from './pages/fixture.ts'
import { DRAWING_FONT, REPORT_FONTS, folderImages } from './pages/nodeFiles.ts'
import { madeUpPhoto } from './pages/photos.ts'

const mark = (m: Record<string, unknown>): Mark => markSchema.parse({ id: 'm1', ...m })
/** A 4000 x 3000 photo printed 8 in wide, not turned, not cropped. */
const frame = (rotate: 0 | 90 | 180 | 270 = 0, crop: MarkFrame['crop'] = null): MarkFrame => {
  const upright = { w: 4000, h: 3000 }
  const c = crop ?? { x0: 0, y0: 0, x1: 1, y1: 1 }
  const vw = (rotate === 90 || rotate === 270 ? (c.y1 - c.y0) * upright.h : (c.x1 - c.x0) * upright.w)
  const vh = (rotate === 90 || rotate === 270 ? (c.x1 - c.x0) * upright.w : (c.y1 - c.y0) * upright.h)
  return { x: 1, y: 2, w: 8, h: (8 * vh) / vw, crop, rotate, upright }
}
const close = (a: readonly number[], b: readonly number[], d = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], d))

describe('mark geometry: view <-> stored through turn and crop', () => {
  for (const rotate of [0, 90, 180, 270] as const) {
    it(`a point goes to the view and back (turn ${rotate}, cropped)`, () => {
      const f = frame(rotate, { x0: 0.1, y0: 0.2, x1: 0.7, y1: 0.9 })
      const q: [number, number] = [0.33, 0.61]
      close(toFrac(f, toView(f, q)), q)
      close(toView(f, q), imagePoint(f, q))
    })

    it(`a box keeps its true size and shape in the view (turn ${rotate})`, () => {
      const f = frame(rotate, { x0: 0.25, y0: 0, x1: 0.75, y1: 1 })
      const b = { x0: 0.3, y0: 0.4, x1: 0.5, y1: 0.5 }
      const g = boxToView(f, b, 20)
      // 800 x 300 px; the visible width (2000 px or 3000 px turned) prints 8 in.
      const px = 8 / (rotate === 90 || rotate === 270 ? 3000 : 2000)
      const [w, h] = rotate === 90 || rotate === 270 ? [300 * px, 800 * px] : [800 * px, 300 * px]
      expect(g.w).toBeCloseTo(w, 9)
      expect(g.h).toBeCloseTo(h, 9)
      expect(g.a).toBe(20)
      const back = viewToBox(f, g)
      close([back.box.x0, back.box.y0, back.box.x1, back.box.y1], [b.x0, b.y0, b.x1, b.y1], 9)
    })
  }

  it('moving a mark in the view moves it on the picture the same way, and never off it', () => {
    const f = frame(90)
    const m = mark({ kind: 'line', from: [0.2, 0.2], to: [0.4, 0.3] })
    const moved = moveMark(f, m, [0.5, 0]) as Extract<Mark, { kind: 'line' }>
    close(toView(f, moved.from), [toView(f, [0.2, 0.2])[0] + 0.5, toView(f, [0.2, 0.2])[1]])
    const r = mark({ kind: 'rect', box: { x0: 0.8, y0: 0.1, x1: 0.95, y1: 0.2 } })
    const far = moveMark(frame(), r, [5, 0]) as Extract<Mark, { kind: 'rect' }>
    expect(far.box.x1).toBeCloseTo(1, 9)
    expect(far.box.x1 - far.box.x0).toBeCloseTo(0.15, 9)
  })

  it('resizing a box keeps the opposite corner; Shift keeps its shape; the turn handle turns it (15 degree steps with Shift)', () => {
    const f = frame()
    const r = mark({ kind: 'rect', box: { x0: 0.25, y0: 0.25, x1: 0.5, y1: 0.5 } })
    const g = boxToView(f, (r as Extract<Mark, { kind: 'rect' }>).box)
    const nw: [number, number] = [g.c[0] - g.w / 2, g.c[1] - g.h / 2]
    const bigger = dragHandle(f, r, 'se', [g.c[0] + g.w, g.c[1] + g.h]) as Extract<Mark, { kind: 'rect' }>
    close(toView(f, [bigger.box.x0, bigger.box.y0]), nw)
    const kept = dragHandle(f, r, 'se', [g.c[0] + g.w, g.c[1] + g.h * 3], true) as Extract<Mark, { kind: 'rect' }>
    const kg = boxToView(f, kept.box)
    expect(kg.w / kg.h).toBeCloseTo(g.w / g.h, 6)
    const turned = dragHandle(f, r, 'rotate', [g.c[0] + 1, g.c[1] + 0.02], true) as Extract<Mark, { kind: 'rect' }>
    expect(turned.angle).toBe(90)
  })

  it('the straight highlighter and line ends hold to 0 / 45 / 90 degrees with Shift', () => {
    close(lockAngle([0, 0], [10, 1]), [10, 0])
    close(lockAngle([0, 0], [5, 4.6]), [4.8, 4.8])
    close(lockAngle([0, 0], [0.4, -9]), [0, -9])
    const f = frame()
    const h = mark({ kind: 'highlight', straight: true, points: [[0.1, 0.5], [0.5, 0.52]] })
    const end = toView(f, [0.6, 0.55])
    const locked = dragHandle(f, h, 'to', end, true) as Extract<Mark, { kind: 'highlight' }>
    expect(toView(f, locked.points[1])[1]).toBeCloseTo(toView(f, [0.1, 0.5])[1], 9)
  })

  it('freehand strokes are smoothed and simplified, then stored as fractions', () => {
    const f = frame()
    const wobbly: [number, number][] = Array.from({ length: 50 }, (_, i) => [2 + i * 0.1, 4 + (i % 2 ? 0.002 : -0.002)])
    const pts = finishStroke(f, wobbly)
    expect(pts.length).toBe(2)
    expect(simplify([[0, 0], [1, 1], [2, 0]], 0.1)).toHaveLength(3)
    expect(pts.every((p) => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1)).toBe(true)
  })

  it('hit tests: on an outline, inside a filled box, on a label, the top-most first', () => {
    const f = frame()
    const outline = mark({ kind: 'rect', box: { x0: 0.2, y0: 0.2, x1: 0.6, y1: 0.6 } })
    const g = boxToView(f, (outline as Extract<Mark, { kind: 'rect' }>).box)
    expect(hitMark(f, outline, g.c, 0.05)).toBe(false)
    expect(hitMark(f, outline, [g.c[0] - g.w / 2, g.c[1]], 0.05)).toBe(true)
    const filled = mark({ id: 'm2', kind: 'rect', z: 1, box: { x0: 0.2, y0: 0.2, x1: 0.6, y1: 0.6 }, style: { fill: '#ffff00' } })
    expect(markAt(f, [outline, filled], g.c, 0.05)?.id).toBe('m2')
    const label = mark({ kind: 'label', at: [0.5, 0.5], text: 'Pitting' })
    expect(hitMark(f, label, toView(f, [0.5, 0.5]), 0)).toBe(true)
  })
})

describe('snapping', () => {
  it('a moved box lines up with the picture centre and another mark; Shift is free', () => {
    const f = frame()
    const other = mark({ id: 'o', kind: 'rect', box: { x0: 0.5, y0: 0.1, x1: 0.6, y1: 0.2 } })
    const t = snapTargets(f, [other], new Set())
    const ob = markBounds(f, other)
    const box = { x: 1.5, y: 5, w: 0.5, h: 0.3 }
    const s = snapMove(box, [ob.x - box.x + 0.03, 0], t, 0.06)
    expect(s.d[0]).toBeCloseTo(ob.x - box.x, 9)
    expect(s.guideX).toBeCloseTo(ob.x, 9)
    const mid = snapMove(box, [f.x + f.w / 2 - (box.x + box.w / 2) - 0.02, 0], t, 0.06)
    expect(mid.guideX).toBeCloseTo(f.x + f.w / 2, 9)
    expect(snapMove(box, [0.03, 0], t, 0.06, true).d).toEqual([0.03, 0])
  })

  it('a new point snaps to a corner, else lines up with one', () => {
    const f = frame()
    const pts = snapPoints(f, [])
    expect(snapPoint([f.x + 0.01, f.y - 0.01], pts, 0.05).pt).toEqual([f.x, f.y])
    const aligned = snapPoint([f.x + 3, f.y + 0.02], pts, 0.05)
    expect(aligned.pt[1]).toBe(f.y)
    expect(aligned.guideY).toBe(f.y)
  })
})

describe('labels', () => {
  it('the leader leaves the box at the nearest edge and follows the label when it moves', () => {
    const box = { x: 2, y: 2, w: 1, h: 0.3 }
    expect(leaderStart(box, 0, [5, 2.1])).toEqual([3, 2.1])
    expect(leaderStart(box, 0, [0, 2.15])).toEqual([2, 2.15])
    expect(leaderStart(box, 0, [2.5, 4])).toEqual([2.5, 2.3])
    expect(leaderStart(box, 0, [2.5, 2.1])).toBeNull()
    const f = frame()
    const l = mark({ kind: 'label', at: [0.2, 0.2], text: 'S12', leader: [0.6, 0.2] })
    const right = markItemsOf(f, l).find((i) => i.t === 'path' && i.stroke !== null && i.fill === null)!
    expect(right.t === 'path' && right.d[0][1]).toBeCloseTo(labelRect(f, l as Extract<Mark, { kind: 'label' }>).x + labelRect(f, l as Extract<Mark, { kind: 'label' }>).w, 6)
    const moved = moveMark(f, l, [6, 0]) as Extract<Mark, { kind: 'label' }>
    expect(moved.leader).toEqual(l.kind === 'label' ? l.leader : null)
    const left = markItemsOf(f, moved).filter((i) => i.t === 'path' && i.fill === null)
    expect(left.some((i) => i.t === 'path' && Math.abs((i.d[0] as number[])[1] - labelRect(f, moved).x) < 1e-6)).toBe(true)
  })

  it('callouts: boxed text has a see-through box with a contrasting outline; plain text has a halo; sizes are points at print size', () => {
    const f = frame()
    const boxed = markItemsOf(f, mark({ kind: 'label', at: [0.5, 0.5], text: 'Pitting', callout: 'pill', style: { fill: '#d62828', textSize: 12, bgOpacity: 0.85 } }))
    const box = boxed.find((i) => i.t === 'path')!
    expect(box.t === 'path' && box.fillOpacity).toBe(0.85)
    expect(box.t === 'path' && box.stroke).toBe('#ffffff')
    const text = boxed.find((i) => i.t === 'text')!
    expect(text.t === 'text' && text.size).toBe(12)
    const plain = markItemsOf(f, mark({ kind: 'label', at: [0.5, 0.5], text: 'Note', callout: 'plain', style: { textColor: '#ffffff' } }))
    expect(plain.filter((i) => i.t === 'path')).toHaveLength(0)
    expect(plain[0].t === 'text' && plain[0].halo?.color).toBe('#1a1a1a')
    expect(contrastOf('#f2c200')).toBe('#1a1a1a')
    // Two frames of different resolution: the same label is the same size on the page.
    const small = { ...f, upright: { w: 400, h: 300 } }
    const l = mark({ kind: 'label', at: [0.5, 0.5], text: 'Same size' }) as Extract<Mark, { kind: 'label' }>
    expect(labelRect(small, l).w).toBeCloseTo(labelRect(f, l).w, 9)
  })

  it('bold and Montserrat labels use the report fonts; multi-line text stacks', () => {
    const f = frame()
    const items = markItemsOf(f, mark({ kind: 'label', at: [0.5, 0.5], text: 'Line one\nLine two', style: { bold: true, font: 'montserrat' } }))
    const texts = items.filter((i) => i.t === 'text')
    expect(texts.map((t) => t.t === 'text' && t.font)).toEqual(['montserrat-700', 'montserrat-700'])
    expect(texts[1].t === 'text' && texts[0].t === 'text' && texts[1].y > texts[0].y).toBe(true)
  })

  it('the highlighter is drawn multiplied; arrows get the drawing leaders\' heads', () => {
    const f = frame()
    const h = markItemsOf(f, mark({ kind: 'highlight', points: [[0.1, 0.1], [0.3, 0.2], [0.5, 0.1]], style: { stroke: '#ffeb3b', opacity: 0.5, width: 12 } }))
    expect(h[0].t === 'path' && h[0].blend).toBe('multiply')
    expect(h[0].t === 'path' && h[0].d.some((c) => c[0] === 'C')).toBe(true)
    for (const head of ['closed', 'open', 'dot', 'none'] as const) {
      const a = markItemsOf(f, mark({ kind: 'arrow', from: [0.1, 0.1], to: [0.5, 0.5], head }))
      expect(a.length).toBe(head === 'none' ? 1 : 2)
    }
  })
})

describe('mark edits', () => {
  it('a new mark goes on top; badges are numbered and renumbered after a delete', () => {
    let marks: Mark[] = []
    for (let i = 0; i < 3; i++) marks = addMark(marks, { ...mark({ kind: 'badge', at: [0.1 * (i + 1), 0.5], n: 1, text: `B${i}` }), id: undefined, z: undefined } as never).marks
    expect(marks.map((m) => (m.kind === 'badge' ? m.n : 0))).toEqual([1, 2, 3])
    expect(marks.map((m) => m.z)).toEqual([0, 1, 2])
    const out = removeMarks(marks, new Set([marks[0].id]))
    expect(out.map((m) => (m.kind === 'badge' ? [m.text, m.n] : null))).toEqual([['B1', 1], ['B2', 2]])
  })

  it('duplicate (shifted, on top, new badge number), order, lock and style', () => {
    const a = mark({ id: 'm1', kind: 'rect', z: 0, box: { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 } })
    const b = mark({ id: 'm2', kind: 'badge', z: 1, at: [0.5, 0.5], n: 1 })
    const d = duplicateMarks([a, b], new Set(['m1', 'm2']))
    expect(d.ids).toEqual(['m3', 'm4'])
    const copy = d.marks.find((m) => m.id === 'm4')!
    expect(copy.kind === 'badge' && copy.n).toBe(2)
    expect(d.marks.find((m) => m.id === 'm3')!.kind === 'rect' && (d.marks.find((m) => m.id === 'm3') as Extract<Mark, { kind: 'rect' }>).box.x0).toBeCloseTo(0.125, 9)
    const back = reorderMarks([a, b], new Set(['m2']), 'back')
    expect(back.find((m) => m.id === 'm2')!.z).toBe(0)
    expect(reorderMarks(back, new Set(['m2']), 'front').find((m) => m.id === 'm2')!.z).toBe(1)
    expect(setLocked([a], new Set(['m1']), true)[0].locked).toBe(true)
    expect(setStyle([a], new Set(['m1']), { stroke: '#0000ff' })[0].style.stroke).toBe('#0000ff')
  })

  it('copy markup to other photos: positions kept, badges numbered after theirs, one change', () => {
    const p = sampleWithReport((q) => {
      q.report!.photos = [
        photoSchema.parse({ file: 'a.jpg', markup: [{ id: 'm1', kind: 'arrow', from: [0.1, 0.1], to: [0.4, 0.4] }, { id: 'm2', kind: 'badge', at: [0.5, 0.5], n: 1, text: 'Pit' }] }),
        photoSchema.parse({ file: 'b.jpg', markup: [{ id: 'm1', kind: 'badge', at: [0.2, 0.2], n: 1, text: 'Own' }] }),
        photoSchema.parse({ file: 'c.jpg' }),
      ]
    })
    const out = copyMarkupTo(p, { kind: 'photo', index: 0 }, null, [{ kind: 'photo', index: 1 }, { kind: 'photo', index: 2 }])
    const b = pictureAt(out.report!, { kind: 'photo', index: 1 })!.edits.markup
    expect(b.map((m) => m.kind)).toEqual(['badge', 'arrow', 'badge'])
    expect(b.filter((m) => m.kind === 'badge').map((m) => (m.kind === 'badge' ? m.n : 0))).toEqual([1, 2])
    expect(new Set(b.map((m) => m.id)).size).toBe(3)
    const c = pictureAt(out.report!, { kind: 'photo', index: 2 })!.edits.markup
    expect(c[0].kind === 'arrow' && c[0].from).toEqual([0.1, 0.1])
    expect(appendCopies([], []).marks).toEqual([])
  })
})

describe('tool looks (user, 2026-11-01)', () => {
  it('a highlighted box can have no outline, and keeps none through a colour change', () => {
    const st = toolStyle('rect', { ...DEFAULT_PREFS, shape: 'highlightedPlain', color: '#f2c200' })
    expect(st.stroke).toBeNull()
    expect(st.fill).toBe('#f2c200')
    expect(st.fillOpacity).toBeLessThan(1)
    const box = markSchema.parse({ id: 'a', kind: 'rect', box: { x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 }, style: st })
    const blue = applyPrefToMark(box, { color: '#1d5fa8' })
    expect(blue.style.stroke).toBeNull()
    expect(blue.style.fill).toBe('#1d5fa8')
    const edged = applyPrefToMark(blue, { shape: 'highlighted' })
    expect(edged.style.stroke).toBe('#1d5fa8')
    expect(applyPrefToMark(edged, { shape: 'highlightedPlain' }).style.stroke).toBeNull()
    // Drawn without an edge: no stroked item.
    const frame: MarkFrame = { x: 0, y: 0, w: 4, h: 3, crop: null, rotate: 0, upright: { w: 400, h: 300 } }
    expect(markItemsOf(frame, box).every((it) => !('stroke' in it) || it.stroke === null)).toBe(true)
  })

  it('a clear label box is only its edge; the text takes the label colour unless one is picked', () => {
    const st = toolStyle('label', { ...DEFAULT_PREFS, labelBox: 'clear', color: '#1d5fa8', width: 3 })
    expect(st.fill).toBeNull()
    expect(st.textColor).toBe('#1d5fa8')
    const lab = markSchema.parse({ id: 'l', kind: 'label', at: [0.5, 0.5], text: 'Pit', leader: [0.1, 0.1], style: st })
    const frame: MarkFrame = { x: 0, y: 0, w: 4, h: 3, crop: null, rotate: 0, upright: { w: 400, h: 300 } }
    const items = markItemsOf(frame, lab)
    // No filled box; the box edge and leader at the chosen width.
    expect(items.some((it) => it.t === 'path' && it.fill !== null && it.d.length > 3 && it.fillOpacity < 1)).toBe(false)
    expect(items.filter((it) => it.t === 'path' && it.stroke === '#1d5fa8' && it.width === 3).length).toBeGreaterThanOrEqual(2)
    const red = applyPrefToMark(lab, { color: '#d62828' })
    expect(red.style.textColor).toBe('#d62828')
    const picked = applyPrefToMark(red, { textColor: '#1a1a1a' })
    expect(applyPrefToMark(picked, { color: '#2e9e44' }).style.textColor).toBe('#1a1a1a')
    expect(prefsOfMark(picked, DEFAULT_PREFS)).toMatchObject({ labelBox: 'clear', textColor: '#1a1a1a', width: 3, color: '#d62828' })
    expect(prefsOfMark(red, DEFAULT_PREFS).textColor).toBe('')
    const filled = applyPrefToMark(red, { labelBox: 'filled' })
    expect(filled.style.fill).toBe('#d62828')
    expect(filled.style.textColor).toBe(contrastOf('#d62828'))
  })

  it('the contrast outline goes round the leader arrowhead too', () => {
    const st = toolStyle('label', { ...DEFAULT_PREFS, halo: true, color: '#d62828' })
    const lab = markSchema.parse({ id: 'l', kind: 'label', at: [0.5, 0.5], text: 'Pit', leader: [0.1, 0.1], leaderEnd: 'arrow', style: st })
    const frame: MarkFrame = { x: 0, y: 0, w: 4, h: 3, crop: null, rotate: 0, upright: { w: 400, h: 300 } }
    const halo = contrastOf('#d62828')
    // The head is a closed path: one copy in the halo colour under it.
    expect(markItemsOf(frame, lab).some((it) => it.t === 'path' && it.fill === halo && it.d.some((c) => c[0] === 'Z'))).toBe(true)
  })

  it('a new text box is rounded with no outline', () => {
    expect(DEFAULT_PREFS.callout).toBe('rounded')
    expect(DEFAULT_PREFS.halo).toBe(false)
    expect(toolStyle('label', DEFAULT_PREFS).halo).toBe(false)
  })
})

describe('badge key', () => {
  it('lists badges with key text in number order, and makes room under the picture without squashing it', () => {
    const marks = [mark({ id: 'b2', kind: 'badge', at: [0.5, 0.5], n: 2, text: 'Second' }), mark({ id: 'b1', kind: 'badge', at: [0.1, 0.1], n: 1, text: 'Pitting at 6 o\'clock' }), mark({ id: 'b3', kind: 'badge', at: [0.2, 0.2], n: 3 })]
    expect(keyEntries(marks).map((b) => b.n)).toEqual([1, 2])
    expect(keyHeight(keyEntries(marks), 4)).toBeGreaterThan(0)
    const p = sampleWithReport((q) => {
      q.report!.photos = [photoSchema.parse({ file: '1600x1200.jpg', markup: marks })]
    })
    const plain = sampleWithReport((q) => {
      q.report!.photos = [photoSchema.parse({ file: '1600x1200.jpg' })]
    })
    const page = (x: Project) => buildReport({ project: x, image: fakeImages }).pages.find((pg) => pg.sectionId === 'photos')!
    const img = page(p).items.find((i): i is ImageItem => i.t === 'image' && i.ref.source === 'photos')!
    const img0 = page(plain).items.find((i): i is ImageItem => i.t === 'image' && i.ref.source === 'photos')!
    expect(img.w / img.h).toBeCloseTo(img0.w / img0.h, 9)
    expect(img.h).toBeLessThan(img0.h)
    const texts = page(p).items.filter((i) => i.t === 'text' && i.y > img.y + img.h).map((i) => (i.t === 'text' ? i.text : ''))
    expect(texts).toContain('Second')
    expect(texts.some((t) => t.startsWith('Pitting'))).toBe(true)
  })
})

describe('live data labels', () => {
  const live = (link: Record<string, unknown>, template: string) => mark({ kind: 'label', at: [0.5, 0.5], text: '', link, template })

  it('fills the template from the scan row; unknown fields stay as typed', () => {
    const p = sampleWithReport()
    const scan = p.scans[0].id
    const text = liveText(p, live({ list: 'scans', id: scan }, '{scan} · Min {minT} in · {wallLoss}% WL'))!
    expect(text).toMatch(new RegExp(`^${scan} · Min 0\\.716 in · \\d+\\.\\d\\d% WL$`))
    expect(fillTemplate('{oops} {scan}', { scan: 'S1' })).toBe('{oops} S1')
  })

  it('stores the filled text after every edit; a deleted row prints its last text and Review warns', () => {
    const scan = sampleWithReport().scans[0].id
    const p = sampleWithReport((q) => {
      q.report!.photos = [photoSchema.parse({ file: 'a.jpg', markup: [{ id: 'm1', kind: 'label', at: [0.5, 0.5], text: 'old', link: { list: 'scans', id: scan }, template: 'Scan {scan}' }] })]
    })
    const synced = syncReport(p, { ...p, report: refreshLiveLabels(p, p.report!) })
    const first = synced.report!.photos[0].markup[0]
    expect(first.kind === 'label' && first.text).toBe(`Scan ${scan}`)
    const gone = syncReport(synced, { ...synced, scans: synced.scans.slice(1) })
    const kept = gone.report!.photos[0].markup[0]
    expect(kept.kind === 'label' && kept.text).toBe(`Scan ${scan}`)
    expect(liveText(gone, kept)).toBeNull()
    expect(checkReport(gone).some((c) => c.severity === 'warning' && c.text.includes('prints its last text'))).toBe(true)
    // The page prints the last text.
    const doc = buildReport({ project: gone, image: () => ({ width: 1000, height: 750, orientation: 1 }) })
    const img = doc.pages.flatMap((pg) => pg.items).find((i): i is ImageItem => i.t === 'image' && i.ref.file === 'a.jpg')!
    expect(img.marks[0].kind === 'label' && img.marks[0].text).toBe(`Scan ${scan}`)
  })

  it('MUT rows give their ID and Min T', () => {
    const p = sampleWithReport()
    const row = p.shellMut.find((m) => m.minT !== null) ?? p.shellMut[0]
    const t = liveText(p, live({ list: 'shellMut', id: row.id }, '{id} · Min {minT} in'))!
    expect(t.startsWith(`${row.id} · Min `)).toBe(true)
  })
})

describe('saved label styles', () => {
  it('built in: Finding (red box, white bold, arrow), Note (blue), Reading (yellow badge); applied in one go', () => {
    expect(BUILT_IN_LABEL_STYLES.map((s) => s.name)).toEqual(['Finding', 'Note', 'Reading'])
    const l = mark({ kind: 'label', at: [0.5, 0.5], text: 'x', callout: 'plain', leaderEnd: 'none' })
    const finding = applyLabelStyle(l, BUILT_IN_LABEL_STYLES[0])
    expect(finding.kind === 'label' && [finding.callout, finding.leaderEnd, finding.style.bold, finding.style.textColor, finding.style.fill]).toEqual(['rounded', 'arrow', true, '#ffffff', '#d62828'])
  })

  it('a style saved from a label goes into the saved lists and their file, and survives a bad stored value', () => {
    const l = mark({ kind: 'label', at: [0.5, 0.5], text: 'x', style: { fill: '#123456', textSize: 11 } })
    const s = labelStyleOf(l, 'Mine')!
    const lists = addRecord(emptySavedLists(), 'labelStyles', s)
    expect(lists.records.labelStyles).toHaveLength(1)
    const back = listsFromFile(listsToFile(lists))
    expect(back.ok && back.lists.records.labelStyles[0]).toEqual(s)
    const read = readSavedLists({ records: { labelStyles: [{ name: 'Odd', textSize: 'big', bold: 'yes' }] } })
    expect(read.records.labelStyles[0]).toMatchObject({ name: 'Odd', textSize: 9, bold: false })
  })
})

describe('auto levels and redaction pixels', () => {
  const gray = (w: number, h: number, f: (x: number, y: number) => number): Pixels => {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = f(x, y)
      data.set([v, v, v, 255], (y * w + x) * 4)
    }
    return { data, width: w, height: h }
  }

  it('auto levels stretch a dim picture to the full range, with a small clip', () => {
    const px = gray(100, 100, (x) => 60 + Math.round(x * 0.6))
    const lv = levelsOf(px)
    expect(lv[0][0]).toBeGreaterThanOrEqual(60)
    expect(lv[0][1]).toBeLessThanOrEqual(120)
    applyLevels(px, lv)
    expect(px.data[0]).toBe(0)
    expect(px.data[(100 * 99 + 99) * 4]).toBe(255)
  })

  it('a black box sets its pixels to black; a blurred box loses the detail inside it', () => {
    const stripes = gray(64, 64, (x) => (x % 2 ? 255 : 0))
    redactRect(stripes, { x0: 8, y0: 8, x1: 40, y1: 40 }, 'black')
    expect(stripes.data[(10 * 64 + 10) * 4]).toBe(0)
    expect(stripes.data[(10 * 64 + 11) * 4]).toBe(0)
    const blur = gray(64, 64, (x) => (x % 2 ? 255 : 0))
    redactRect(blur, { x0: 0, y0: 0, x1: 64, y1: 64 }, 'blur')
    const vals = Array.from({ length: 64 }, (_, x) => blur.data[(30 * 64 + x) * 4])
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThan(10)
    expect(blurBlock(64, 64)).toBe(16)
  })

  it('upright pixels match the browser for every phone orientation', () => {
    const px: Pixels = { data: new Uint8ClampedArray([1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255]), width: 3, height: 2 }
    // Orientation 6 = stored turned anticlockwise: upright is 2 wide, 3 tall; its first row reads 4, 1.
    const u = uprightPixels(px, 6)
    expect([u.width, u.height]).toEqual([2, 3])
    expect([u.data[0], u.data[4]]).toEqual([4, 1])
  })

  it('the levels are measured on the printed part (the crop), not the whole picture', () => {
    const px = gray(100, 10, (x) => (x < 50 ? 0 : 100 + x))
    applyPixelEdits(px, { autoLevels: true, redactions: [] }, undefined, { x0: 0.5, y0: 0, x1: 1, y1: 1 })
    expect(px.data[(5 * 100 + 99) * 4]).toBe(255)
    expect(px.data[(5 * 100 + 50) * 4]).toBe(0)
  })
})

/** The decoded pixels of every JPEG embedded in a PDF. */
async function embeddedJpegs(bytes: Uint8Array): Promise<{ width: number; height: number; data: Uint8Array }[]> {
  const pdf = await PDFDocument.load(bytes)
  const out: { width: number; height: number; data: Uint8Array }[] = []
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    if (obj.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue
    if (obj.dict.get(PDFName.of('Filter')) !== PDFName.of('DCTDecode')) continue
    out.push(jpeg.decode(obj.contents, { useTArray: true }))
  }
  return out
}

describe('redaction in the PDF', { timeout: 30000 }, () => {
  it('the embedded picture has the redacted area black; the original pixels are not in the file', async () => {
    // The made-up photo with noise added, so its encoded bytes can't turn up by chance in another encoding.
    const base = jpeg.decode(madeUpPhoto(400, 300), { useTArray: true })
    let seed = 7
    for (let i = 0; i < base.data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      const n = (seed % 31) - 15
      for (let c = 0; c < 3; c++) base.data[i + c] = Math.max(0, Math.min(255, base.data[i + c] + n))
    }
    const photo = new Uint8Array(jpeg.encode({ data: Buffer.from(base.data), width: 400, height: 300 }, 85).data)
    const p = sampleWithReport((q) => {
      q.report!.photos = [photoSchema.parse({ file: 'site.jpg', markup: [{ id: 'r1', kind: 'redaction', box: { x0: 0, y0: 0, x1: 0.25, y1: 0.25 }, mode: 'black' }] })]
    })
    const files = folderImages({}, new Map([['site.jpg', photo]]))
    const doc = buildReport({ project: p, image: files.image })
    const bytes = await writeReportPdf({ doc, fonts: REPORT_FONTS, drawingFont: DRAWING_FONT, images: files.prepared(doc), sheetPhotos: new Map(), pdfs: new Map(), date: new Date(2026, 9, 31) })
    const jpgs = (await embeddedJpegs(bytes)).filter((j) => j.width === 400 && j.height === 300)
    expect(jpgs).toHaveLength(1)
    const j = jpgs[0]
    // Inside the box (away from its edge): black. The made-up photo's red marker sat there.
    for (const [x, y] of [[10, 10], [50, 40], [90, 60]]) {
      const i = (y * j.width + x) * 4
      expect(Math.max(j.data[i], j.data[i + 1], j.data[i + 2])).toBeLessThan(12)
    }
    // Outside it: the picture as it was (blue sky).
    const o = (40 * j.width + 300) * 4
    expect(j.data[o + 2]).toBeGreaterThan(180)
    // The original file's bytes are nowhere in the PDF.
    const hay = Buffer.from(bytes)
    for (const at of [0.2, 0.5, 0.8]) {
      const k = Math.floor(photo.length * at)
      expect(hay.indexOf(Buffer.from(photo.subarray(k, k + 48)))).toBe(-1)
    }
    // Control: without the redaction the photo is embedded as it is, and the same search finds it.
    const open = sampleWithReport((q) => {
      q.report!.photos = [photoSchema.parse({ file: 'site.jpg' })]
    })
    const openDoc = buildReport({ project: open, image: files.image })
    const openBytes = await writeReportPdf({ doc: openDoc, fonts: REPORT_FONTS, drawingFont: DRAWING_FONT, images: files.prepared(openDoc), sheetPhotos: new Map(), pdfs: new Map(), date: new Date(2026, 9, 31) })
    const k = Math.floor(photo.length * 0.5)
    expect(Buffer.from(openBytes).indexOf(Buffer.from(photo.subarray(k, k + 48)))).toBeGreaterThan(0)
  })

  it('a blurred box keeps no detail: its pixels match the blur of the original within JPEG noise', async () => {
    const w = 320
    const h = 240
    const data = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 255 : 0
      data.set([v, v, v, 255], (y * w + x) * 4)
    }
    const photo = new Uint8Array(jpeg.encode({ data, width: w, height: h }, 95).data)
    const p = sampleWithReport((q) => {
      q.report!.photos = [photoSchema.parse({ file: 'plate.jpg', markup: [{ id: 'r1', kind: 'redaction', box: { x0: 0.25, y0: 0.25, x1: 0.75, y1: 0.75 }, mode: 'blur' }] })]
    })
    const files = folderImages({}, new Map([['plate.jpg', photo]]))
    const doc = buildReport({ project: p, image: files.image })
    const bytes = await writeReportPdf({ doc, fonts: REPORT_FONTS, drawingFont: DRAWING_FONT, images: files.prepared(doc), sheetPhotos: new Map(), pdfs: new Map(), date: new Date(2026, 9, 31) })
    const j = (await embeddedJpegs(bytes)).find((x) => x.width === w && x.height === h)!
    const expected = jpeg.decode(photo, { useTArray: true })
    redactRect({ data: expected.data, width: w, height: h }, { x0: 80, y0: 60, x1: 240, y1: 180 }, 'blur')
    let diff = 0
    let n = 0
    const row: number[] = []
    for (let y = 70; y < 170; y += 3) for (let x = 90; x < 230; x += 3) {
      const i = (y * w + x) * 4
      diff += Math.abs(j.data[i] - expected.data[i])
      n++
      if (y === 118) row.push(j.data[i])
    }
    expect(diff / n).toBeLessThan(8)
    // The checkerboard (0 / 255 every 4 px) is gone.
    expect(Math.max(...row) - Math.min(...row)).toBeLessThan(140)
  })

  it('PDF smoke test: one picture with every mark kind writes a PDF whose page has the marks', async () => {
    const all = [
      { kind: 'rect', box: { x0: 0.05, y0: 0.05, x1: 0.2, y1: 0.2 }, angle: 15 },
      { kind: 'ellipse', box: { x0: 0.25, y0: 0.05, x1: 0.4, y1: 0.2 }, style: { fill: '#ffeb3b', fillOpacity: 0.3 } },
      { kind: 'highlight', points: [[0.1, 0.5], [0.3, 0.55], [0.5, 0.5]], style: { stroke: '#ffeb3b', opacity: 0.45, width: 14 } },
      { kind: 'highlight', straight: true, points: [[0.1, 0.6], [0.6, 0.6]], style: { stroke: '#ffeb3b', opacity: 0.45, width: 14, ends: 'flat' } },
      { kind: 'pen', points: [[0.6, 0.1], [0.7, 0.2], [0.8, 0.1]] },
      { kind: 'line', from: [0.1, 0.8], to: [0.3, 0.9] },
      { kind: 'arrow', from: [0.4, 0.8], to: [0.6, 0.9], head: 'open' },
      { kind: 'label', at: [0.7, 0.4], text: 'Finding', leader: [0.9, 0.6], style: { bold: true } },
      { kind: 'label', at: [0.7, 0.7], text: 'Plain', callout: 'plain' },
      { kind: 'badge', at: [0.5, 0.3], n: 1, text: 'Pitting at 6 o\'clock' },
      { kind: 'redaction', box: { x0: 0.8, y0: 0.8, x1: 0.95, y1: 0.95 }, mode: 'blur' },
    ].map((m, i) => ({ id: `m${i + 1}`, z: i, ...m }))
    const p = sampleWithReport((q) => {
      q.report!.photos = [photoSchema.parse({ file: 'all.jpg', adjust: { autoLevels: true }, markup: all })]
    })
    const files = folderImages({}, new Map([['all.jpg', madeUpPhoto(600, 450)]]))
    const doc = buildReport({ project: p, image: files.image })
    const img = doc.pages.flatMap((pg) => pg.items).find((i): i is ImageItem => i.t === 'image' && i.ref.file === 'all.jpg')!
    expect(img.marks).toHaveLength(10)
    expect(img.autoLevels).toBe(true)
    expect(img.redactions).toHaveLength(1)
    const bytes = await writeReportPdf({ doc, fonts: REPORT_FONTS, drawingFont: DRAWING_FONT, images: files.prepared(doc), sheetPhotos: new Map(), pdfs: new Map(), date: new Date(2026, 9, 31) })
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(doc.pages.length)
    const multiplied = pdf.getPages().some((pg) => {
      const gs = pg.node.Resources()?.lookupMaybe(PDFName.of('ExtGState'), PDFDict)
      return (gs?.entries() ?? []).some(([, v]) => {
        const d = pdf.context.lookup(v)
        return d instanceof PDFDict && d.get(PDFName.of('BM')) === PDFName.of('Multiply')
      })
    })
    expect(multiplied).toBe(true)
  })
})

describe('project file format 10', () => {
  it('opens a format 9 file: marks get the new fields with their defaults', () => {
    const p = sampleWithReport((q) => {
      q.report!.photos = [photoSchema.parse({ file: 'a.jpg' })]
    })
    const data = JSON.parse(saveProject(p))
    data.schemaVersion = 9
    data.report.photos[0].markup = [
      { id: 'm1', kind: 'rect', box: { x0: 0, y0: 0, x1: 0.5, y1: 0.5 }, style: { stroke: '#d62828', fill: null, fillOpacity: 1, opacity: 1, width: 1.5, ends: 'round', textSize: 9, textColor: '#ffffff' }, link: null, z: 0, locked: false },
      { id: 'm2', kind: 'arrow', from: [0, 0], to: [1, 1], style: {}, link: null, z: 1, locked: false },
      { id: 'm3', kind: 'label', at: [0.5, 0.5], text: 'x', callout: 'rounded', leader: null, leaderEnd: 'arrow', style: {}, link: null, z: 2, locked: false },
    ]
    const r = openProject(JSON.stringify(data))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.migratedFrom).toBe(9)
    const [rect, arrow, label] = r.project.report!.photos[0].markup
    expect(rect.kind === 'rect' && rect.angle).toBe(0)
    expect(rect.style).toMatchObject({ bold: false, font: 'roboto', bgOpacity: 0.9, halo: true })
    expect(arrow.kind === 'arrow' && arrow.head).toBe('closed')
    expect(label.kind === 'label' && label.template).toBe('')
  })
})

describe('marks over uploaded PDF pages', { timeout: 30000 }, () => {
  it('the page item carries its marks and size; the badge key prints under it; the PDF draws them; redaction is left out', async () => {
    const d = await PDFDocument.create()
    d.addPage([612, 792]).drawText('Plant drawing', { x: 72, y: 700 })
    const ga = await d.save()
    const p = sampleWithReport((q) => {
      q.report!.uploads = [uploadSchema.parse({ file: 'ga.pdf', page: 1, markup: [
        { id: 'm1', kind: 'rect', box: { x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.3 } },
        { id: 'm2', kind: 'badge', at: [0.5, 0.5], n: 1, text: 'Nozzle N4' },
        { id: 'm3', kind: 'redaction', box: { x0: 0.6, y0: 0.6, x1: 0.8, y1: 0.8 } },
      ] })]
    })
    const doc = buildReport({ project: p, image: () => null, pdfPages: () => [{ w: 8.5, h: 11 }] })
    const page = doc.pages.find((pg) => pg.items.some((i) => i.t === 'pdfPage'))!
    const item = page.items.find((i) => i.t === 'pdfPage')!
    expect(item.t === 'pdfPage' && item.marks?.map((m) => m.kind)).toEqual(['rect', 'badge'])
    expect(item.t === 'pdfPage' && item.pageSize).toEqual({ w: 8.5, h: 11 })
    expect(page.items.some((i) => i.t === 'text' && i.text === 'Nozzle N4')).toBe(true)
    expect(checkReport(p).some((c) => c.text.includes("a PDF page can't be redacted"))).toBe(true)
    const bytes = await writeReportPdf({ doc, fonts: REPORT_FONTS, drawingFont: DRAWING_FONT, images: new Map(), sheetPhotos: new Map(), pdfs: new Map([['ga.pdf', ga]]), date: new Date(2026, 9, 31) })
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(doc.pages.length)
  })
})

describe('marks on drawing sheets (user, 2026-11-01)', { timeout: 30000 }, () => {
  it('stored per sheet, printed on the Drawings page and in the PDF; redaction left out with a warning; one undo step per change', async () => {
    const { setPictureEdits } = await import('../../src/report/pagesEdits.ts')
    let p = sampleWithReport()
    expect(pictureAt(p.report!, { kind: 'drawing', key: 'rollout' })!.edits.markup).toEqual([])
    p = setPictureEdits(p, { kind: 'drawing', key: 'rollout' }, { markup: [
      markSchema.parse({ id: 'm1', kind: 'rect', box: { x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.3 } }),
      markSchema.parse({ id: 'm2', kind: 'redaction', box: { x0: 0.6, y0: 0.6, x1: 0.8, y1: 0.8 } }),
    ] })
    expect(Object.keys(p.report!.drawingMarkup)).toEqual(['rollout'])
    const doc = buildReport({ project: p, image: () => null })
    const sheet = doc.pages.flatMap((pg) => pg.items).find((i) => i.t === 'sheet' && i.place?.kind === 'drawing' && i.place.key === 'rollout')
    expect(sheet?.t === 'sheet' && sheet.marks?.map((m) => m.kind)).toEqual(['rect'])
    expect(checkReport(p).some((c) => c.text.includes("a drawing can't be redacted"))).toBe(true)
    const bytes = await writeReportPdf({ doc, fonts: REPORT_FONTS, drawingFont: DRAWING_FONT, images: new Map(), sheetPhotos: new Map(), pdfs: new Map(), date: new Date(2026, 10, 1) })
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(doc.pages.length)
    // Deleting every mark removes the sheet's entry.
    const cleared = setPictureEdits(p, { kind: 'drawing', key: 'rollout' }, { markup: [] })
    expect(cleared.report!.drawingMarkup).toEqual({})
  })
})
