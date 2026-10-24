// Section sheets (Phase 3f-2): the plan (engine/sections.ts), the preview items and ABSECTIONSHEETS.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openProject } from '../../src/data/projectFile.ts'
import type { Project } from '../../src/data/schema.ts'
import { paperAlong, parseRanges, sectionPlan, sectionPlanItems, sheetScale, sheetViewport, snapCandidates, type SectionPlan } from '../../src/engine/sections.ts'
import { sheetPages } from '../../src/engine/sheets.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'

const OPTIONS = { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5) }

function golden(job: string, settings: Partial<Project['settings']> = {}): Project {
  const r = openProject(readFileSync(join(import.meta.dirname, '..', 'golden', job, 'project.json'), 'utf8'))
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return { ...r.project, settings: { ...r.project.settings, makeSectionSheets: true, ...settings } }
}

const plan = (p: Project): SectionPlan => {
  const r = sectionPlan(p)
  if (typeof r === 'string') throw new Error(r)
  return r
}
const ranges = (pl: SectionPlan) => pl.sections.map((s) => [s.n, s.start, s.end, s.viewStart, s.viewEnd])

describe('when there is no plan', () => {
  it('is off by default, and says why otherwise', () => {
    expect(sectionPlan(sampleProject())).toBe('off')
    const p = golden('REF1')
    expect(sectionPlan({ ...p, vessel: { ...p.vessel, length: null } })).toBe('noSize')
  })
})

describe('golden jobs with section sheets on (suggested values)', () => {
  it('REF1: readable size gives 2 sections of 180 in, each sheet 6 in past its boundary', () => {
    const pl = plan(golden('REF1'))
    expect(ranges(pl)).toEqual([[1, 0, 180, 0, 186], [2, 180, 360, 174, 360]])
    expect(pl.sections.map((s) => [s.prev, s.next])).toEqual([[null, 2], [1, null]])
    expect(pl.overview).toBe(true)
    // The circumference sets the scale (the whole 302 in fits the sheet height).
    expect(pl.sections[0].scale).toBeCloseTo((7.5 * 0.92) / 302, 9)
    expect(pl.notes[0]).toContain('The whole circumference (302 in) has to fit')
  })

  it('REF2: 3 sections, the boundaries snapped to gaps between scans', () => {
    const pl = plan(golden('REF2'))
    expect(ranges(pl)).toEqual([[1, 0, 227.5, 0, 233.5], [2, 227.5, 453.5, 221.5, 459.5], [3, 453.5, 680, 447.5, 680]])
    const unsnapped = plan(golden('REF2', { sectionSnap: false }))
    expect(unsnapped.sections.map((s) => s.end)).toEqual([226.667, 453.333, 680])
  })

  it('the same plan comes out in CW and CCW', () => {
    expect(ranges(plan(golden('REF1-CCW')))).toEqual(ranges(plan(golden('REF1'))))
  })

  it('Vertical (REF3, 168 long, 458 around): the length runs up the sheet, the circumference across', () => {
    const pl = plan(golden('REF3'))
    expect(pl.sections.length).toBeGreaterThan(0)
    const s = pl.sections[0]
    // The circumference has to fit the sheet's width: 6.8 in for 458 in.
    expect(s.scale).toBeCloseTo(Math.min((10 * 0.68) / 458, (7.5 * 0.86) / (s.viewEnd - s.viewStart)), 9)
    const vp = sheetViewport(s.viewEnd - s.viewStart, 458, 'Vertical')
    expect(vp.w).toBeCloseTo(458 * vp.scale, 9)
    expect(vp.h).toBeCloseTo((s.viewEnd - s.viewStart) * vp.scale, 9)
  })
})

describe('readable size and the text sizes', () => {
  it('bigger scan labels (Drawing step) mean fewer, longer sections for the same printed size', () => {
    const base = golden('REF2', { sectionMinLabel: 0.03 })
    const bigger = golden('REF2', { sectionMinLabel: 0.03, scanTextSize: 'Scale', scanTextScale: 2 })
    expect(plan(bigger).sections.length).toBeLessThan(plan(base).sections.length)
    expect(plan(bigger).sections[0].smallestLabel!).toBeGreaterThanOrEqual(0.03 - 1e-9)
  })
})

