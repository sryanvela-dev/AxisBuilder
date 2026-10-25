// Nozzle label rules (app change 23, engine/labels.ts): inside only when width and height fit; every drawn scan is
// avoided (not only photos); a crowded label tries longer leaders, then is placed with a Review warning.
import { describe, expect, it } from 'vitest'
import { checkProject } from '../../src/data/checks.ts'
import type { Project } from '../../src/data/schema.ts'
import { drawnScans } from '../../src/engine/layout.ts'
import { crowdedLabels, shellNozzleLabels } from '../../src/engine/labels.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'
import { AUTOMATIC_TEXT } from '../automaticText.ts'

/**
 * The sample job with one shell nozzle changed (index 1, N2) and the given extra settings. Straight leaders on a Vertical
 * drawing unless a test says otherwise: the spots these tests were written for (labels are placed as the drawing reads).
 */
function withNozzle(n: Partial<Project['shellNozzles'][number]>, settings: Partial<Project['settings']> = {}, scans?: Project['scans']): Project {
  const p = sampleProject()
  return {
    ...p, ...(scans ? { scans } : {}),
    vessel: { ...p.vessel, orientation: 'Vertical' },
    settings: { ...p.settings, ...AUTOMATIC_TEXT, leaderShape: 'Straight', ...settings },
    shellNozzles: p.shellNozzles.map((x, i) => (i === 1 ? { ...x, ...n } : x)),
  }
}

describe('nozzle labels', () => {
  it('goes outside when the label is too tall for the circle, even if it is narrow enough', () => {
    // "A" at twice the size: 1.92 wide fits a 4 in nozzle (0.75 x 4 = 3), 3.2 tall does not.
    const tall = withNozzle({ id: 'A', diameter: 4 }, { shellNozzleTextSize: 'Scale', shellNozzleTextScale: 2, minNozzleInsideLabelDiameter: 1 })
    expect(shellNozzleLabels(tall, drawnScans(tall)).get(1)!.leader).not.toBeNull()
    const small = withNozzle({ id: 'A', diameter: 4 }, { minNozzleInsideLabelDiameter: 1 })
    expect(shellNozzleLabels(small, drawnScans(small)).get(1)!.leader).toBeNull()
  })

  it('keeps labels off scans without photos', () => {
    // A scan just right of N2, no photos: the first spot (right) is on it, so the label goes to the left.
    const scans: Project['scans'] = [{ id: 'S', xStart: 55, xStop: 100, yStart: 80, yStop: 120, include: true, noWrap: false, acrossSeam: false }]
    const p = withNozzle({ x: 50, y: 100, diameter: 4, labelMode: 'OUTSIDE' }, { generateOverlayDrawing: false, leaderShape: 'Straight' }, scans)
    const l = shellNozzleLabels(p, drawnScans(p)).get(1)!
    expect(l.tx).toBeLessThan(50)
    expect(l.crowded).toBeUndefined()
  })

  it('makes the leader longer when every spot at the set length is taken', () => {
    // A nozzle in a gap between scans just wider than the circle: the first ring of spots lands on scans.
    const scans: Project['scans'] = [
      { id: 'L', xStart: 0, xStop: 44, yStart: 0, yStop: 200, include: true, noWrap: false, acrossSeam: false },
      { id: 'R', xStart: 56, xStop: 120, yStart: 0, yStop: 200, include: true, noWrap: false, acrossSeam: false },
      { id: 'T', xStart: 44, xStop: 56, yStart: 104, yStop: 200, include: true, noWrap: false, acrossSeam: false },
      { id: 'B', xStart: 44, xStop: 56, yStart: 0, yStop: 96, include: true, noWrap: false, acrossSeam: false },
    ]
    const p = withNozzle({ x: 50, y: 100, diameter: 4, labelMode: 'OUTSIDE' }, { generateOverlayDrawing: false }, scans)
    const l = shellNozzleLabels(p, drawnScans(p)).get(1)!
    // Boxed in on every side: placed anyway, with what it overlaps.
    expect(l.crowded).toMatch(/^scan /)
    const c = crowdedLabels(p).find((x) => x.index === 1)
    expect(c).toMatchObject({ list: 'shellNozzles', id: 'N2' })
    const check = checkProject(p).find((x) => x.place.kind === 'row' && x.place.list === 'shellNozzles' && x.place.index === 1 && x.text.startsWith('Label'))
    expect(check?.severity).toBe('warning')
    expect(check?.text).toMatch(/^Label N2 overlaps scan /)
  })

  it('finds a spot further out before warning', () => {
    // Scans hug the nozzle closely but leave the area further out free on the right.
    const scans: Project['scans'] = [
      { id: 'L', xStart: 0, xStop: 47, yStart: 0, yStop: 200, include: true, noWrap: false, acrossSeam: false },
      { id: 'T', xStart: 47, xStop: 120, yStart: 103, yStop: 200, include: true, noWrap: false, acrossSeam: false },
      { id: 'B', xStart: 47, xStop: 120, yStart: 0, yStop: 97, include: true, noWrap: false, acrossSeam: false },
      { id: 'R', xStart: 53, xStop: 58, yStart: 97, yStop: 103, include: true, noWrap: false, acrossSeam: false },
    ]
    const p = withNozzle({ x: 50, y: 100, diameter: 4, labelMode: 'OUTSIDE' }, { generateOverlayDrawing: false }, scans)
    const l = shellNozzleLabels(p, drawnScans(p)).get(1)!
    expect(l.crowded).toBeUndefined()
    expect(l.tx).toBeGreaterThan(58)
    expect(checkProject(p).some((x) => x.text.startsWith('Label N2'))).toBe(false)
  })
})
