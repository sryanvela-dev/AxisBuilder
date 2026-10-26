// Weld, seam, object and MUT labels moved by hand (engine/textLabels.ts): where they go in every orientation, their
// leaders (MUT point, object edge), the .lsp, fallbacks; and repeated nozzle names moved one by one.
import { describe, expect, it } from 'vitest'
import { checkProject } from '../../src/data/checks.ts'
import { setOverride } from '../../src/data/overrides.ts'
import type { Project } from '../../src/data/schema.ts'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { nudgeLabel } from '../../src/engine/labelDrag.ts'
import { textLabelSpecs } from '../../src/engine/textLabels.ts'
import { toVisual, type Orientation } from '../../src/engine/transform.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { LispNum } from '../../src/export/lsp/vbaFormat.ts'
// The sample as it was when these tests were written (test/fixtures/olderSample.ts).
import { olderSample as sampleProject } from '../fixtures/olderSample.ts'

const ORIENTATIONS: Orientation[] = ['Vertical', 'Horizontal CW', 'Horizontal CCW']

function job(o: Orientation = 'Vertical'): Project {
  const p = sampleProject()
  return {
    ...p,
    vessel: { ...p.vessel, orientation: o },
    circWelds: p.circWelds.map((w) => ({ ...w, showLabel: true })),
    longSeams: p.longSeams.map((w) => ({ ...w, showLabel: true })),
    settings: { ...p.settings, showWeldLabels: true },
  }
}
const placed = (p: Project, key: string) => buildDrawing(p).labels.find((x) => x.key === key)!
const lsp = (p: Project) => exportLsp(p, { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5) })
const texts = (p: Project, key: string) => buildDrawing(p).items.find((i) => i.key === key)!.shapes.filter((s) => s.t === 'text')
const balanced = (s: string) => [...s].filter((c) => c === '(').length === [...s].filter((c) => c === ')').length