describe('what is on a sheet (engine/sheets.ts)', () => {
  const texts = (job: string, i: number) =>
    sheetPages(golden(job), plan(golden(job)))[i].shapes.filter((s) => s.t === 'text').map((s) => (s as { text: string }).text)

  it('an overview, then each section with its rulers, references, title panel and match lines', () => {
    const pages = sheetPages(golden('REF1'), plan(golden('REF1')))
    expect(pages.map((pg) => pg.title)).toEqual(['OVERVIEW', 'SECTION 1 OF 2', 'SECTION 2 OF 2'])
    const t = texts('REF1', 1)
    // X ruler 0" .. 302" every 20 in, Y ruler from the sheet's start, the axis labels, references, title, legend.
    expect(t).toContain('0"')
    // 300" would touch the end number 302": its tick stays, its number is left out.
    expect(t).not.toContain('300"')
    expect(t).toContain('280"')
    expect(t).toContain('302"')
    expect(t).toContain('186"')
    expect(t).toContain('LEGEND')
    expect(t).toContain('MATCH LINE - SEE SECTION 2')
    expect(t).toContain('SECTION 1 OF 2')
    expect(t.some((x) => x.startsWith('Total Scans:'))).toBe(true)
    expect(pages[0].shapes.filter((s) => s.layer === 'REPORT_SECTION_BOX' && s.t === 'rect')).toHaveLength(2)
  })

  it('the rulers follow SECTIONPAGES: X ruler left of the viewport, Y ruler below it', () => {
    const p = golden('REF1')
    const pg = sheetPages(p, plan(p))[1]
    const off = p.settings.rulerOffset * pg.vp.scale
    const xRuler = pg.shapes.find((s) => s.t === 'line' && s.layer === 'REPORT_X_RULER')!
    const yRuler = pg.shapes.find((s) => s.t === 'line' && s.layer === 'REPORT_Y_RULER')!
    expect(xRuler).toMatchObject({ x1: pg.vp.left - off, x2: pg.vp.left - off })
    expect(yRuler).toMatchObject({ y1: pg.vp.bottom - off, y2: pg.vp.bottom - off })
  })

  it('the title and legend panel sits just right of the drawing, and the two are centred on the sheet', () => {
    // A short section (manual 0-60) leaves a narrow viewport: the panel follows it instead of staying at the far right.
    const p = golden('REF1', { sectionSplit: 'Manual', sectionRanges: '0-60', sectionOverview: false })
    const pg = sheetPages(p, plan(p))[0]
    const legend = pg.shapes.find((s) => s.t === 'text' && s.text === 'LEGEND') as { x: number }
    const right = pg.vp.left + pg.vp.w
    expect(legend.x).toBeGreaterThan(right)
    expect(legend.x - right).toBeLessThan(2)
    expect(legend.x).toBeLessThan(10 * 0.865)
    // Left of the viewport and right of the panel are about the same.
    const panelRight = legend.x + 1.45
    expect(Math.abs(pg.vp.left - (10 - panelRight))).toBeLessThan(1.5)
  })

  it('Vertical sheets get the same parts, turned', () => {
    const pages = sheetPages(golden('REF3'), plan(golden('REF3')))
    const t = pages[pages.length - 1].shapes.filter((s) => s.t === 'text').map((s) => (s as { text: string }).text)
    expect(t).toContain('458"')
    expect(t).toContain('LEGEND')
  })
})

