import { describe, expect, it } from 'vitest'
import { createEmptyProject, openProject, saveProject } from '../../src/data/projectFile.ts'
import { occurrenceOf, resetAllOverrides, resetOverride, rowOf, rowOverride, setOverride, syncLabelOverrides } from '../../src/data/overrides.ts'
import type { Project, ShellNozzle } from '../../src/data/schema.ts'
import { sessionReducer, initialSession, type SessionAction, type SessionState } from '../../src/state/session.ts'

const nozzle = (id: string, x = 50): ShellNozzle => ({ id, diameter: 10, x, y: 50, minT: null, notes: '', include: true, labelMode: 'AUTO', noWrap: false })

function job(): Project {
  const p = createEmptyProject()
  return { ...p, vessel: { ...p.vessel, length: 200, height: 300 }, shellNozzles: [nozzle('N1', 40), nozzle('N2', 80), nozzle('N3', 120)] }
}
const ids = (p: Project) => p.labelOverrides.map((o) => `${o.list}:${o.id}#${o.occurrence}`)

describe('label overrides in the project file (format 5)', () => {
  it('a format 4 file opens with no overrides', () => {
    const r = openProject(JSON.stringify({ schemaVersion: 4, jobId: 'j4' }))
    expect(r.ok && r.project.schemaVersion).toBe(5)
    expect(r.ok && r.migratedFrom).toBe(4)
    expect(r.ok && r.project.labelOverrides).toEqual([])
  })

  it('survive save and open', () => {
    let p = setOverride(job(), 'shellNozzles', 1, { label: { dx: 12, dy: -4 } })
    p = setOverride(p, 'shellNozzles', 2, { tip: 135 })
    p = setOverride(p, 'shellNozzles', 0, { label: 'inside' })
    const r = openProject(saveProject(p))
    expect(r.ok && r.project.labelOverrides).toEqual(p.labelOverrides)
  })

  it('set, reset one, reset all; both automatic removes it', () => {
    let p = setOverride(job(), 'shellNozzles', 1, { label: { dx: 1, dy: 2 } })
    p = setOverride(p, 'shellNozzles', 1, { tip: 90 })
    expect(p.labelOverrides).toEqual([{ list: 'shellNozzles', id: 'N2', occurrence: 0, label: { dx: 1, dy: 2 }, tip: 90 }])
    expect(rowOverride(p, 'shellNozzles', 1)?.tip).toBe(90)
    expect(rowOverride(p, 'shellNozzles', 0)).toBeUndefined()
    expect(setOverride(p, 'shellNozzles', 1, { label: null, tip: null }).labelOverrides).toEqual([])
    expect(resetOverride(p, 'shellNozzles', 1).labelOverrides).toEqual([])
    p = { ...p, circWelds: [{ id: 'C1', y: 10, include: true, showLabel: true }] }
    p = setOverride(p, 'circWelds', 0, { label: { dx: 5, dy: 0 } })
    expect(resetAllOverrides(p).labelOverrides).toEqual([])
  })

  it('repeated names: each row has its own move (ID + occurrence)', () => {
    let p = { ...job(), shellNozzles: [nozzle('TOL', 10), nozzle('N2'), nozzle('tol', 90)] }
    expect([occurrenceOf(p.shellNozzles, 0), occurrenceOf(p.shellNozzles, 2)]).toEqual([0, 1])
    expect(rowOf(p.shellNozzles, 'TOL', 1)).toBe(2)
    p = setOverride(p, 'shellNozzles', 2, { label: { dx: 3, dy: 3 } })
    expect(ids(p)).toEqual(['shellNozzles:tol#1'])
    expect(rowOverride(p, 'shellNozzles', 2)?.label).toEqual({ dx: 3, dy: 3 })
    expect(rowOverride(p, 'shellNozzles', 0)).toBeUndefined()
    p = setOverride(p, 'shellNozzles', 0, { tip: 10 })
    expect(rowOverride(p, 'shellNozzles', 0)?.tip).toBe(10)
    expect(rowOverride(p, 'shellNozzles', 2)?.tip).toBe(null)
  })

  it('follow their row through sorting, inserted rows, a rename and a delete', () => {
    const p = setOverride(job(), 'shellNozzles', 1, { label: { dx: 5, dy: 5 } })
    const sorted = { ...p, shellNozzles: [...p.shellNozzles].reverse() }
    expect(syncLabelOverrides(p, sorted).labelOverrides).toEqual(p.labelOverrides)
    const inserted = { ...p, shellNozzles: [nozzle('N0'), ...p.shellNozzles] }
    expect(syncLabelOverrides(p, inserted).labelOverrides).toEqual(p.labelOverrides)
    const renamed = { ...p, shellNozzles: p.shellNozzles.map((n) => (n.id === 'N2' ? { ...n, id: 'N2A' } : n)) }
    expect(ids(syncLabelOverrides(p, renamed))).toEqual(['shellNozzles:N2A#0'])
    const deleted = { ...p, shellNozzles: p.shellNozzles.filter((n) => n.id !== 'N2') }
    expect(syncLabelOverrides(p, deleted).labelOverrides).toEqual([])
    // Swapping two rows: the move goes with its row.
    const swapped = { ...p, shellNozzles: [p.shellNozzles[1], p.shellNozzles[0], p.shellNozzles[2]] }
    expect(syncLabelOverrides(p, swapped).labelOverrides).toEqual(p.labelOverrides)
  })

  it('with repeated names, a move stays with its own row through sorting and renames', () => {
    let p = { ...job(), shellNozzles: [nozzle('TOL', 10), nozzle('N2'), nozzle('TOL', 90)] }
    p = setOverride(p, 'shellNozzles', 2, { label: { dx: 7, dy: 0 } })
    // The second TOL moves to the top: it is now the first TOL.
    const sorted = { ...p, shellNozzles: [p.shellNozzles[2], p.shellNozzles[1], p.shellNozzles[0]] }
    const s = syncLabelOverrides(p, sorted)
    expect(ids(s)).toEqual(['shellNozzles:TOL#0'])
    expect(rowOverride(s, 'shellNozzles', 0)?.label).toEqual({ dx: 7, dy: 0 })
    // Renaming the first TOL makes the moved one the only TOL.
    const renamed = { ...p, shellNozzles: p.shellNozzles.map((n, i) => (i === 0 ? { ...n, id: 'N1' } : n)) }
    const r = syncLabelOverrides(p, renamed)
    expect(rowOverride(r, 'shellNozzles', 2)?.label).toEqual({ dx: 7, dy: 0 })
    expect(ids(r)).toEqual(['shellNozzles:TOL#0'])
  })

  it('every edit in the session keeps them in step', () => {
    const p = setOverride(job(), 'shellNozzles', 1, { tip: 45 })
    let s: SessionState = sessionReducer(initialSession, { type: 'openJob', project: p, source: 'new' })
    const ren: SessionAction = { type: 'edit', label: 'Rename', update: (q) => ({ ...q, shellNozzles: q.shellNozzles.map((n, i) => (i === 1 ? { ...n, id: 'N9' } : n)) }) }
    s = sessionReducer(s, ren)
    expect(s.job!.history.present.labelOverrides[0].id).toBe('N9')
    s = sessionReducer(s, { type: 'undo' })
    expect(s.job!.history.present.labelOverrides[0].id).toBe('N2')
  })
})
