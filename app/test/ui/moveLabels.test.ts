// Drawing mode, Move labels (ui/preview/labelTool.tsx, MoveLabels.tsx): what is under the pointer, the drag ghost,
// the screen mapping, and undo: one step per drag, a run of nudges on one label one step, reset per item and all.
import { describe, expect, it } from 'vitest'
import { resetAllOverrides, resetOverride, setOverride } from '../../src/data/overrides.ts'
import type { Project } from '../../src/data/schema.ts'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { NUDGE, nudgeLabel } from '../../src/engine/labelDrag.ts'
import { toVisual, type Orientation } from '../../src/engine/transform.ts'
import { initialSession, sessionReducer, type SessionAction, type SessionState } from '../../src/state/session.ts'
import { svgToLogical, visualToSvg } from '../../src/ui/preview/drawingTool.ts'
import { hitLabel, labelBoxVisual, labelGhost, tipVisual } from '../../src/ui/preview/labelTool.tsx'
import { toSvg } from '../../src/ui/preview/renderModel.ts'
// The sample as it was when these tests were written (test/fixtures/olderSample.ts).
import { olderSample as sampleProject } from '../fixtures/olderSample.ts'

const job = (o: Orientation): Project => {
  const p = sampleProject()
  return { ...p, vessel: { ...p.vessel, orientation: o } }
}

describe('move labels tool', () => {
  for (const o of ['Vertical', 'Horizontal CW', 'Horizontal CCW'] as Orientation[]) {
    it(`screen points map back to the drawing (${o})`, () => {
      const s = toSvg(o, 12, 34)
      const back = svgToLogical(o, s)
      expect(back[0]).toBeCloseTo(12, 9)
      expect(back[1]).toBeCloseTo(34, 9)
      expect(visualToSvg(toVisual(o, 12, 34))).toEqual(s)
    })

    it(`finds the label under the pointer, and the selected label's leader end first (${o})`, () => {
      const d = buildDrawing(job(o))
      const n2 = d.labels.find((x) => x.id === 'N2')!
      const b = labelBoxVisual(o, n2)
      const mid: [number, number] = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
      expect(hitLabel(o, d.labels, mid, 0.1, null)).toMatchObject({ part: 'label', pl: { id: 'N2' } })
      const tip = tipVisual(o, n2)!
      expect(hitLabel(o, d.labels, tip, 0.5, n2.key)).toMatchObject({ part: 'tip', pl: { id: 'N2' } })
      expect(hitLabel(o, d.labels, [-1000, -1000], 0.5, n2.key)).toBeNull()
    })
  }

  it('the ghost shows the label and leader where a drop would put them', () => {
    const o: Orientation = 'Horizontal CW'
    const p = job(o)
    const n2 = buildDrawing(p).labels.find((x) => x.id === 'N2')!
    const g = labelGhost(o, p, n2, { label: { dx: 20, dy: 10 } }, null)
    const c = toVisual(o, n2.nozzle!.x, n2.nozzle!.y)
    expect((g.box[0] + g.box[2]) / 2).toBeCloseTo(c[0] + 20, 9)
    expect((g.box[1] + g.box[3]) / 2).toBeCloseTo(c[1] + 10, 9)
    expect(g.path?.length).toBeGreaterThan(1)
    // Dropped inside: no leader.
    expect(labelGhost(o, p, n2, { label: 'inside' }, null).path).toBeNull()
    // The same as the engine draws after the drop.
    const after = buildDrawing(setOverride(p, 'shellNozzles', 1, { label: { dx: 20, dy: 10 } })).labels.find((x) => x.id === 'N2')!
    expect(g.path).toEqual(after.nozzle!.leader!.map((q) => toVisual(o, q[0], q[1])))
  })
})

describe('undo for moved labels', () => {
  const open = (): SessionState => sessionReducer(initialSession, { type: 'openJob', project: job('Vertical'), source: 'new' })
  const drop = (dx: number): SessionAction => ({ type: 'edit', label: 'Move label N2', update: (p) => setOverride(p, 'shellNozzles', 1, { label: { dx, dy: 0 } }) })
  const nudge: SessionAction = {
    type: 'edit', label: 'Move label N2', group: 'nudge:shellNozzles:1',
    update: (p) => {
      const l = buildDrawing(p).labels.find((x) => x.id === 'N2')!
      return setOverride(p, 'shellNozzles', 1, nudgeLabel('Vertical', l, NUDGE, 0))
    },
  }
  const present = (s: SessionState) => s.job!.history.present.labelOverrides

  it('each drag is one undo step', () => {
    let s = [drop(10), drop(20)].reduce(sessionReducer, open())
    expect(present(s)[0].label).toEqual({ dx: 20, dy: 0 })
    s = sessionReducer(s, { type: 'undo' })
    expect(present(s)[0].label).toEqual({ dx: 10, dy: 0 })
    s = sessionReducer(s, { type: 'undo' })
    expect(present(s)).toEqual([])
    s = sessionReducer(s, { type: 'redo' })
    expect(present(s)[0].label).toEqual({ dx: 10, dy: 0 })
  })

  it('a run of nudges is one step; it ends when the selection changes', () => {
    let s = [drop(10), nudge, nudge, nudge].reduce(sessionReducer, open())
    expect((present(s)[0].label as { dx: number }).dx).toBeCloseTo(11.5, 9)
    s = sessionReducer(s, { type: 'undo' })
    expect(present(s)[0].label).toEqual({ dx: 10, dy: 0 })
    s = [nudge, { type: 'endEditGroup' } as SessionAction, nudge].reduce(sessionReducer, s)
    s = sessionReducer(s, { type: 'undo' })
    expect((present(s)[0].label as { dx: number }).dx).toBeCloseTo(10.5, 9)
  })

  it('reset one and reset all are one step each, and can be undone', () => {
    let s = [drop(10), { type: 'edit', label: 'Move', update: (p: Project) => setOverride(p, 'headNozzles', 1, { tip: 45 }) } as SessionAction].reduce(sessionReducer, open())
    s = sessionReducer(s, { type: 'edit', label: 'Reset position of N2', update: (p) => resetOverride(p, 'shellNozzles', 1) })
    expect(present(s).map((o) => o.id)).toEqual(['N4'])
    s = sessionReducer(s, { type: 'edit', label: 'Reset all moved labels', update: resetAllOverrides })
    expect(present(s)).toEqual([])
    s = sessionReducer(s, { type: 'undo' })
    expect(present(s).map((o) => o.id)).toEqual(['N4'])
    s = sessionReducer(s, { type: 'undo' })
    expect(present(s).map((o) => o.id).sort()).toEqual(['N2', 'N4'])
  })
})
