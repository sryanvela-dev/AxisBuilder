// pdf.js draws scanned PDF layers (CCITT fax / JBIG2 masks), JPEG 2000 and ICC colors only with its WebAssembly decoders.
// Without `wasmUrl` it leaves those layers out silently: an uploaded scanned form showed its table lines but no text.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('pdf.js decoders', () => {
  it('the screen opens every PDF with wasmUrl', () => {
    expect(read('src/ui/report/pdfPages.ts')).toMatch(/getDocument\(\{[^}]*wasmUrl: new URL\('\/pdfjs-wasm\/'/)
  })

  it('the build serves, copies and precaches the decoder files', () => {
    const config = read('vite.config.ts')
    const files = /PDFJS_WASM_FILES = \[([^\]]*)\]/.exec(config)?.[1].match(/[\w.]+\.wasm/g) ?? []
    expect(files).toEqual(['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm'])
    for (const name of files) expect(existsSync(new URL(`../../node_modules/pdfjs-dist/wasm/${name}`, import.meta.url))).toBe(true)
    expect(config).toContain('pdfjsWasm(),')
    expect(config).toMatch(/globPatterns: \['[^']*wasm\}'\]/)
  })
})