describe('text labels moved by hand', () => {
  it('every weld, seam, object and MUT label can be picked in the preview, at its automatic spot', () => {
    const p = job()
    const keys = buildDrawing(p).labels.filter((x) => x.text).map((x) => x.key).sort()
    expect(keys).toEqual(textLabelSpecs(p).map((sp) => `${sp.list}:${sp.index}`).sort())
    expect(keys.some((k) => k.startsWith('circWelds'))).toBe(true)
    expect(keys.some((k) => k.startsWith('longSeams'))).toBe(true)
    expect(keys).toContain('objects:0')
    expect(keys).toContain('shellMut:0')
    const w = placed(p, 'circWelds:0')
    expect([w.x, w.y]).toEqual([p.vessel.height! - 3, p.circWelds[0].y])
    expect(w.moved).toBe(false)
  })

  for (const o of ORIENTATIONS) {
    it(`a MUT label goes where it was put, with a leader to its point (${o})`, () => {
      const p = setOverride(job(o), 'shellMut', 0, { label: { dx: 4, dy: 3 } })
      const pl = placed(p, 'shellMut:0')
      const m = p.shellMut[0]
      const a = toVisual(o, m.x!, m.y!)
      const b = toVisual(o, pl.x, pl.y)
      expect(b[0] - a[0]).toBeCloseTo(4, 9)
      expect(b[1] - a[1]).toBeCloseTo(3, 9)
      expect(pl.moved).toBe(true)
      const t = texts(p, 'shellMut:0')
      expect(t).toHaveLength(1)
      expect(t[0]).toMatchObject({ x: pl.x, y: pl.y })
      const leaders = buildDrawing(p).items.find((i) => i.key === 'shellMut:0')!.shapes.filter((s) => s.t === 'poly' && !s.fill)
      expect(leaders.length).toBe(1)
      const first = (leaders[0] as { pts: [number, number][] }).pts[0]
      expect(first[0]).toBeCloseTo(m.x!, 9)
      expect(first[1]).toBeCloseTo(m.y!, 9)
    })

    it(`a weld and a seam label move as plain text (${o})`, () => {
      // C2 sits at the right edge (X = circumference - 3): moved back along the weld, as the drawing reads.
      let p = setOverride(job(o), 'circWelds', 1, { label: { dx: o === 'Vertical' ? -20 : 0, dy: o === 'Horizontal CW' ? 20 : o === 'Horizontal CCW' ? -20 : 0 } })
      p = setOverride(p, 'longSeams', 0, { label: { dx: 0, dy: 20 } })
      for (const key of ['circWelds:1', 'longSeams:0']) {
        const pl = placed(p, key)
        expect(pl.moved).toBe(true)
        expect(texts(p, key)[0]).toMatchObject({ x: pl.x, y: pl.y })
        expect(buildDrawing(p).items.find((i) => i.key === key)!.shapes.some((s) => s.t === 'poly')).toBe(false)
      }
    })
  }

  it('an object ID inside its rectangle has no leader; outside, a leader from the nearest edge', () => {
    const p0 = job('Vertical')
    const ob = p0.objects[0] // 120, 40, 60 x 8
    const inside = placed(setOverride(p0, 'objects', 0, { label: { dx: 20, dy: 0 } }), 'objects:0')
    expect(inside.moved).toBe(true)
    const p = setOverride(p0, 'objects', 0, { label: { dx: 0, dy: 25 } })
    const shapes = buildDrawing(p).items.find((i) => i.key === 'objects:0')!.shapes
    const leader = shapes.find((s) => s.t === 'poly' && !s.fill) as { pts: [number, number][] }
    expect(leader.pts[0][1]).toBeCloseTo(ob.y! + ob.length!, 9)
    expect(buildDrawing(setOverride(p0, 'objects', 0, { label: { dx: 20, dy: 0 } })).items.find((i) => i.key === 'objects:0')!.shapes.some((s) => s.t === 'poly')).toBe(false)
  })

  it('the .lsp draws them where they were put (app only); unmoved labels are written as before', () => {
    const base = job('Horizontal CW')
    let p = setOverride(base, 'shellMut', 0, { label: { dx: 4, dy: 3 } })
    p = setOverride(p, 'circWelds', 1, { label: { dx: 0, dy: 20 } })
    p = setOverride(p, 'longSeams', 0, { label: { dx: 0, dy: 20 } })
    p = setOverride(p, 'objects', 0, { label: { dx: 25, dy: 0 } })
    const out = lsp(p)
    expect(balanced(out)).toBe(true)
    const at = (key: string) => {
      const pl = placed(p, key)
      return `(SL_Text ${LispNum(pl.x)} ${LispNum(pl.y)} `
    }
    for (const key of ['shellMut:0', 'circWelds:1', 'longSeams:0', 'objects:0']) {
      expect(placed(p, key).moved).toBe(true)
      expect(out).toContain(at(key))
    }
    expect(out).not.toContain(`(SL_MUTPoint ${LispNum(p.shellMut[0].x!)} ${LispNum(p.shellMut[0].y!)} "${p.shellMut[0].id}")`)
    expect(out).toContain(`(SL_MUTPoint ${LispNum(p.shellMut[1].x!)} ${LispNum(p.shellMut[1].y!)} "${p.shellMut[1].id}")`)
    expect(out).toContain(`(SL_CircWeld ${LispNum(p.circWelds[1].y!)} -1. -1. vesselXLen "")`)
    expect(out).toContain(`(SL_CircWeld ${LispNum(p.circWelds[0].y!)} -1. -1. vesselXLen "C1")`)
    expect(out).not.toContain(`(SL_LabelRect ${LispNum(p.objects[0].x!)} `)
    expect(out).toContain('(SL_LeaderPart pc "SHELL_MUT_TEXT")')
    expect(out).toContain('(SL_LeaderPart pc "SUPPORTS")')
    // compat v5.0 ignores moves.
    const v5 = exportLsp(p, { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5), compat: 'v5.0' })
    expect(v5).toBe(exportLsp(base, { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5), compat: 'v5.0' }))
  })

  it('moved off the shell: placed automatically, with a warning and a Reset', () => {
    const p = setOverride(job(), 'circWelds', 0, { label: { dx: 900, dy: 0 } })
    expect(placed(p, 'circWelds:0').moved).toBe(false)
    const c = checkProject(p).find((x) => x.text.includes('was moved by hand'))!
    expect(c.text).toContain('it was off the shell')
    expect(c.actions?.[0].label).toBe('Reset position')
  })

  it('nudge works on text labels too', () => {
    const p = job('Horizontal CCW')
    const pl = placed(p, 'shellMut:0')
    expect(nudgeLabel('Horizontal CCW', pl, 0, 6)).toEqual({ label: { dx: 0, dy: 6 } })
  })
})

describe('repeated nozzle names', () => {
  it('two nozzles named TOL are drawn with that name and moved one by one', () => {
    const p0 = sampleProject()
    const p1: Project = { ...p0, shellNozzles: p0.shellNozzles.map((n, i) => (i < 2 ? { ...n, id: 'TOL' } : n)) }
    expect(checkProject(p1).filter((c) => c.severity === 'error' && c.text.includes('TOL'))).toEqual([])
    expect(checkProject(p1).some((c) => c.severity === 'warning' && c.text === 'The name "TOL" is also used in row 1.')).toBe(true)
    const p = setOverride(p1, 'shellNozzles', 1, { label: { dx: 10, dy: 10 } })
    const labels = buildDrawing(p).labels.filter((x) => x.id === 'TOL')
    expect(labels.map((x) => [x.index, x.moved])).toEqual([[0, false], [1, true]])
    expect(lsp(p).match(/"TOL"/g)?.length).toBeGreaterThanOrEqual(2)
  })
})
