// The Summary step's logic (report/summary.ts): tiles, generated text, edits kept until Regenerate, sentences left out.
import { describe, expect, it } from 'vitest'
import { textParagraphs } from '../../src/report/pages/values.ts'
import {
  blockOn,
  editText,
  generatedText,
  isEdited,
  missingSentences,
  regenerateText,
  setScopeField,
  setTextBlock,
  shownText,
  summaryTiles,
} from '../../src/report/summary.ts'
import { templateOf } from '../../src/report/templates/registry.ts'
import { coverageLabel } from '../../src/engine/layout.ts'
import { reportCoverage } from '../../src/report/calc/results.ts'
import { pct } from '../../src/report/pages/values.ts'
import { buildReport } from '../../src/report/pages/index.ts'
import { scopeSummaryPageCount, SUMMARY_PAGE_LIMIT } from '../../src/report/pages/scopeSummary.ts'
import { checkReport } from '../../src/report/checks.ts'
import { fakeImages, sampleWithReport } from './pages/fixture.ts'

const NOW = '2026-10-31T12:00:00.000Z'

describe('summary tiles', () => {
  it('are the six figures the summary page prints, minimum and wall loss in the ladder colour', () => {
    const p = sampleWithReport()
    const tiles = summaryTiles(p, p.report!)
    expect(tiles.map((t) => t.label.split(' ')[0])).toEqual(['AUT', 'UT', 'AUT', 'Minimum,', 'Wall', 'Average'])
    expect(tiles[0].value).toBe(String(p.scans.length))
    expect(tiles[3].value).toBe('0.716"')
    expect(tiles[3].tone).toBe('deep') // 2.72% = No significant
    const q = sampleWithReport((x) => {
      x.report!.scanResults[0].minT = 0.4
    })
    expect(summaryTiles(q, q.report!)[4].tone).toBe('red')
  })
})

describe('generated text', () => {
  it('is the template blocks that are on, filled in, complete sentences only', () => {
    const p = sampleWithReport()
    const text = generatedText(p, p.report!, 'summary')
    expect(text).toMatch(/^A total of /)
    expect(text).toContain('The minimum thickness found with AUT was 0.716"')
    expect(text.split('\n\n')).toHaveLength(textParagraphs(p, p.report!, templateOf('generic-aut'), 'summary').filter((x) => x.complete).length)
  })

  it('switches a block off and on; the template default removes the choice; a group switches together', () => {
    const p = sampleWithReport()
    const off = setTextBlock(p, 'summary', 'summary-closing', false)
    expect(off.report!.text.summary.blocks).toEqual({ 'summary-closing': false })
    expect(generatedText(off, off.report!, 'summary')).not.toContain('See the following scan sheet')
    expect(setTextBlock(off, 'summary', 'summary-closing', true).report!.text.summary.blocks).toEqual({})
    expect(setTextBlock(p, 'summary', 'summary-closing', true)).toBe(p)
    const findings = setTextBlock(p, 'summary', 'summary-findings-0', false).report!
    expect(Object.keys(findings.text.summary.blocks).sort()).toEqual(['summary-findings-0', 'summary-findings-1', 'summary-findings-2', 'summary-findings-3'])
    const def = templateOf('generic-aut').textBlocks.find((b) => b.id === 'scope-limitations')!
    expect(blockOn(p.report!, def)).toBe(false)
  })

  it('lists sentences left out with the blank values they need; the scope fields fill them', () => {
    const p = sampleWithReport((q) => {
      q.report!.text.scope.fields = { purpose: '', areaCovered: '', limitations: '' }
    })
    const m = missingSentences(p, p.report!, 'scope')
    expect(m.map((x) => [x.block.id, x.fields])).toEqual([['scope-purpose', ['purpose', 'areaCovered']]])
    const q = setScopeField(setScopeField(p, 'purpose', 'map the wall'), 'areaCovered', 'the shell')
    expect(missingSentences(q, q.report!, 'scope')).toEqual([])
    expect(generatedText(q, q.report!, 'scope')).toContain('The purpose of this examination was to map the wall in the shell.')
    expect(setScopeField(q, 'purpose', 'map the wall')).toBe(q)
  })
})

