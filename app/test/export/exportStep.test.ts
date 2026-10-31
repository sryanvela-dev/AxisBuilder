// Phase 4a: the Review list, refusing on errors, file names, out-of-date processed images and the .lsp
// written by the Export step (images found next to the saved drawing, ANSI bytes).

import { describe, expect, it } from 'vitest'
import { checkProject } from '../../src/data/checks.ts'
import type { Project } from '../../src/data/schema.ts'
import { cleanFileName, exportBaseName, sheetImageNames } from '../../src/export/files.ts'
import { planProcessing, pngSize, staleJobs } from '../../src/export/images/process.ts'
import { ExportBlockedError, exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { lspBytes } from '../../src/export/lsp/lspBytes.ts'
import { initialSession, sessionReducer, type Job } from '../../src/state/session.ts'
import { reviewList, stepStatuses } from '../../src/state/steps.ts'
// The sample as it was when these tests were written (test/fixtures/olderSample.ts).
import { olderSample as sampleProject } from '../fixtures/olderSample.ts'

const jobOf = (p: Project): Job => sessionReducer(initialSession, { type: 'openJob', project: p, source: 'sample' }).job!

describe('Review list', () => {
  it('lists every check: errors first (they block export), warnings after, grouped by step', () => {
    const p0 = sampleProject()
    // An error (missing diameter), and a warning (an item past the shell length).
    const p: Project = { ...p0, shellNozzles: [{ ...p0.shellNozzles[0], diameter: null }, ...p0.shellNozzles.slice(1)], circWelds: [{ ...p0.circWelds[0], y: 999 }] }
    const status = stepStatuses(jobOf(p))
    const { errors, warnings } = reviewList(status.review)
    const checks = checkProject(p)
    const flat = (g: typeof errors) => g.flatMap((x) => x.issues.map((i) => i.check))
    expect(flat(errors)).toEqual(expect.arrayContaining(checks.filter((c) => c.severity === 'error')))
    expect(flat(errors).every((c) => c?.severity === 'error')).toBe(true)
    expect(flat(warnings).filter(Boolean)).toEqual(expect.arrayContaining(checks.filter((c) => c.severity === 'warning')))
    // In step order (the sample's photos are not chosen: Images errors too).
    expect(errors.map((g) => g.step)).toEqual(['images', 'fieldData'])
    // The export refuses while there are errors.
    expect(status.export.state).toBe('attention')
    expect(() => exportLsp(p)).toThrow(ExportBlockedError)
  })

  it('is empty for a job with nothing open', () => {
    const p = sampleProject()
    const { errors } = reviewList(stepStatuses(jobOf(p)).review)
    expect(errors).toEqual(errors.filter((g) => g.step === 'images')) // the sample has no photo folder: only photo errors
  })
})

describe('file names', () => {
  it('follow the job name; report images by sheet', () => {
    expect(exportBaseName('V-101 "East" / Drum')).toBe('V-101 _East_ _ Drum - AUT Coverage')
    expect(cleanFileName('  name.  ')).toBe('name')
    expect(cleanFileName('')).toBe('Job')
    expect(sheetImageNames('Job - AUT Coverage', [{ kind: 'main', section: null }])).toEqual(['Job - AUT Coverage.jpg'])
    expect(sheetImageNames('J', [{ kind: 'section', section: { n: 12 } }, { kind: 'section', section: { n: 13 } }])).toEqual(['J - Section 12.jpg', 'J - Section 13.jpg'])
  })
})

describe('processed images before the .lsp', () => {
  const png = (w: number, h: number) => {
    const b = new Uint8Array(24)
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    const v = new DataView(b.buffer)
    v.setUint32(16, w)
    v.setUint32(20, h)
    return b
  }
  it('reads a PNG size from its header', () => {
    expect(pngSize(png(1915, 3830))).toEqual({ width: 1915, height: 3830 })
    expect(pngSize(new Uint8Array(24))).toBeNull()
  })
  it('only missing, older-than-the-photo or wrong-shape images are made again', () => {
    const p = sampleProject() // scans 24 x 48
    const plan = planProcessing(p, p.scanImages.map((l) => l.imageFile))
    const names = plan.jobs.map((j) => j.outName.toLowerCase())
    const existing = new Map([
      [names[0], { lastModified: 2000, width: 1000, height: 2000 }], // up to date
      [names[1], { lastModified: 500, width: 1000, height: 2000 }], // older than its photo
      [names[2], { lastModified: 2000, width: 1000, height: 1000 }], // wrong shape
    ])
    const photoTimes = new Map(plan.jobs.map((j) => [j.photoName, 1000]))
    expect(staleJobs(plan, existing, photoTimes).map((j) => j.outName)).toEqual(plan.jobs.slice(1).map((j) => j.outName))
  })
})

describe('the .lsp from the Export step', () => {
  const p = sampleProject()
  const out = exportLsp(p, { relativeImages: { folderName: 'Processed_Images' } })

  it('has no folder in the image paths: they are found next to the saved drawing, or picked once', () => {
    expect(out).toContain('(defun SL_AppImage (name')
    expect(out).toMatch(/\(SL_AppInsertImage [\d.]+ [\d.]+ [\d.]+ [\d.]+ "SCAN_1_FIT\.png"\)/)
    expect(out).toContain('"Processed_Images/" name')
    expect(out).not.toMatch(/\(SL_InsertFitImage [\d.]+ /)
    // compat v5.0 ignores it.
    expect(exportLsp(p, { compat: 'v5.0', relativeImages: { folderName: 'Processed_Images' } })).not.toContain('SL_AppImage')
  })

  it('is written as ANSI bytes, as v5.0 does (the degree sign is the byte B0)', () => {
    expect([...lspBytes('A°€✓')]).toEqual([0x41, 0xb0, 0x80, 0x3f])
  })
})
