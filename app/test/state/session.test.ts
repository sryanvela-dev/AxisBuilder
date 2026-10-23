import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../../src/data/projectFile.ts'
import type { Project } from '../../src/data/schema.ts'
import { initialSession, isDirty, jobTitle, sessionReducer, type SessionAction, type SessionState } from '../../src/state/session.ts'

const rename = (name: string, now = 0): SessionAction => ({
  type: 'edit',
  label: 'Change Project name',
  group: 'project.projectName',
  now,
  update: (p: Project) => ({ ...p, project: { ...p.project, projectName: name } }),
})

function run(actions: SessionAction[], start: SessionState = initialSession): SessionState {
  return actions.reduce(sessionReducer, start)
}

const file = { name: 'Job.axb', handle: null, lastModified: 1, writeConfirmed: false }

describe('session state', () => {
  it('a new job is not saved yet; an opened file is saved', () => {
    const fresh = run([{ type: 'openJob', project: createEmptyProject(), source: 'new' }])
    expect(isDirty(fresh.job!)).toBe(true)
    expect(jobTitle(fresh.job!)).toBe('Untitled job')
    const opened = run([{ type: 'openJob', project: createEmptyProject(), source: 'file', file, saved: true }])
    expect(isDirty(opened.job!)).toBe(false)
    expect(jobTitle(opened.job!)).toBe('Job')
  })

  it('every edit can be undone and redone; undoing back to the saved state is clean again', () => {
    let s = run([{ type: 'openJob', project: createEmptyProject(), source: 'file', file, saved: true }])
    s = run([rename('V-1', 0), rename('V-2', 10_000)], s)
    expect(s.job!.history.present.project.projectName).toBe('V-2')
    expect(isDirty(s.job!)).toBe(true)
    s = run([{ type: 'undo' }], s)
    expect(s.job!.history.present.project.projectName).toBe('V-1')
    s = run([{ type: 'undo' }], s)
    expect(s.job!.history.present.project.projectName).toBe('')
    expect(isDirty(s.job!)).toBe(false)
    s = run([{ type: 'redo' }, { type: 'redo' }], s)
    expect(s.job!.history.present.project.projectName).toBe('V-2')
  })

  it('typing in one box is one undo step', () => {
    let s = run([{ type: 'openJob', project: createEmptyProject(), source: 'new' }])
    s = run([rename('V', 0), rename('V-', 200), rename('V-1', 400)], s)
    s = run([{ type: 'undo' }], s)
    expect(s.job!.history.present.project.projectName).toBe('')
  })

  it('saving marks the saved version without touching the undo history', () => {
    let s = run([{ type: 'openJob', project: createEmptyProject(), source: 'new' }, rename('V-1')])
    const project = s.job!.history.present
    s = run([{ type: 'saved', project, file: { ...file, writeConfirmed: true } }], s)
    expect(isDirty(s.job!)).toBe(false)
    expect(s.job!.file!.name).toBe('Job.axb')
    // An edit made while the save was running keeps the job dirty.
    s = run([rename('V-2', 10_000)], s)
    expect(isDirty(s.job!)).toBe(true)
    s = run([{ type: 'undo' }], s)
    expect(isDirty(s.job!)).toBe(false)
  })

  it('step changes and report checks are not part of undo', () => {
    let s = run([{ type: 'openJob', project: createEmptyProject(), source: 'new' }, rename('A')])
    s = run([{ type: 'goToStep', step: 'images' }, { type: 'undo' }], s)
    expect(s.job!.step).toBe('images')
    expect(s.job!.history.present.project.projectName).toBe('')
  })

  it('actions without an open job change nothing', () => {
    expect(run([rename('x'), { type: 'undo' }, { type: 'goToStep', step: 'review' }])).toBe(initialSession)
  })

  it('closing forgets the job', () => {
    const s = run([{ type: 'openJob', project: createEmptyProject(), source: 'new' }, { type: 'closeJob' }])
    expect(s.job).toBeNull()
  })
})
