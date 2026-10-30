// Manual readings pasted from Excel (report/readingPaste.ts).
import { describe, expect, it } from 'vitest'
import { buildReadingPaste, guessReadingMapping } from '../../src/report/readingPaste.ts'

describe('reading paste', () => {
  it('guesses columns by header and reads thicknesses with fractions', () => {
    const rows = [['Name', 'Location', "Min 'T'", 'Nominal', 'Other'], ['Nozzle 3', 'North', '0.312', '3/8', 'x'], ['', '', '', '', '']]
    const m = guessReadingMapping(rows)
    expect(m).toEqual({ hasHeader: true, columns: ['name', 'location', 'minT', 'nominal', null] })
    const r = buildReadingPaste(rows, m)
    expect(r.rows).toEqual([{ name: 'Nozzle 3', location: 'North', minT: 0.312, nominal: 0.375, nominalMode: 'custom' }])
    expect(r.rejected).toEqual([])
  })

  it('without titles takes the columns in order; bad cells are listed and left blank', () => {
    const rows = [['N1', 'Top', 'MUT scan', 'abc', '0.5']]
    const m = guessReadingMapping(rows)
    expect(m.hasHeader).toBe(false)
    expect(m.columns).toEqual(['name', 'location', 'type', 'minT', 'avgT'])
    const r = buildReadingPaste(rows, m)
    expect(r.rows).toEqual([{ name: 'N1', location: 'Top', type: 'MUT scan', avgT: 0.5, nominalMode: 'component' }])
    expect(r.rejected).toEqual([{ row: 1, column: "Min 'T'", value: 'abc', reason: 'Not a thickness in inches.' }])
    expect(buildReadingPaste([['N1', '', 'ultra']], m).rejected[0].reason).toMatch(/UTT or MUT scan/)
  })
})
