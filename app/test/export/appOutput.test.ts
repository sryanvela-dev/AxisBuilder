import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeFingerprints } from './fingerprints.ts'

describe("the app's .lsp with every setting at its default", () => {
  // Fingerprints of the approved app output (all golden jobs and the sample job). New settings must not change
  // it; regenerate (scripts/app-output-fingerprints.ts) only after an approved output change, last: Phase 3f-1
  // layer splits (phase2-notes change 17).
  it('is the approved app output (fingerprints of all golden jobs and the sample job)', () => {
    const saved = JSON.parse(readFileSync(new URL('./appOutput.sha256.json', import.meta.url), 'utf8')) as Record<string, string>
    expect(computeFingerprints()).toEqual(saved)
  })
})
