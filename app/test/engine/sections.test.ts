// Section sheets (Phase 3f-2): the plan (engine/sections.ts), the preview items and ABSECTIONSHEETS.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openProject } from '../../src/data/projectFile.ts'
import type { Project } from '../../src/data/schema.ts'
import { paperX, parseRanges, sectionPlan, sectionPlanItems, sheetScale, sheetViewport, snapCandidates, type SectionPlan } from '../../src/engine/sections.ts'
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
    expect(sectionPlan(golden('REF3'))).toBe('vertical')
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

  it('the same plan comes out in every orientation of REF1', () => {
    expect(ranges(plan(golden('REF1-CCW')))).toEqual(ranges(plan(golden('REF1'))))
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
  it('CW runs left to right, CCW right to left', () => {
    expect(paperX(10, 0, 100, 0.1, 'Horizontal CW')).toBeCloseTo(1)
    expect(paperX(10, 0, 100, 0.1, 'Horizontal CCW')).toBeCloseTo(9)
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

  it('sections off, or compat v5.0: nothing about the app sections is written', () => {
    const off = exportLsp({ ...p, settings: { ...p.settings, makeSectionSheets: false } }, OPTIONS)
    expect(off).not.toMatch(/ABSECTIONSHEETS|SL_APP_SECTIONS/)
    expect(exportLsp(p, { ...OPTIONS, compat: 'v5.0' })).not.toMatch(/ABSECTIONSHEETS|SL_APP_SECTIONS/)
  })
})
