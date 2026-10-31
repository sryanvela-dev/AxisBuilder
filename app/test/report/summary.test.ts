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
import { sampleWithReport } from './pages/fixture.ts'

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
