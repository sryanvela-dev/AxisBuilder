import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STEPS } from '../../src/state/steps.ts'
import { errorDetails, problemDetails } from '../../src/ui/errorDetails.ts'
import { GUIDE_FILES, GUIDE_KEYS, GUIDE_STEPS } from '../../src/ui/helpText.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'
import { SUPPORT_EMAIL, problemMailto } from '../../src/ui/support.ts'

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string

describe('Report a problem', () => {
  it('the report has the app version, the screen and the last error', () => {
    expect(problemDetails('Start screen')).toContain('No error shown since the app was opened.')
    errorDetails(new Error('Something broke in the sheet model'), 'Drawing step')
    const text = problemDetails('Export step')
    expect(text).toContain(`App version: ${version}`)
    expect(text).toContain('Screen: Export step')
    expect(text).toContain('Last error:')
    expect(text).toContain('Error: Something broke in the sheet model')
    expect(text).toContain('Screen: Drawing step')
  })

  it('holds no job data (it is never given the project)', () => {
    const p = sampleProject()
    errorDetails(new Error('boom'), 'Field data step')
    const text = problemDetails('Field data step')
    for (const v of [p.project.projectName, p.project.client, p.project.inspector, p.project.component, p.project.unit]) {
      expect(text).not.toContain(v)
    }
  })

  it('opens an email to the one support address with the details in it, cut short when long', () => {
    const short = problemMailto('App version: 1\nError: x')
    expect(short.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`)).toBe(true)
    expect(decodeURIComponent(short.split('&body=')[1])).toContain('App version: 1\nError: x')
    const long = problemMailto(`App version: 1\n${'x'.repeat(5000)}`)
    const body = decodeURIComponent(long.split('&body=')[1])
    expect(body.length).toBeLessThan(1800)
    expect(body).toContain('the full details are on the clipboard')
  })

  it('the support address is written in one place only', () => {
    for (const f of ['ui/HelpGuide.tsx', 'ui/ReportProblem.tsx', 'ui/ErrorBoundary.tsx', 'ui/helpText.ts']) {
      expect(readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8'), f).not.toContain('integrityepc.com')
    }
  })
})

describe('quick guide', () => {
  it('has a paragraph for every step, the export files and the keys', () => {
    for (const s of STEPS) expect(GUIDE_STEPS[s.id].length, s.id).toBeGreaterThan(40)
    expect(GUIDE_FILES.map((f) => f.name).join(' ')).toMatch(/PDF[^]*DXF[^]*\.lsp/)
    const keys = GUIDE_KEYS.flatMap((g) => g.keys.map(([k]) => k)).join(' ')
    for (const k of ['Ctrl+Z', 'Ctrl+Y', 'Esc', 'Shift', 'Backspace', 'Enter']) expect(keys).toContain(k)
  })
})
