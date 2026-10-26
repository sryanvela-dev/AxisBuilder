import { describe, expect, it } from 'vitest'
import { copyId, newItem, nextId, setCell } from '../../src/data/columns.ts'
import { buildPastedRows, guessMapping, matchHeader, parseClipboardTable } from '../../src/data/paste.ts'
import { createEmptyProject } from '../../src/data/projectFile.ts'
// The sample as it was when these tests were written (test/fixtures/olderSample.ts).
import { olderSample as sampleProject } from '../fixtures/olderSample.ts'

describe('clipboard text from Excel', () => {
  it('splits tabs and lines, handles quoted cells, drops blank lines', () => {
    const text = 'Nozzle Name\tDia\tNotes\r\nN5\t12 1/2\t"two\nlines, ""quoted"""\r\n\r\nN6\t4\t\r\n'
    expect(parseClipboardTable(text)).toEqual([
      ['Nozzle Name', 'Dia', 'Notes'],
      ['N5', '12 1/2', 'two\nlines, "quoted"'],
      ['N6', '4', ''],
    ])
  })

  it('one cell is one row of one cell', () => {
    expect(parseClipboardTable('N1')).toEqual([['N1']])
  })
})

describe('column mapping', () => {
  it('matches header titles, units and the v5.0 sheet names', () => {
    expect(matchHeader('shellNozzles', 'Nozzle Name')).toBe('id')
    expect(matchHeader('shellNozzles', 'Diameter (in)')).toBe('diameter')
    expect(matchHeader('shellNozzles', 'Dia')).toBe('diameter')
    expect(matchHeader('shellNozzles', 'Min. T')).toBe('minT')
    expect(matchHeader('shellNozzles', 'MinT')).toBe('minT')
    expect(matchHeader('shellNozzles', 'Label Mode')).toBe('labelMode')
    expect(matchHeader('headNozzles', 'Custom')).toBe('customRadiusPercent')
    expect(matchHeader('circWelds', 'Weld ID')).toBe('id')
    expect(matchHeader('circWelds', 'Label')).toBe('showLabel')
    expect(matchHeader('shellNozzles', 'Colour')).toBeNull()
  })

  it('a title row maps by name (in any order); without one, columns go in table order', () => {
    const titled = guessMapping('shellNozzles', parseClipboardTable('Y\tX\tNozzle Name\tColour\n1\t2\tN9\tred'))
    expect(titled).toEqual({ hasHeader: true, columns: ['y', 'x', 'id', null] })
    const plain = guessMapping('shellNozzles', parseClipboardTable('N9\t12\t30\t40'))
    expect(plain).toEqual({ hasHeader: false, columns: ['id', 'diameter', 'x', 'y'] })
  })
})

