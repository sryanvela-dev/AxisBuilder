import { describe, expect, it } from 'vitest'
import { createEmptyProject, openProject, saveProject } from '../../src/data/projectFile.ts'
import { findOverride, resetAllOverrides, resetOverride, rowOverride, setOverride, syncLabelOverrides } from '../../src/data/overrides.ts'
import type { Project, ShellNozzle } from '../../src/data/schema.ts'
import { sessionReducer, initialSession, type SessionAction, type SessionState } from '../../src/state/session.ts'

const nozzle = (id: string, x = 50): ShellNozzle => ({ id, diameter: 10, x, y: 50, minT: null, notes: '', include: true, labelMode: 'AUTO', noWrap: false })

function job(): Project {
  const p = createEmptyProject()
  return { ...p, vessel: { ...p.vessel, length: 200, height: 300 }, shellNozzles: [nozzle('N1', 40), nozzle('N2', 80), nozzle('N3', 120)] }
}

describe('label overrides in the project file (format 5)', () => {
  it('a format 4 file opens with no overrides', () => {
    const r = openProject(JSON.stringify({ schemaVersion: 4, jobId: 'j4' }))
    expect(r.ok && r.project.schemaVersion).toBe(5)
    expect(r.ok && r.migratedFrom).toBe(4)
    expect(r.ok && r.project.labelOverrides).toEqual([])
  })

  it('survive save and open', () => {
    let p = setOverride(job(), 'shellNozzles', 'N2', { label: { dx: 12, dy: -4 } })
    p = setOverride(p, 'shellNozzles', 'N3', { tip: 135 })
    p = setOverride(p, 'shellNozzles', 'N1', { label: 'inside' })
    const r = openProject(saveProject(p))
    expect(r.ok && r.project.labelOverrides).toEqual(p.labelOverrides)
  })

  it('set, reset one, reset all; both automatic removes it', () => {
    let p = setOverride(job(), 'shellNozzles', 'n2', { label: { dx: 1, dy: 2 } })
    p = setOverride(p, 'shellNozzles', 'N2', { tip: 90 })
    expect(p.labelOverrides).toEqual([{ list: 'shellNozzles', id: 'n2', label: { dx: 1, dy: 2 }, tip: 90 }])
    expect(rowOverride(p, 'shellNozzles', 1)?.tip).toBe(90)
    expect(rowOverride(p, 'shellNozzles', 0)).toBeUndefined()
    expect(setOverride(p, 'shellNozzles', 'N2', { label: null, tip: null }).labelOverrides).toEqual([])
    expect(resetOverride(p, 'shellNozzles', 'N2').labelOverrides).toEqual([])
    p = setOverride(p, 'headNozzles', 'H1', { tip: 0 })
    expect(resetAllOverrides(p).labelOverrides).toEqual([])
  })

  it('survive sorting and inserted rows, follow a rename, go with a delete', () => {
    const p = setOverride(job(), 'shellNozzles', 'N2', { label: { dx: 5, dy: 5 } })
    const sorted = { ...p, shellNozzles: [...p.shellNozzles].reverse() }
    expect(syncLabelOverrides(p, sorted).labelOverrides).toEqual(p.labelOverrides)
    const inserted = { ...p, shellNozzles: [nozzle('N0'), ...p.shellNozzles] }
    expect(syncLabelOverrides(p, inserted).labelOverrides).toEqual(p.labelOverrides)
    const renamed = { ...p, shellNozzles: p.shellNozzles.map((n) => (n.id === 'N2' ? { ...n, id: 'N2A' } : n)) }
    expect(findOverride(syncLabelOverrides(p, renamed), 'shellNozzles', 'N2A')?.label).toEqual({ dx: 5, dy: 5 })
    const deleted = { ...p, shellNozzles: p.shellNozzles.filter((n) => n.id !== 'N2') }
    expect(syncLabelOverrides(p, deleted).labelOverrides).toEqual([])
    // Swapping two names is not a rename of either.
    const swapped = { ...p, shellNozzles: [p.shellNozzles[1], p.shellNozzles[0], p.shellNozzles[2]] }
    expect(syncLabelOverrides(p, swapped).labelOverrides).toEqual(p.labelOverrides)
  })

  it('every edit in the session keeps them in step', () => {
    const p = setOverride(job(), 'shellNozzles', 'N2', { tip: 45 })
    let s: SessionState = sessionReducer(initialSession, { type: 'openJob', project: p, source: 'new' })
    const ren: SessionAction = { type: 'edit', label: 'Rename', update: (q) => ({ ...q, shellNozzles: q.shellNozzles.map((n, i) => (i === 1 ? { ...n, id: 'N9' } : n)) }) }
    s = sessionReducer(s, ren)
    expect(s.job!.history.present.labelOverrides[0].id).toBe('N9')
    s = sessionReducer(s, { type: 'undo' })
    expect(s.job!.history.present.labelOverrides[0].id).toBe('N2')
  })
})
