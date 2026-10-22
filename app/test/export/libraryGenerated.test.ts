import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generateLibrary } from '../../scripts/lspLibraryGen.ts'

describe('library.generated.ts', () => {
  it('matches the v5.0 VBA (run `npm run gen:lsp-library` if this fails)', () => {
    const bas = readFileSync(new URL('../../../src/SLG_Utilities.bas', import.meta.url)).toString('latin1')
    const committed = readFileSync(new URL('../../src/export/lsp/library.generated.ts', import.meta.url), 'utf8')
    expect(committed.replace(/\r\n/g, '\n')).toBe(generateLibrary(bas))
  })

  it('stops on VBA it does not understand', () => {
    const bas = ['Private Sub WriteLispHeader(ByVal f As Integer)', '    x = 1', 'End Sub'].join('\r\n')
    expect(() => generateLibrary(bas)).toThrow('unsupported statement: x = 1')
  })
})