describe('building pasted rows', () => {
  it('reads every kind of value, lists rejected cells with reasons, names rows without a name', () => {
    const p = sampleProject() // has N1, N2, MW
    const rows = parseClipboardTable(
      ['Nozzle Name\tDia\tX\tY\tMin T\tNotes\tInclude\tLabel Mode', 'N7\t12 1/2\t10\t20\tTOL\tmanway\tYES\tinside', '\tabc\t-0\t5\t\t\tno\t', 'N1\t4\t1\t2\t0.5\t\t\tsideways'].join('\n'),
    )
    const r = buildPastedRows(p, 'shellNozzles', rows, guessMapping('shellNozzles', rows))
    expect(r.items.map((i) => [i.id, i.diameter, i.x, i.y, i.minT, i.notes, i.include, i.labelMode])).toEqual([
      ['N7', 12.5, 10, 20, 'TOL', 'manway', true, 'INSIDE'],
      ['N8', null, -0, 5, null, '', false, 'AUTO'],
      ['N1', 4, 1, 2, 0.5, '', true, 'AUTO'],
    ])
    expect(r.rejected).toEqual([
      { row: 3, column: 'Diameter', value: 'abc', reason: expect.stringContaining('is not a length') },
      { row: 4, column: 'Label mode', value: 'sideways', reason: expect.stringContaining('Use one of: Auto, Inside, Outside') },
    ])
    expect(r.notes).toEqual(['Row 3 has no nozzle name; it is named N8.'])
    expect(r.warnings).toEqual(['Row 4: "N1" is already in the job. Rename one of them after pasting.'])
  })

  it('values outside the schema range are rejected (diameter must be more than 0)', () => {
    const rows = [['N1', '0']]
    const r = buildPastedRows(createEmptyProject(), 'shellNozzles', rows, { hasHeader: false, columns: ['id', 'diameter'] })
    expect(r.rejected).toEqual([{ row: 1, column: 'Diameter', value: '0', reason: 'Must be more than 0. Left at its default.' }])
    expect(r.items[0].diameter).toBeNull()
  })

  it('head rows: heads, clocks, radius words; a name pasted twice is renamed', () => {
    const rows = parseClipboardTable('Head\tNozzle\tDia\tClock\tRadius\tCustom\n1\tH1\t2\t3:30\t3/4\t\n2\tH1\t2\t13\tcustom\t0.5')
    const r = buildPastedRows(createEmptyProject(), 'headNozzles', rows, guessMapping('headNozzles', rows))
    expect(r.items.map((i) => [i.head, i.id, i.clock, i.radiusPosition, i.customRadiusPercent])).toEqual([
      ['HEAD 1', 'H1', '3:30', 'THREE_QUARTER', null],
      ['HEAD 2', 'H1 (2)', null, 'CUSTOM', 0.5],
    ])
    expect(r.rejected.map((x) => [x.row, x.column])).toEqual([[3, 'Clock position']])
    expect(r.warnings).toEqual([
      'Row 3: "H1" is pasted twice; the second one is named H1 (2).',
      'Row 3: custom radius 0.5 is read as 0.5%. If it is a fraction of the radius (as in the old Excel sheet), enter 50 instead.',
    ])
  })

  it('without a name column every row is named', () => {
    const r = buildPastedRows(createEmptyProject(), 'circWelds', [['12'], ['24']], { hasHeader: false, columns: ['y'] })
    expect(r.items.map((i) => [i.id, i.y])).toEqual([['C1', 12], ['C2', 24]])
    expect(r.notes).toEqual(['No weld id column was chosen, so the rows were given names.'])
  })
})

describe('rows', () => {
  it('new names follow the last row and never repeat (shell and head nozzles together)', () => {
    const p = sampleProject() // shell N1, N2, MW; head N3, N4
    expect(nextId(p, 'circWelds')).toBe('C4')
    expect(nextId(p, 'shellNozzles')).toBe('N5') // MW has no number: N, then skip N1..N4
    expect(nextId(p, 'headNozzles')).toBe('N5')
    expect(nextId(createEmptyProject(), 'objects')).toBe('OBJ1')
    expect(copyId(p, 'shellNozzles', 'N1')).toBe('N1 (2)')
  })

  it('a new row has blank measurements and the schema defaults', () => {
    expect(newItem('headNozzles', 'X1', 'HEAD 2')).toEqual({
      head: 'HEAD 2', id: 'X1', diameter: null, clock: null, radiusPosition: 'CENTER', customRadiusPercent: null,
      minT: null, notes: '', labelMode: 'AUTO', include: true,
    })
  })

  it('a cell change is checked against the schema', () => {
    const item = newItem('headNozzles', 'X1')
    expect(setCell('headNozzles', item, 'customRadiusPercent', 120)).toEqual({ ok: false, problem: 'Must be at most 100.' })
    expect(setCell('headNozzles', item, 'id', '')).toEqual({ ok: false, problem: 'A name is needed. Enter one, like N1.' })
    expect(setCell('headNozzles', item, 'diameter', 6)).toMatchObject({ ok: true, item: { diameter: 6 } })
  })
})
