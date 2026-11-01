// The markup editor rendered (R5): toolbar and stage from the host-agnostic hook, in a made-up app and report context.
// The browser can't be clicked through here; the pointer and key logic lives in pure functions tested in
// test/report/markup.test.ts, and these check what the editor shows.
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Project } from '../../src/data/schema.ts'
import { applyPrefToMark, DEFAULT_PREFS, editorFrame, findPrinted, markFromDrag, markFromStroke, toolStyle } from '../../src/report/markTools.ts'
import { buildReport } from '../../src/report/pages/index.ts'
import { emptySavedLists } from '../../src/report/savedLists.ts'
import { markSchema, photoSchema, type Mark } from '../../src/report/schema.ts'
import { AppContext, type AppApi } from '../../src/ui/appContext.ts'
import { MarkupStage } from '../../src/ui/report/markup/MarkupStage.tsx'
import { MarkupPanel, MarkupToolbar } from '../../src/ui/report/markup/MarkupToolbar.tsx'
import { useMarkupEditor } from '../../src/ui/report/markup/useMarkupEditor.ts'
import { ReportContext, type ReportShared } from '../../src/ui/report/reportContext.ts'
import { fakeImages, sampleWithReport } from '../report/pages/fixture.ts'

function withJob(p: Project, child: ReactNode): ReactNode {
  const app = {
    state: { job: { history: { present: p, past: [], future: [] } } },
    dispatch: () => {}, edit: () => {}, undo: () => {}, redo: () => {}, canUndo: false, canRedo: false, undoLabel: null, redoLabel: null,
  } as unknown as AppApi
  const report = { savedLists: emptySavedLists(), changeLists: () => {}, pages: { doc: null, pictures: new Map(), sources: null, retry: () => {}, pdfInfo: new Map() } } as unknown as ReportShared
  return createElement(AppContext.Provider, { value: app }, createElement(ReportContext.Provider, { value: report }, child))
}

const frame = editorFrame({ w: 4000, h: 3000 }, { crop: null, rotate: 0 }, null)

function Editor({ allowRedaction }: { allowRedaction: boolean }) {
  const ed = useMarkupEditor({ at: { kind: 'photo', index: 0 }, frame, ppi: 100, allowRedaction })
  return createElement('div', null, createElement(MarkupToolbar, { ed, showCrop: true, onCrop: () => {} }), createElement(MarkupStage, { ed, picture: { href: 'blob:x' }, label: 'photo 1' }), createElement(MarkupPanel, { ed, original: false, setOriginal: () => {} }))
}

const job = (markup: unknown[]) => sampleWithReport((q) => {
  q.report!.photos = [photoSchema.parse({ file: '1600x1200.jpg', markup })]
})

describe('markup editor (rendered)', () => {
  it('shows every tool with its name and shortcut, and the picture with its marks at print size', () => {
    const html = renderToStaticMarkup(withJob(job([{ id: 'm1', kind: 'label', at: [0.5, 0.5], text: 'Pitting', style: { textSize: 12 } }]), createElement(Editor, { allowRedaction: true })))
    for (const name of ['Select', 'Box', 'Ellipse', 'Highlighter', 'Straight highlight', 'Pen', 'Line', 'Arrow', 'Label', 'Badge', 'Redact', 'Crop']) expect(html).toContain(`<span>${name}</span>`)
    expect(html).toContain('(R)')
    expect(html).toContain('Pitting')
    // 12 pt at print size: 12/72 of a view inch.
    expect(html).toContain(`font-size="${12 / 72}"`)
    expect(html).toContain('href="blob:x"')
    // 6.5 in wide at 100 px per inch.
    expect(html).toContain('width="650"')
  })

  it('a PDF page offers no redaction and says why', () => {
    const html = renderToStaticMarkup(withJob(job([]), createElement(Editor, { allowRedaction: false })))
    expect(html).not.toContain('<span>Redact</span>')
    expect(html).toContain('Redaction: pictures only, not PDF pages')
  })

  it('a redaction shows as a stand-in on the stage (the PDF removes the pixels)', () => {
    const html = renderToStaticMarkup(withJob(job([{ id: 'r', kind: 'redaction', box: { x0: 0.1, y0: 0.1, x1: 0.3, y1: 0.3 }, mode: 'black' }]), createElement(Editor, { allowRedaction: true })))
    expect(html).toContain('fill="#000"')
  })
})