describe('ways to split', () => {
  it('a number of equal sections', () => {
    const pl = plan(golden('REF1', { sectionSplit: 'Number of sections', sectionCount: 3, sectionSnap: false, sectionOverlap: 0 }))
    expect(ranges(pl)).toEqual([[1, 0, 120, 0, 120], [2, 120, 240, 120, 240], [3, 240, 360, 240, 360]])
  })

  it('manual ranges, typed any way a length can be typed', () => {
    expect(parseRanges('0-180, 180-360')).toEqual({ ranges: [[0, 180], [180, 360]], problems: [] })
    expect(parseRanges('12-1/2 - 24; 10\' 6" to 30\'')).toEqual({ ranges: [[12.5, 24], [126, 360]], problems: [] })
    expect(parseRanges('abc, 50-20').problems).toEqual(['"abc" is not a range like 0-180.', '"50-20": the end must be after the start.'])
    const pl = plan(golden('REF1', { sectionSplit: 'Manual', sectionRanges: '0-100, 100-400', sectionOverlap: 0 }))
    expect(ranges(pl)).toEqual([[1, 0, 100, 0, 100]])
    expect(pl.problems).toEqual(['100-400 is outside the shell (0 to 360); left out.'])
  })

  it('snaps to circ welds and to the middle of gaps between scans', () => {
    const p = sampleProject()
    const c = snapCandidates(p)
    for (const w of p.circWelds.filter((x) => x.include && x.y! > 0 && x.y! < p.vessel.length!)) expect(c).toContain(w.y)
  })

  it('leaves out sections with nothing on them and numbers the rest in order', () => {
    const p = sampleProject() // scans 0..96 along the 240 in shell
    const s: Partial<Project['settings']> = { makeSectionSheets: true, sectionSplit: 'Number of sections', sectionCount: 8, sectionSnap: false, sectionOverlap: 0 }
    const only = (q: Project): Project => ({ ...q, shellNozzles: [], shellMut: [], settings: { ...q.settings, ...s } })
    const pl = plan(only(p))
    expect(pl.sections.map((x) => [x.n, x.start, x.end])).toEqual([[1, 0, 30], [2, 30, 60], [3, 60, 90], [4, 90, 120]])
    expect(pl.skipped).toBe(4)
    const all = plan({ ...only(p), settings: { ...only(p).settings, sectionSkipEmpty: false } })
    expect(all.sections).toHaveLength(8)
  })
})

describe('sheet geometry (as SECTIONPAGES)', () => {
  it('the section gets 68% of the 10 x 7.5 in area, centred', () => {
    const vp = sheetViewport(186, 302)
    expect(vp.scale).toBeCloseTo(sheetScale(186, 302), 12)
    expect(vp.h).toBeCloseTo(7.5 * 0.92, 9)
    expect(vp.left).toBeCloseTo(10 * 0.13 + (10 * 0.68 - vp.w) / 2, 9)
  })
  it('CW runs left to right, CCW right to left, Vertical bottom to top', () => {
    expect(paperAlong(10, 0, 100, 0.1, 'Horizontal CW')).toBeCloseTo(1)
    expect(paperAlong(10, 0, 100, 0.1, 'Horizontal CCW')).toBeCloseTo(9)
    expect(paperAlong(10, 0, 100, 0.1, 'Vertical')).toBeCloseTo(1)
  })
})

describe('preview and .lsp', () => {
  const p = golden('REF1')
  const pl = plan(p)

  it('the preview draws each section across the shell with its number', () => {
    const items = sectionPlanItems(p, pl)
    expect(items.map((i) => i.key)).toEqual(['section:1', 'section:2'])
    expect(items[0].shapes[0]).toEqual({ t: 'rect', x: 0, y: 0, w: 302, h: 180, layer: 'SECTION_PLAN' })
  })

  it('the .lsp holds exactly the plan and ABSECTIONSHEETS', () => {
    const out = exportLsp(p, OPTIONS)
    expect(out).toContain('(setq SL_APP_SECTIONS (list (list 1 0. 180. 0. 186. nil 2) (list 2 180. 360. 174. 360. 1 nil)))')
    expect(out).toContain('(setq SL_APP_SECTION_COUNT 2)')
    expect(out).toContain('(setq SL_APP_SECTION_OVERVIEW T)')
    expect(out).toContain('(defun c:ABSECTIONSHEETS (')
    // No section-length prompt; the viewport is asked for only when the sheet has more than one.
    const cmd = out.slice(out.indexOf('(defun c:ABSECTIONSHEETS ('))
    expect(cmd.slice(0, cmd.indexOf('\r\n)\r\n'))).not.toContain('getreal')
    // SECTIONPAGES stays as the backup.
    expect(out).toContain('(defun c:SECTIONPAGES (')
  })

  it('Vertical: the sheets are the app\'s, the .lsp gets no ABSECTIONSHEETS', () => {
    expect(exportLsp(golden('REF3'), OPTIONS)).not.toMatch(/ABSECTIONSHEETS|SL_APP_SECTIONS/)
  })

  it('sections off, or compat v5.0: nothing about the app sections is written', () => {
    const off = exportLsp({ ...p, settings: { ...p.settings, makeSectionSheets: false } }, OPTIONS)
    expect(off).not.toMatch(/ABSECTIONSHEETS|SL_APP_SECTIONS/)
    expect(exportLsp(p, { ...OPTIONS, compat: 'v5.0' })).not.toMatch(/ABSECTIONSHEETS|SL_APP_SECTIONS/)
  })
})
