import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { openProject } from '../../src/data/index.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import {
  SECTION_NAMES,
  compareLsp,
  formatDiffs,
  joinLsp,
  normalizeLsp,
  splitLsp,
  type SectionName,
} from './lspSections.ts'

const golden = (job: string, file: string) => new URL(`./${job}/${file}`, import.meta.url)
// v5.0 writes ANSI; latin1 maps every byte to one character and back unchanged.
const readLsp = (job: string) => readFileSync(golden(job, 'v5.0.lsp')).toString('latin1')

describe('golden job REF1', () => {
  const lsp = readLsp('REF1')

  it('project.json loads and passes the schema', () => {
    const r = openProject(readFileSync(golden('REF1', 'project.json'), 'utf8'))
    if (!r.ok) throw new Error(r.errors.join('\n'))
    expect(r.project.scans.length).toBeGreaterThan(0)
    expect(r.project.settings.processedImageFolder).toBe('<PROCESSED_IMAGES>')
  })

  it('v5.0.lsp keeps v5.0 line endings and has no absolute paths', () => {
    expect(lsp.split('\n').length - 1).toBe(lsp.split('\r\n').length - 1)
    expect(lsp).not.toMatch(/"[A-Za-z]:[\\/]/)
  })

  it('splits into every section, in order, and joins back to the exact file', () => {
    const sections = splitLsp(lsp)
    expect(sections.map((s) => s.name)).toEqual([...SECTION_NAMES])
    expect(joinLsp(sections)).toBe(lsp)
    // REF1 has head views but no shell MUT or head MUT points: those sections hold only their comment.
    for (const s of sections) expect(s.text, s.name).not.toBe('')
  })

  it('puts each drawing call in its own section', () => {
    const byName = Object.fromEntries(splitLsp(lsp).map((s) => [s.name, s.text])) as Record<SectionName, string>
    expect(byName.welds).toMatch(/\(SL_CircWeld /)
    expect(byName.nozzles).toMatch(/\(SL_CircleSmart /)
    expect(byName.images).toMatch(/\(SL_InsertFitImage /)
    expect(byName.headNozzles).toMatch(/\(SL_HeadNozzle /)
    expect(byName.titleBlock).toMatch(/^ {2}\(SL_TitleBlock /)
    expect(byName.nozzles).not.toMatch(/SL_CircWeld|SL_HeadNozzle/)
  })

  it('finds no differences between the file and itself', () => {
    expect(compareLsp(lsp, lsp).every((d) => d.status === 'same')).toBe(true)
    expect(formatDiffs(compareLsp(lsp, lsp))).toBe('')
  })

  it('reports a one-character change in the right section and line', () => {
    const at = lsp.indexOf('(SL_CircWeld ')
    const lineNo = lsp.slice(0, at).split('\n').length
    const changed = lsp.slice(0, at) + '(SL_CircWelD ' + lsp.slice(at + '(SL_CircWeld '.length)
    const diffs = compareLsp(lsp, changed)
    expect(diffs.filter((d) => d.status !== 'same').map((d) => d.name)).toEqual(['welds'])
    const f = diffs.find((d) => d.name === 'welds')!.firstDifference!
    expect(f.expectedLine).toBe(lineNo)
    expect(f.actual).toContain('(SL_CircWelD ')
    expect(formatDiffs(diffs)).toMatch(/^\[welds\] first difference:\n {2}v5\.0 line \d+: .*\n {2}app {2}line \d+: /)
  })

  it('ignores only line endings, the timestamp and image folders', () => {
    const other = lsp
      .replace(/\r\n/g, '\n')
      .replace(/(;;; Generated from Excel on ).*/, '$1 2030-01-01 00:00:00')
      .replace(/"<PROCESSED_IMAGES>\/([^"]+)"/g, '"D:/Some/Other/Folder/$1"')
    expect(normalizeLsp(other)).toBe(normalizeLsp(lsp))
    expect(compareLsp(lsp, other.replace('vesselXLen 302.', 'vesselXLen 303.')).some((d) => d.status !== 'same')).toBe(true)
  })
})

// Per-section parity with v5.0. A section stays a todo until it is listed in ENABLED.
const ENABLED = new Set<SectionName>(SECTION_NAMES)

/**
 * Label differences allowed on purpose (REF1/README.md "Renamed for export"): v5.0 printed the
 * repeated name, the app prints the renamed one. Each must occur exactly once in its section.
 */
const ALLOWED: { section: SectionName; app: string; v5: string }[] = [
  { section: 'headNozzles', app: '"N1 (2)"', v5: '"N1"' },
]

/** The app output for REF1, with the allowed label differences put back to the v5.0 text. */
function ref1Output(compat?: 'v5.0'): string {
  const r = openProject(readFileSync(golden('REF1', 'project.json'), 'utf8'))
  if (!r.ok) throw new Error(r.errors.join('\n'))
  const out = exportLsp(r.project, {
    compat,
    processedImageFolder: '<PROCESSED_IMAGES>',
    // The golden file's own timestamp, so the whole file can be compared byte for byte.
    generatedAt: new Date(2026, 9, 22, 14, 49, 16),
  })
  const sections = splitLsp(out)
  for (const a of ALLOWED) {
    const sec = sections.find((x) => x.name === a.section)!
    const count = sec.text.split(a.app).length - 1
    if (count !== 1) throw new Error(`Allowed difference ${a.app} found ${count} times in ${a.section}; expected exactly once.`)
    sec.text = sec.text.replace(a.app, a.v5)
  }
  return joinLsp(sections)
}

describe('REF1 parity with v5.0 (exporter in v5.0 mode vs golden .lsp)', () => {
  const output = ref1Output('v5.0')
  const diffs = compareLsp(readLsp('REF1'), output)
  for (const name of SECTION_NAMES) {
    if (!ENABLED.has(name)) {
      it.todo(`section ${name} matches v5.0`)
      continue
    }
    it(`section ${name} matches v5.0`, () => {
      const diff = diffs.find((d) => d.name === name)!
      expect(diff.status, formatDiffs([diff])).toBe('same')
    })
  }

  it('matches the whole v5.0 file byte for byte (apart from the allowed label)', () => {
    expect(output === readLsp('REF1'), formatDiffs(diffs)).toBe(true)
  })
})

describe('REF1 app output: v5.0 plus the requested changes only', () => {
  const app = ref1Output()
  const diffs = compareLsp(readLsp('REF1'), app)

  it('differs from v5.0 only in the sections the changes touch', () => {
    // REF1 has no reversed or switched-off scans and shows its reference labels, so changes 1, 2 and 5
    // don't show here (unit tests cover them).
    expect(diffs.filter((d) => d.status !== 'same').map((d) => d.name)).toEqual(['header', 'jobSettings', 'images', 'titleBlock'])
  })

  it('drops the unused overlay values, names images by scan, prints the date as Oct-13-2026', () => {
    expect(app).not.toMatch(/SL_OVERLAY_PPI|SL_OVERLAY_SCALE/)
    expect(app).toContain('"<PROCESSED_IMAGES>/SCAN_1_FIT.png"')
    expect(app).not.toContain('_FIT_B12.png')
    expect(app).toContain('"DATE: Oct-13-2026"')
    expect(app).not.toContain('"DATE: 10/13/26"')
  })
})
