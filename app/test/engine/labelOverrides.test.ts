// Labels moved by hand (Phase 5b): overrides in the engine output, in every orientation and on the heads; inside /
// outside on drop; leader end angles; automatic labels keep clear of moved ones; Review warnings use actual positions.
import { describe, expect, it } from 'vitest'
import { applyCheckAction, checkProject } from '../../src/data/checks.ts'
import { setOverride } from '../../src/data/overrides.ts'
import type { Project } from '../../src/data/schema.ts'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { dropLabel, dropTip, nudgeLabel } from '../../src/engine/labelDrag.ts'
import { drawnScans, panelOf } from '../../src/engine/layout.ts'
import { headNozzleLabels, shellNozzleLabels, textBox, type NozzleLabel } from '../../src/engine/labels.ts'
import { toVisual, type Orientation } from '../../src/engine/transform.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { LispNum } from '../../src/export/lsp/vbaFormat.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'

const ORIENTATIONS: Orientation[] = ['Vertical', 'Horizontal CW', 'Horizontal CCW']
const SHAPES = ['Straight', 'Elbow', 'Curved'] as const

function job(o: Orientation, settings: Partial<Project['settings']> = {}): Project {
  const p = sampleProject()
  return { ...p, vessel: { ...p.vessel, orientation: o }, settings: { ...p.settings, ...settings } }
}
const shell = (p: Project) => shellNozzleLabels(p, drawnScans(p))
const heads = (p: Project) => {
  const { panel, headDia } = panelOf(p)
  return headNozzleLabels(p, panel, headDia)
}
/** A point relative to the nozzle center, as the drawing reads. */
function rel(o: Orientation, l: NozzleLabel, q: [number, number]): [number, number] {
  const a = toVisual(o, l.x, l.y)
  const b = toVisual(o, q[0], q[1])
  return [b[0] - a[0], b[1] - a[1]]
}
const close = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 6)
  expect(a[1]).toBeCloseTo(b[1], 6)
}