describe('editing and Regenerate', () => {
  it('keeps text edited by hand, flags it, and never replaces it when the data changes', () => {
    const p = sampleWithReport()
    const e = editText(p, 'summary', 'Our own summary.\n\nSecond paragraph.', NOW)
    expect(isEdited(e.report!, 'summary')).toBe(true)
    expect(e.report!.text.summary.editedAt).toBe(NOW)
    expect(shownText(e, e.report!, 'summary')).toBe('Our own summary.\n\nSecond paragraph.')
    // The data changes: the edit stays.
    const changed = { ...e, report: { ...e.report!, scanResults: e.report!.scanResults.map((s, i) => (i === 0 ? { ...s, minT: 0.5 } : s)) } }
    expect(shownText(changed, changed.report!, 'summary')).toBe('Our own summary.\n\nSecond paragraph.')
    expect(generatedText(changed, changed.report!, 'summary')).toContain('0.500"')
    // Missing sentences aren't listed while the text is the user's.
    expect(missingSentences(changed, changed.report!, 'summary')).toEqual([])
  })

  it('text equal to the generated, or blank, is not an edit', () => {
    const p = sampleWithReport()
    const gen = generatedText(p, p.report!, 'scope')
    expect(editText(p, 'scope', `${gen}  \n`, NOW)).toBe(p)
    expect(editText(p, 'scope', '   ', NOW)).toBe(p)
    const e = editText(p, 'scope', 'Mine.', NOW)
    expect(e.report!.text.scope.edited).toBe('Mine.')
    expect(editText(e, 'scope', gen, NOW).report!.text.scope.edited).toBeNull()
  })

  it('Regenerate drops the edit and marks the time; nothing to regenerate changes nothing', () => {
    const p = sampleWithReport()
    const e = editText(p, 'summary', 'Mine.', NOW)
    const later = '2026-11-01T08:00:00.000Z'
    const r = regenerateText(e, 'summary', later)
    expect(r.report!.text.summary).toMatchObject({ edited: null, editedAt: null, generatedAt: later })
    expect(shownText(r, r.report!, 'summary')).toBe(generatedText(p, p.report!, 'summary'))
    expect(regenerateText(p, 'summary', later)).toBe(p)
  })
})

describe('coverage is the shell, AUT and MUT areas apart', () => {
  it('with shell MUT areas: the sentence and tile give the MUT part and the drawing total; the AUT figure stays AUT only', () => {
    const p = sampleWithReport()
    const cov = reportCoverage(p)!
    expect(cov.mutArea).toBeGreaterThan(0)
    const text = generatedText(p, p.report!, 'summary')
    expect(text).toContain(`approximately ${pct(cov.autPercent)}`)
    expect(text).toContain('shell.')
    expect(text).toContain(`Manual UT areas covered a further ${pct(cov.mutPercent)}`)
    expect(text).toContain(`for a total of ${pct(cov.combinedPercent)}.`)
    const tile = summaryTiles(p, p.report!)[2]
    expect(tile.value).toBe(pct(cov.autPercent))
    expect(tile.label).toBe(`AUT shell coverage; +${pct(cov.mutPercent)} MUT areas = ${pct(cov.combinedPercent)} total`)
    // The drawing prints the same total, and says what it is.
    expect(coverageLabel(cov.combinedPercent, cov.mutArea)).toMatch(/^Shell coverage \(AUT \+ MUT\): /)
  })

  it('without MUT areas: no MUT sentence and no note about it; the drawing label is as before', () => {
    const p = sampleWithReport((q) => {
      q.shellMut = q.shellMut.map((m) => ({ ...m, area: null }))
      q.headMut = q.headMut.map((m) => ({ ...m, area: null }))
    })
    expect(reportCoverage(p)!.mutArea).toBe(0)
    expect(generatedText(p, p.report!, 'summary')).not.toContain('Manual UT areas')
    expect(missingSentences(p, p.report!, 'summary').map((m) => m.block.id)).not.toContain('summary-mut')
    expect(summaryTiles(p, p.report!)[2].label).toMatch(/^AUT shell coverage \(/)
    expect(coverageLabel(62.44, 0)).toBe('Coverage: 62.4%')
  })
})

describe('a long scope and summary', () => {
  const long = (n: number) => Array.from({ length: n }, (_, i) => `Paragraph ${i + 1}: the AUT examination found the areas listed in the scan sheet, and each is described here in full.`).join('\n\n')

  it('flows onto more pages, marked continued; Review notes it, never blocking', () => {
    let p = sampleWithReport()
    expect(scopeSummaryPageCount({ p, r: p.report!, t: templateOf(p.report!.templateId) })).toBe(1)
    p = editText(p, 'summary', long(30), '2026-10-31T00:00:00Z')
    const n = scopeSummaryPageCount({ p, r: p.report!, t: templateOf(p.report!.templateId) })
    expect(n).toBeGreaterThan(1)
    const d = buildReport({ project: p, image: fakeImages })
    const pages = d.pages.filter((x) => x.sectionId === 'scope-summary')
    expect(pages).toHaveLength(n)
    expect(pages[1].items.some((i) => i.t === 'text' && i.text === 'Summary (continued)')).toBe(true)
    const note = checkReport(p).find((c) => c.text.startsWith('The Scope & Summary runs onto'))
    expect(note).toMatchObject({ severity: 'note', text: `The Scope & Summary runs onto ${n} pages.` })
  })

  it('past the page limit the rest is left out with a note, never silently', () => {
    const p = editText(sampleWithReport(), 'summary', long(400), '2026-10-31T00:00:00Z')
    const d = buildReport({ project: p, image: fakeImages })
    expect(d.pages.filter((x) => x.sectionId === 'scope-summary')).toHaveLength(SUMMARY_PAGE_LIMIT)
    expect(d.notes.some((x) => /Scope & Summary: \d+ lines past 20 pages left out/.test(x))).toBe(true)
  })
})
