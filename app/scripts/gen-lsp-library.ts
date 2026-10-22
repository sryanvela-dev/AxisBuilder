// Writes src/export/lsp/library.generated.ts from the v5.0 VBA. Run: npm run gen:lsp-library
import { readFileSync, writeFileSync } from 'node:fs'
import { generateLibrary } from './lspLibraryGen.ts'

const bas = readFileSync(new URL('../../src/SLG_Utilities.bas', import.meta.url)).toString('latin1')
writeFileSync(new URL('../src/export/lsp/library.generated.ts', import.meta.url), generateLibrary(bas))
console.log('Wrote src/export/lsp/library.generated.ts')
