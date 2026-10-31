import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../../src/data/checks.ts'
import { photoLink } from '../../src/data/photos.ts'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { sectionPlan } from '../../src/engine/sections.ts'
import { circumference, nozzlePieces, scanPieces } from '../../src/engine/wrap.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'
import { usesSamplePhotos } from '../../src/ui/samplePhotos.ts'

// The sample job is what a new inspector tries first: it shows every feature (Phase 6).
describe('sample job', () => {
  const p = sampleProject()
  const C = circumference(p)

  it('has scans, each linked to a photo that ships with the app (public/sample-photos)', () => {
    expect(p.scans.length).toBeGreaterThan(0)
    for (const s of p.scans) {
      const link = photoLink(p, s.id)
      expect(link?.include, s.id).toBe(true)
      expect(existsSync(new URL(`../../public/sample-photos/${link!.imageFile}`, import.meta.url)), s.id).toBe(true)
    }
  })

  it('names no client, site or person and no folder on a computer', () => {
    expect(p.project.client).toBe('Sample Client')
    expect(p.project.unit).toBe('Sample Unit')
    expect(p.project.inspector).toBe('A. Inspector')
    expect(JSON.stringify(p)).not.toMatch(/[A-Za-z]:\\\\|Users|Desktop/)
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

  it('has a nozzle or a scan that wraps across the seam', () => {
    const wraps = p.shellNozzles.some((n) => nozzlePieces(n, C).length > 1) || p.scans.some((s) => scanPieces(s, C).length > 1)
    expect(wraps).toBe(true)
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

describe('a job saved from the sample', () => {
  it('keeps the built-in photos; a changed scan or photo name, or a real job, does not', () => {
    const p = sampleProject()
    expect(usesSamplePhotos({ ...p, jobId: 'another-id' })).toBe(true)
    expect(usesSamplePhotos({ ...p, scans: p.scans.map((s, i) => (i === 0 ? { ...s, xStart: (s.xStart ?? 0) + 1 } : s)) })).toBe(false)
    expect(usesSamplePhotos({ ...p, scanImages: p.scanImages.map((l, i) => (i === 0 ? { ...l, imageFile: 'mine.jpg' } : l)) })).toBe(false)
    expect(usesSamplePhotos({ ...p, scanImages: [] })).toBe(false)
  })
})
