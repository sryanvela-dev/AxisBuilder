// The report switch (src/featureFlags.ts): on in dev, tests and Pages previews; off in the production build of main.
import { describe, expect, it } from 'vitest'
import { MARKUP_ENABLED, REPORT_ENABLED, markupEnabledFor, reportEnabledFor } from '../src/featureFlags.ts'

describe('REPORT_ENABLED', () => {
  it('is on in the tests', () => {
    expect(REPORT_ENABLED).toBe(true)
  })

  it('is on for the dev server and the tests', () => {
    expect(reportEnabledFor({ command: 'serve', test: false })).toBe(true)
    expect(reportEnabledFor({ command: 'build', test: true })).toBe(true)
  })

  it('is on for a Pages preview build and off for the production build of main', () => {
    expect(reportEnabledFor({ command: 'build', test: false, pagesBranch: 'feature/report-r2' })).toBe(true)
    expect(reportEnabledFor({ command: 'build', test: false, pagesBranch: 'main' })).toBe(false)
    // A local `npm run build` is the production build.
    expect(reportEnabledFor({ command: 'build', test: false })).toBe(false)
    expect(reportEnabledFor({ command: 'build', test: false, pagesBranch: '' })).toBe(false)
  })

  it('follows VITE_REPORT whatever the rest says', () => {
    expect(reportEnabledFor({ command: 'build', test: false, pagesBranch: 'main', override: '1' })).toBe(true)
    expect(reportEnabledFor({ command: 'serve', test: false, override: '0' })).toBe(false)
    expect(reportEnabledFor({ command: 'build', test: true, override: 'off' })).toBe(false)
    expect(reportEnabledFor({ command: 'build', test: false, override: 'on' })).toBe(true)
    // Anything else is ignored.
    expect(reportEnabledFor({ command: 'build', test: false, pagesBranch: 'main', override: 'maybe' })).toBe(false)
  })
})

describe('MARKUP_ENABLED', () => {
  it('is on in the tests', () => {
    expect(MARKUP_ENABLED).toBe(true)
  })

  it('follows the report rule: on for dev, tests and Pages previews, off for the production build of main', () => {
    expect(markupEnabledFor({ command: 'serve', test: false })).toBe(true)
    expect(markupEnabledFor({ command: 'build', test: true })).toBe(true)
    expect(markupEnabledFor({ command: 'build', test: false, pagesBranch: 'feature/report-r5' })).toBe(true)
    expect(markupEnabledFor({ command: 'build', test: false, pagesBranch: 'main' })).toBe(false)
    expect(markupEnabledFor({ command: 'build', test: false })).toBe(false)
  })

  it('follows VITE_MARKUP whatever the rest says', () => {
    expect(markupEnabledFor({ command: 'build', test: false, pagesBranch: 'main', override: '1' })).toBe(true)
    expect(markupEnabledFor({ command: 'serve', test: false, override: '0' })).toBe(false)
    expect(markupEnabledFor({ command: 'build', test: false, pagesBranch: 'main', override: 'maybe' })).toBe(false)
  })
})
