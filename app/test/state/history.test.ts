import { describe, expect, it } from 'vitest'
import { canRedo, canUndo, createHistory, endGroup, HISTORY_LIMIT, record, redo, redoLabel, undo, undoLabel } from '../../src/state/history.ts'

describe('undo history', () => {
  it('undoes and redoes changes in order', () => {
    let h = createHistory('a')
    h = record(h, 'b', { label: 'to b' })
    h = record(h, 'c', { label: 'to c' })
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
    let h = record(createHistory(1), 2, { label: 'x' })
    h = undo(h)
    h = record(h, 3, { label: 'y' })
    expect(canRedo(h)).toBe(false)
    expect(h.past).toEqual([1])
  })

  it('ignores a change to the same value', () => {
    const h = createHistory({ n: 1 })
    expect(record(h, h.present, { label: 'same' })).toBe(h)
  })

  it('merges changes of the same group into one step until the group ends', () => {
    let h = createHistory('')
    h = record(h, 'V', { label: 'Change name', group: 'name' })
    h = record(h, 'V-', { label: 'Change name', group: 'name' })
    h = record(h, 'V-1', { label: 'Change name', group: 'name' })
    expect(h.past).toEqual([''])
    h = endGroup(h)
    h = record(h, 'V-12', { label: 'Change name', group: 'name' })
    expect(h.past).toEqual(['', 'V-1'])
    h = undo(h)
    expect(h.present).toBe('V-1')
    h = undo(h)
    expect(h.present).toBe('')
  })

  it('does not merge across groups, without a group, or after undo', () => {
    let h = createHistory('')
    h = record(h, 'a', { label: 'name', group: 'name' })
    h = record(h, 'ab', { label: 'client', group: 'client' })
    expect(h.past).toEqual(['', 'a'])
    h = record(h, 'abc', { label: 'pick' })
    h = record(h, 'abcd', { label: 'pick' })
    expect(h.past.length).toBe(4)
    h = record(h, 'x', { label: 'client', group: 'client' })
    h = undo(h)
    h = record(h, 'y', { label: 'client', group: 'client' })
    expect(h.past.length).toBe(5)
    expect(endGroup(createHistory(1))).toEqual(createHistory(1))
  })

  it('keeps at most HISTORY_LIMIT undo steps', () => {
    let h = createHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = record(h, i, { label: `step ${i}` })
    expect(h.past.length).toBe(HISTORY_LIMIT)
    expect(h.pastLabels.length).toBe(HISTORY_LIMIT)
    expect(h.past[0]).toBe(10)
  })
})