describe('markup tools: what each tool makes', () => {
  const f = frame
  const P = (x: number, y: number): [number, number] => [x * f.w, y * f.h]

  it('box, ellipse, redaction, lines and the straight highlight from a drag; nothing from a click', () => {
    const box = markFromDrag('rect', { ...DEFAULT_PREFS, shape: 'highlighted', color: '#f2c200' }, f, P(0.1, 0.1), P(0.3, 0.4), false)!
    expect(box).toMatchObject({ kind: 'rect', angle: 0 })
    expect(box.style).toMatchObject({ stroke: '#f2c200', fill: '#f2c200', fillOpacity: 0.25 })
    const sq = markFromDrag('ellipse', DEFAULT_PREFS, f, P(0.1, 0.1), P(0.3, 0.2), true)! as Extract<Mark, { kind: 'ellipse' }>
    expect((sq.box.x1 - sq.box.x0) * 4000).toBeCloseTo((sq.box.y1 - sq.box.y0) * 3000, 6)
    expect(markFromDrag('redaction', { ...DEFAULT_PREFS, redact: 'blur' }, f, P(0.1, 0.1), P(0.2, 0.2), false)).toMatchObject({ kind: 'redaction', mode: 'blur' })
    expect(markFromDrag('arrow', { ...DEFAULT_PREFS, head: 'dot' }, f, P(0.1, 0.1), P(0.5, 0.12), true)).toMatchObject({ kind: 'arrow', head: 'dot', from: [0.1, 0.1] })
    const hl = markFromDrag('highlightLine', DEFAULT_PREFS, f, P(0.1, 0.5), P(0.6, 0.53), true)! as Extract<Mark, { kind: 'highlight' }>
    expect(hl.straight).toBe(true)
    expect(hl.points[1][1]).toBeCloseTo(0.5, 9)
    expect(hl.style).toMatchObject({ opacity: 0.5, width: 12, ends: 'flat' })
    expect(markFromDrag('rect', DEFAULT_PREFS, f, P(0.1, 0.1), P(0.1001, 0.1), false)).toBeNull()
  })

  it('labels: a click places one, a drag gives it a leader; a badge from a click; a style applies on placing', () => {
    const click = markFromDrag('label', DEFAULT_PREFS, f, P(0.4, 0.4), P(0.4, 0.4), false)!
    expect(click).toMatchObject({ kind: 'label', leader: null, text: 'Label' })
    const led = markFromDrag('label', DEFAULT_PREFS, f, P(0.2, 0.2), P(0.6, 0.3), false)! as Extract<Mark, { kind: 'label' }>
    expect(led.leader![0]).toBeCloseTo(0.2, 9)
    expect(led.at[0]).toBeCloseTo(0.6, 9)
    expect(markFromDrag('badge', DEFAULT_PREFS, f, P(0.5, 0.5), P(0.5, 0.5), false)).toMatchObject({ kind: 'badge', text: '' })
    const styled = markFromDrag('label', DEFAULT_PREFS, f, P(0.4, 0.4), P(0.4, 0.4), false, { name: 'Note', kind: 'label', callout: 'pill', leaderEnd: 'dot', stroke: '#1d5fa8', fill: '#1d5fa8', textColor: '#ffffff', textSize: 10, width: 1, bold: false, font: 'roboto', bgOpacity: 0.9, halo: true })!
    expect(styled).toMatchObject({ callout: 'pill', leaderEnd: 'dot' })
  })

  it('pen and freehand highlighter from a stroke', () => {
    const pts: [number, number][] = Array.from({ length: 30 }, (_, i) => [1 + i * 0.05, 2 + Math.sin(i / 4) * 0.3])
    expect(markFromStroke('pen', DEFAULT_PREFS, f, pts)).toMatchObject({ kind: 'pen' })
    expect(markFromStroke('highlight', DEFAULT_PREFS, f, pts)).toMatchObject({ kind: 'highlight', straight: false })
    expect(markFromStroke('pen', DEFAULT_PREFS, f, [[1, 1], [1.001, 1]])).toBeNull()
  })

  it('a toolbar setting applies to a selected mark where it means something', () => {
    const box = markSchema.parse({ id: 'm1', kind: 'rect', box: { x0: 0, y0: 0, x1: 0.5, y1: 0.5 }, style: toolStyle('rect', { ...DEFAULT_PREFS, shape: 'filled' }) })
    expect(applyPrefToMark(box, { color: '#2e9e44' }).style).toMatchObject({ stroke: '#2e9e44', fill: '#2e9e44' })
    expect(applyPrefToMark(box, { shape: 'outline' }).style.fill).toBeNull()
    expect(applyPrefToMark(box, { head: 'open' })).toBe(box)
    const label = markSchema.parse({ id: 'm2', kind: 'label', at: [0.5, 0.5], text: 'x', style: { fill: '#f2c200', stroke: '#f2c200', textColor: '#1a1a1a' } })
    const plain = applyPrefToMark(label, { callout: 'plain' })
    expect(plain.kind === 'label' && plain.callout).toBe('plain')
    expect(plain.style.textColor).toBe('#f2c200')
  })

  it('the editor shows a picture at the size it prints in its slot', () => {
    const p = job([])
    const doc = buildReport({ project: p, image: fakeImages })
    const printed = findPrinted(doc, { kind: 'photo', index: 0 })!
    expect(printed.frame.w).toBeGreaterThan(5)
    const fr = editorFrame({ w: 1600, h: 1200 }, { crop: null, rotate: 90 }, printed)
    expect(fr.w).toBe(printed.frame.w)
    expect(fr.h).toBeCloseTo(fr.w * (1600 / 1200), 9)
    expect(findPrinted(doc, { kind: 'photo', index: 5 })).toBeNull()
  })
})
