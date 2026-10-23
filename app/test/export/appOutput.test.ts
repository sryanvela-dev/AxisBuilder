import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeFingerprints } from './fingerprints.ts'

describe("the app's .lsp with every setting at its default", () => {
  it('is exactly what it was before the Drawing step (fingerprints of all golden jobs and the sample job)', () => {
    const saved = JSON.parse(readFileSync(new URL('./appOutput.sha256.json', import.meta.url), 'utf8')) as Record<string, string>
    expect(computeFingerprints()).toEqual(saved)
  })
})