describe('labels moved by hand', () => {
  for (const o of ORIENTATIONS) {
    for (const leaderShape of SHAPES) {
      it(`a shell label goes where it was put, its leader from the circle (${o}, ${leaderShape})`, () => {
        const p = setOverride(job(o, { leaderShape }), 'shellNozzles', 1, { label: { dx: 18, dy: 9 } })
        const l = shell(p).get(1)!
        expect(l.moved).toBe(true)
        close(rel(o, l, [l.tx, l.ty]), [18, 9])
        expect(Math.hypot(l.leader![0][0] - l.x, l.leader![0][1] - l.y)).toBeCloseTo(l.r, 6)
        // The leader ends just short of the label, on its near side.
        const end = rel(o, l, l.leader!.at(-1)!)
        expect(end[0]).toBeLessThan(18)
        if (leaderShape === 'Elbow') expect(end[1]).toBeCloseTo(9, 6)
      })
    }

    it(`a head label goes where it was put, the leader end at the set angle (${o})`, () => {
      let p = setOverride(job(o), 'headNozzles', 1, { label: { dx: -10, dy: 6 }, tip: 90 })
      p = { ...p, headNozzles: p.headNozzles.map((n) => (n.id === 'N4' ? { ...n, labelMode: 'OUTSIDE' as const } : n)) }
      const l = heads(p).get(1)!
      expect(l.moved).toBe(true)
      expect(l.fallback).toBeUndefined()
      close(rel(o, l, [l.tx, l.ty]), [-10, 6])
      close(rel(o, l, l.leader![0]), [0, l.r])
    })

    it(`the leader end alone can be moved; the label stays automatic (${o})`, () => {
      const auto = shell(job(o)).get(1)!
      const p = setOverride(job(o), 'shellNozzles', 1, { tip: 270 })
      const l = shell(p).get(1)!
      expect([l.tx, l.ty]).toEqual([auto.tx, auto.ty])
      close(rel(o, l, l.leader![0]), [0, -l.r])
    })
  }

  it('the moved position is what the drawing, the Sheets view and the .lsp use', () => {
    const p = setOverride(job('Horizontal CW'), 'shellNozzles', 1, { label: { dx: 18, dy: 9 } })
    const l = shell(p).get(1)!
    const placed = buildDrawing(p).labels.find((x) => x.key === 'shellNozzles:1')!
    expect(placed.nozzle).toEqual(l)
    expect([placed.x, placed.y, placed.moved]).toEqual([l.tx, l.ty, true])
    const lsp = exportLsp(p)
    expect(lsp).toContain(`(SL_NozzleAt ${[l.x, l.y, l.r].map(LispNum).join(' ')} "N2" 1.6 ${LispNum(l.tx)} ${LispNum(l.ty)} `)
    // Text size, leader shape and arrowhead changes keep the move.
    const bigger = { ...p, settings: { ...p.settings, shellNozzleTextSize: 'Scale' as const, shellNozzleTextScale: 2, leaderShape: 'Curved' as const, arrowheadStyle: 'Dot' as const } }
    const l2 = shell(bigger).get(1)!
    close(rel('Horizontal CW', l2, [l2.tx, l2.ty]), [18, 9])
  })

  it('dropped inside the circle: an inside label only when it fits', () => {
    const p = job('Vertical', { minNozzleInsideLabelDiameter: 1 })
    const l = shell(p).get(0)! // N1, 12 in: fits
    expect(dropLabel('Vertical', l, [l.x + 1, l.y])).toEqual({ label: 'inside' })
    const crowded = { ...l, canBeInside: false }
    expect(dropLabel('Vertical', crowded, [l.x + 1, l.y])).toEqual({ label: { dx: 1, dy: 0 } })
    // A stored inside label that no longer fits falls back to automatic, and says so.
    const q = setOverride({ ...p, settings: { ...p.settings, shellNozzleTextSize: 'Scale', shellNozzleTextScale: 5 } }, 'shellNozzles', 0, { label: 'inside' })
    const back = shell(q).get(0)!
    expect(back.fallback).toBe('it no longer fits inside the nozzle')
    expect(back.leader).not.toBeNull()
  })

  it('nudges move the label as the drawing reads; Shift steps are bigger', () => {
    for (const o of ORIENTATIONS) {
      const pl = buildDrawing(job(o)).labels.find((x) => x.key === 'shellNozzles:1')!
      const l = pl.nozzle!
      const before = rel(o, l, [l.tx, l.ty])
      const { label } = nudgeLabel(o, pl, 0.5, 0)
      expect(label).not.toBe('inside')
      const d = label as { dx: number; dy: number }
      expect(d.dx).toBeCloseTo(before[0] + 0.5, 3)
      expect(d.dy).toBeCloseTo(before[1], 3)
    }
  })

  it('the leader end snaps to the circle and stays on the drawn part across the seam', () => {
    const o: Orientation = 'Vertical'
    const l = shell(job(o)).get(1)!
    expect(dropTip(o, l, [l.x, l.y + 50])).toEqual({ tip: 90 })
    // N2 across the seam at X = 1 (most of it at the start, the rest at X = C): the main piece's arc is -t..t.
    const p0 = job(o)
    const p = { ...p0, shellNozzles: p0.shellNozzles.map((n) => (n.id === 'N2' ? { ...n, x: 1 } : n)) }
    const w = shell(p).get(1)!
    expect(w.tipArc).not.toBeNull()
    const [a0, a1] = w.tipArc!
    // Pointing left (180) is off the drawn part: held to the nearer end.
    const { tip } = dropTip(o, w, [w.x - 50, w.y + 1])
    expect([a0, a1].some((a) => Math.abs(a - tip!) < 1e-3)).toBe(true)
    const q = setOverride(p, 'shellNozzles', 1, { label: { dx: -20, dy: 5 }, tip: 180 })
    const lq = shell(q).get(1)!
    expect(lq.leader![0][0]).toBeGreaterThanOrEqual(-1e-6)
  })

  it('automatic labels keep clear of a moved label and its leader', () => {
    // Put N1's label (moved) where N2's automatic label goes: N2 then finds another spot.
    const p = job('Vertical')
    const auto = shell(p).get(1)!
    const n1 = shell(p).get(0)!
    const q = setOverride(p, 'shellNozzles', 0, { label: { dx: auto.tx - n1.x, dy: auto.ty - n1.y } })
    const moved = shell(q).get(0)!
    const after = shell(q).get(1)!
    expect([after.tx, after.ty]).not.toEqual([auto.tx, auto.ty])
    const a = textBox(moved.tx, moved.ty, moved.tw, moved.sh, 0)
    const b = textBox(after.tx, after.ty, after.tw, after.sh, 0)
    expect(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]).toBe(true)
  })

  it('a moved label on a scan gets the crowded warning, saying it was moved by hand; Reset puts it back', () => {
    const p0 = job('Vertical')
    const s = drawnScans(p0).find((x) => x.include)!
    const n2 = shell(p0).get(1)!
    const cx = (s.xStart! + s.xStop!) / 2
    const cy = (s.yStart! + s.yStop!) / 2
    const p = setOverride(p0, 'shellNozzles', 1, { label: { dx: cx - n2.x, dy: cy - n2.y } })
    const c = checkProject(p).find((x) => x.text.startsWith('Label N2'))!
    expect(c.text).toMatch(/^Label N2 \(moved by hand\) overlaps scan /)
    expect(c.actions?.[0].label).toBe('Reset position')
    expect(applyCheckAction(p, c.actions![0]).labelOverrides).toEqual([])
  })

  it('an automatic label that a later nozzle lands on gets the crowded warning (actual positions)', () => {
    const p = job('Vertical')
    const l = shell(p).get(1)!
    expect(l.crowded).toBeUndefined()
    const q: Project = { ...p, shellNozzles: [...p.shellNozzles, { ...p.shellNozzles[0], id: 'NX', x: l.tx, y: l.ty, diameter: 6 }] }
    const after = shell(q).get(1)!
    expect([after.tx, after.ty]).toEqual([l.tx, l.ty])
    expect(after.crowded).toBe('nozzle NX')
    expect(checkProject(q).some((c) => c.text === 'Label N2 overlaps nozzle NX.')).toBe(true)
  })

  it('a label put off the shell is placed automatically, with a warning that never blocks export', () => {
    const p = setOverride(job('Vertical'), 'shellNozzles', 1, { label: { dx: -500, dy: 0 } })
    const l = shell(p).get(1)!
    expect(l.fallback).toBe('it was off the shell')
    expect(l.tx).toEqual(shell(job('Vertical')).get(1)!.tx)
    const c = checkProject(p).find((x) => x.text.includes('was moved by hand'))!
    expect(c.severity).toBe('warning')
    expect(() => exportLsp(p)).not.toThrow()
  })

  it('a head label put far from its head view is placed automatically', () => {
    const p = setOverride(job('Vertical'), 'headNozzles', 0, { label: { dx: 0, dy: 900 } })
    expect(heads(p).get(0)!.fallback).toBe('it was off the head view')
  })

  it('no overrides: the same labels as before (the golden jobs and their fingerprints stay)', () => {
    const p = job('Horizontal CW')
    const a = shell(p)
    const b = shell(setOverride(setOverride(p, 'shellNozzles', 1, { tip: 0 }), 'shellNozzles', 1, { tip: null }))
    expect([...b.values()]).toEqual([...a.values()])
  })
})
