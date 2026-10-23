import { describe, expect, it } from 'vitest'
import { canRedo, canUndo, createHistory, GROUP_MS, HISTORY_LIMIT, record, redo, redoLabel, undo, undoLabel } from '../../src/state/history.ts'

describe('undo history', () => {
  it('undoes and redoes changes in order', () => {
    let h = createHistory('a')
    h = record(h, 'b', { label: 'to b', now: 0 })
    h = record(h, 'c', { label: 'to c', now: 10 })
    expect(h.present).toBe('c')
    expect(undoLabel(h)).toBe('to c')

    h = undo(h)
    expect(h.present).toBe('b')
    expect(redoLabel(h)).toBe('to c')
    h = undo(h)
    expect(h.present).toBe('a')
    expect(canUndo(h)).toBe(false)
    expect(undo(h)).toBe(h)

    h = redo(h)
    h = redo(h)
    expect(h.present).toBe('c')
    expect(canRedo(h)).toBe(false)
    expect(redo(h)).toBe(h)
  })

  it('a new change after undo clears redo', () => {
    let h = record(createHistory(1), 2, { label: 'x', now: 0 })
    h = undo(h)
    h = record(h, 3, { label: 'y', now: 5 })
    expect(canRedo(h)).toBe(false)
    expect(h.past).toEqual([1])
  })

  it('ignores a change to the same value', () => {
    const h = createHistory({ n: 1 })
    expect(record(h, h.present, { label: 'same' })).toBe(h)
  })

  it('merges changes of the same group within the time window into one step', () => {
    let h = createHistory('')
    h = record(h, 'V', { label: 'Change name', group: 'name', now: 0 })
    h = record(h, 'V-', { label: 'Change name', group: 'name', now: 300 })
    h = record(h, 'V-1', { label: 'Change name', group: 'name', now: 600 })
    expect(h.past).toEqual([''])
    h = undo(h)
    expect(h.present).toBe('')
  })

  it('does not merge across groups, after the window, or after undo', () => {
    let h = createHistory('')
    h = record(h, 'a', { label: 'name', group: 'name', now: 0 })
    h = record(h, 'ab', { label: 'name', group: 'name', now: GROUP_MS + 1 })
    expect(h.past).toEqual(['', 'a'])
    h = record(h, 'ab2', { label: 'client', group: 'client', now: GROUP_MS + 2 })
    expect(h.past.length).toBe(3)
    h = undo(h)
    h = record(h, 'ab3', { label: 'client', group: 'client', now: GROUP_MS + 3 })
    expect(h.past.length).toBe(3)
  })

  it('keeps at most HISTORY_LIMIT undo steps', () => {
    let h = createHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = record(h, i, { label: `step ${i}`, now: i * 10_000 })
    expect(h.past.length).toBe(HISTORY_LIMIT)
    expect(h.pastLabels.length).toBe(HISTORY_LIMIT)
    expect(h.past[0]).toBe(10)
  })
})
