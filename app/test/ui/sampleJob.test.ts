import { describe, expect, it } from 'vitest'
import { checkProject } from '../../src/data/checks.ts'
import { photoLink } from '../../src/data/photos.ts'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { sectionPlan } from '../../src/engine/sections.ts'
import { circumference, nozzlePieces, scanPieces } from '../../src/engine/wrap.ts'
import { sampleProject, samplePhotoName } from '../../src/ui/sampleJob.ts'

// The sample job is what a new inspector tries first: it shows every feature (Phase 6).
describe('sample job', () => {
  const p = sampleProject()
  const C = circumference(p)

  it('has scans, each linked to one of the made-up photos', () => {
    expect(p.scans.length).toBeGreaterThan(0)
    const names = p.scans.map((_, i) => samplePhotoName(i + 1))
    for (const s of p.scans) {
      const link = photoLink(p, s.id)
      expect(link?.include, s.id).toBe(true)
      expect(names, s.id).toContain(link?.imageFile)
    }
  })

  it('has shell nozzles, and nozzles on both heads, both heads drawn', () => {
    expect(p.shellNozzles.length).toBeGreaterThan(0)
    expect(new Set(p.headNozzles.map((n) => n.head))).toEqual(new Set(['HEAD 1', 'HEAD 2']))
    expect(p.settings.headViewMode).toBe('BOTH')
  })

  it('has a label moved by hand that the drawing uses', () => {
    expect(p.labelOverrides.length).toBeGreaterThan(0)
    expect(buildDrawing(p).labels.some((l) => l.moved)).toBe(true)
  })

  it('has a nozzle and a scan that wrap across the seam', () => {
    expect(p.shellNozzles.some((n) => nozzlePieces(n, C).length > 1)).toBe(true)
    expect(p.scans.some((s) => scanPieces(s, C).length > 1)).toBe(true)
  })

  it('has MUT areas on the shell and on a head', () => {
    expect(p.shellMut.some((m) => m.area)).toBe(true)
    expect(p.headMut.some((m) => m.area)).toBe(true)
  })

  it('has section sheets off, ready to switch on (more than one sheet)', () => {
    expect(p.settings.makeSectionSheets).toBe(false)
    const plan = sectionPlan({ ...p, settings: { ...p.settings, makeSectionSheets: true } })
    expect(plan === 'off' || typeof plan === 'string' ? 0 : plan.sections.length).toBeGreaterThan(1)
  })

  it('opens with nothing to fix and no warnings', () => {
    expect(checkProject(p).map((c) => `${c.severity}: ${c.text}`)).toEqual([])
  })
})
