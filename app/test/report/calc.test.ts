import { describe, expect, it } from 'vitest'
import { buildComment, formatWallLoss, ladderBand, ladderColor, wallLossPercent, type CommentPicks } from '../../src/report/calc/ladder.ts'
import { correctedThickness, countText, numberInWords, readingsFromIncrements, temperatureCorrected } from '../../src/report/calc/numbers.ts'
import { NPS_SIZES, PIPE_SIZES, pickPipeWall, pipeSize, wallLabel } from '../../src/report/calc/pipeWalls.ts'
import { blockApplies, fillText, placeholders, TEXT_FIELDS } from '../../src/report/calc/textFill.ts'
import { GENERIC_AUT } from '../../src/report/templates/generic.ts'
import { findTemplate, TEMPLATES } from '../../src/report/templates/registry.ts'
import { PAGE_TYPES } from '../../src/report/templates/types.ts'

const ladder = GENERIC_AUT.ladder
const picks = (p: Partial<CommentPicks> = {}): CommentPicks => ({
  severityOverride: null, form: '', cause: '', surface: 'ID', midWall: 'none', commentOverride: null, ...p,
})

describe('wall loss', () => {
  it('is measured against the row’s own nominal', () => {
    expect(wallLossPercent(0.716, 0.736)).toBeCloseTo(2.7174, 4)
    expect(formatWallLoss(wallLossPercent(0.716, 0.736)!)).toBe('2.72%')
    expect(wallLossPercent(0.8, 0.736)).toBeCloseTo(-8.696, 3)
    expect(wallLossPercent(null, 0.736)).toBeNull()
    expect(wallLossPercent(0.5, null)).toBeNull()
    expect(wallLossPercent(0.5, 0)).toBeNull()
  })
})

describe('ladder', () => {
  const cut = [5, 16, 30]
  it('bands at 5 / 16 / 30, upper edge inclusive, negative in the first band', () => {
    expect([-10, 0, 5, 5.001, 5.01, 16, 16.01, 30, 30.01, 80].map((w) => ladderBand(w, cut))).toEqual([0, 0, 0, 0, 1, 1, 2, 2, 3, 3])
  })
  it('takes other cutoffs', () => {
    expect(ladderBand(12, [10, 20, 40])).toBe(1)
    expect(ladderBand(45, [10, 20, 40])).toBe(3)
  })
  it('colors No significant and Minor normal, Moderate amber, Significant red', () => {
    expect([0, 1, 2, 3].map((b) => ladderColor(ladder, b))).toEqual(['normal', 'normal', 'amber', 'red'])
  })
})

describe('comment builder (design 4.3.1)', () => {
  it('writes the examples in the design', () => {
    expect(buildComment(ladder, 0, picks()).text).toBe('No significant I.D. wall loss detected.')
    expect(buildComment(ladder, 1, picks({ form: 'localized', cause: 'corrosion' })).text).toBe('Minor localized I.D. corrosion detected.')
    expect(buildComment(ladder, 2, picks({ form: 'pitting' })).text).toBe('Moderate I.D. pitting detected.')
    expect(buildComment(ladder, 3, picks({ form: 'general', cause: 'erosion', midWall: 'lamination' })).text)
      .toBe('Significant general I.D. erosion detected. Mid-wall lamination detected.')
  })
  it('writes a picked mid-wall indication once, in lower case', () => {
    expect(buildComment(ladder, 0, picks({ midWall: 'midWall' })).text).toBe('No significant I.D. wall loss detected. Mid-wall indication detected.')
    expect(buildComment(ladder, 0, picks({ midWall: 'hydrogenBlistering' })).text).toContain('Mid-wall hydrogen blistering detected.')
  })
  it('puts a pitting form after the surface, with a picked cause', () => {
    expect(buildComment(ladder, 2, picks({ form: 'pitting', cause: 'corrosion' })).text).toBe('Moderate I.D. pitting corrosion detected.')
    expect(buildComment(ladder, 1, picks({ form: 'localizedPitting', surface: 'OD' })).text).toBe('Minor O.D. localized pitting detected.')
    expect(buildComment(ladder, 1, picks({ cause: 'corrosionErosion' })).text).toBe('Minor I.D. corrosion-erosion detected.')
  })
  it('never names the wall loss figure or a cause not picked', () => {
    const t = buildComment(ladder, 3, picks()).text
    expect(t).toBe('Significant I.D. wall loss detected.')
    expect(t).not.toMatch(/\d|corrosion/)
  })
  it('flags a severity override that differs from the ladder, and free text', () => {
    const o = buildComment(ladder, 0, picks({ severityOverride: 'minor' }))
    expect(o.text).toBe('Minor I.D. wall loss detected.')
    expect(o.severityOverridden).toBe(true)
    expect(buildComment(ladder, 1, picks({ severityOverride: 'minor' })).severityOverridden).toBe(false)
    const f = buildComment(ladder, 0, picks({ commentOverride: '  See note.  ' }))
    expect(f).toMatchObject({ text: 'See note.', freeText: true })
    expect(buildComment(ladder, 0, picks({ commentOverride: ' ' })).freeText).toBe(false)
  })
})

describe('temperature correction', () => {
  it('is UT x (1.007 - 0.0001 x T)', () => {
    expect(temperatureCorrected(0.5, 250)).toBeCloseTo(0.5 * 0.982, 10)
    expect(temperatureCorrected(1, 70)).toBeCloseTo(1, 10)
  })
  it('is applied only when on and a temperature is entered', () => {
    expect(correctedThickness(0.5, { on: true, tempF: 250 })).toBeCloseTo(0.491, 10)
    expect(correctedThickness(0.5, { on: false, tempF: 250 })).toBe(0.5)
    expect(correctedThickness(0.5, { on: true, tempF: null })).toBe(0.5)
    expect(correctedThickness(null, { on: true, tempF: 250 })).toBeNull()
  })
})

describe('readings from position and increment', () => {
  it('is (|dX| / incrX + 1) x (|dY| / incrY + 1)', () => {
    expect(readingsFromIncrements(72, 20, 0.125, 0.05)).toBe(231377)
    expect(readingsFromIncrements(-31, 20, 0.125, 0.05)).toBe(99849)
    expect(readingsFromIncrements(15, 19, 0.125, 0.05)).toBe(46101)
    expect(readingsFromIncrements(0.3, 0, 0.125, 0.05)).toBe(3)
  })
  it('is blank without an increment', () => {
    expect(readingsFromIncrements(72, 20, null, 0.05)).toBeNull()
    expect(readingsFromIncrements(72, 20, 0, 0.05)).toBeNull()
  })
})

describe('numbers in words', () => {
  it('writes counts as the summary does', () => {
    expect(countText(17)).toBe('seventeen (17)')
    expect(countText(17, false)).toBe('17')
    expect(countText(3171045)).toBe('3,171,045')
    expect([0, 1, 13, 20, 42, 100, 115, 999, 1000, 1001, 2045, 12000, 999_999].map(numberInWords)).toEqual([
      'zero', 'one', 'thirteen', 'twenty', 'forty-two', 'one hundred', 'one hundred fifteen',
      'nine hundred ninety-nine', 'one thousand', 'one thousand one', 'two thousand forty-five', 'twelve thousand',
      'nine hundred ninety-nine thousand nine hundred ninety-nine',
    ])
    expect(() => numberInWords(1.5)).toThrow()
  })
})

describe('pipe walls (B36.10M / B36.19M)', () => {
  it('covers NPS 1/2 to 24, thinnest first, ODs increasing', () => {
    expect(NPS_SIZES[0]).toBe('1/2')
    expect(NPS_SIZES.at(-1)).toBe('24')
    expect(NPS_SIZES).toContain('3-1/2')
    for (const s of PIPE_SIZES) {
      for (let i = 1; i < s.walls.length; i++) expect(s.walls[i].wall).toBeGreaterThan(s.walls[i - 1].wall)
      for (const n of ['STD', 'XS', '40S', '80S', '5S', '10S']) expect(s.walls.some((w) => w.names.includes(n)), `${s.nps} ${n}`).toBe(true)
    }
    for (let i = 1; i < PIPE_SIZES.length; i++) expect(PIPE_SIZES[i].od).toBeGreaterThan(PIPE_SIZES[i - 1].od)
  })
  it('holds the values the picks depend on', () => {
    const wall = (nps: string, name: string) => pipeSize(nps)!.walls.find((w) => w.names.includes(name))?.wall
    expect(wall('4', 'STD')).toBe(0.237)
    expect(wall('4', 'XS')).toBe(0.337)
    expect(wall('2', '160')).toBe(0.344)
    expect(wall('12', 'STD')).toBe(0.375)
    expect(wall('12', '40')).toBe(0.406)
    expect(wall('10', 'XS')).toBe(0.5)
    expect(wall('10', '80')).toBe(0.594)
    expect(wall('8', 'XXS')).toBe(0.875)
    expect(wall('24', '160')).toBe(2.344)
    expect(pipeSize('4')!.walls.find((w) => w.wall === 0.337)!.names).toEqual(['XS', '80', '80S'])
  })
  it('picks the heaviest wall with the thickest reading at least 87.5% of it (design examples)', () => {
    const xs = pickPipeWall('4', 0.32)!
    expect(wallLabel(xs.wall)).toBe('XS, 0.337 in')
    expect(xs.flagged).toBe(false)
    expect(wallLabel(pickPipeWall('4', 0.25)!.wall)).toBe('STD, 0.237 in')
    expect(wallLabel(pickPipeWall('4', 0.465)!.wall)).toBe('Sch 160, 0.531 in')
  })
  it('flags a thickest reading more than 15% over the pick', () => {
    expect(pickPipeWall('4', 0.29)!.wall.wall).toBe(0.237)
    expect(pickPipeWall('4', 0.28)!.flagged).toBe(true)
    expect(pickPipeWall('4', 0.27)!.flagged).toBe(false)
  })
  it('takes the thinnest wall for a very thin reading, nothing for an unknown size or no reading', () => {
    expect(pickPipeWall('4', 0.05)!.wall.wall).toBe(0.083)
    expect(pickPipeWall('4-1/2', 0.3)).toBeNull()
    expect(pickPipeWall('4', null)).toBeNull()
  })
})

describe('text blocks', () => {
  it('fills placeholders and leaves unknown ones as written', () => {
    expect(fillText('A total of {scanCount} AUT scans on {equipment}.', { scanCount: 'seventeen (17)' }))
      .toBe('A total of seventeen (17) AUT scans on {equipment}.')
    expect(placeholders('{a} and {b}')).toEqual(['a', 'b'])
  })
  it('reads conditions', () => {
    expect(blockApplies(undefined, {})).toBe(true)
    expect(blockApplies('band=2', { band: 2 })).toBe(true)
    expect(blockApplies('band=2', { band: 1 })).toBe(false)
    expect(blockApplies('manualReadings>0', { manualReadings: 0 })).toBe(false)
    expect(blockApplies('manualReadings>0', {})).toBe(false)
    expect(blockApplies('nonsense', { band: 0 })).toBe(false)
  })
})

describe('templates', () => {
  it('Generic AUT is registered', () => {
    expect(findTemplate('generic-aut')).toBe(GENERIC_AUT)
    expect(findTemplate('xto-hzl')).toBeUndefined()
  })
  for (const t of TEMPLATES) {
    describe(t.name, () => {
      it('has unique section ids and known page types', () => {
        expect(new Set(t.sections.map((s) => s.id)).size).toBe(t.sections.length)
        for (const s of t.sections) expect(PAGE_TYPES).toContain(s.pageType)
        for (const f of t.fixedPages) expect(t.sections.some((s) => s.id === f.sectionId && s.pageType === 'fixedText')).toBe(true)
      })
      it('has one severity and one color per ladder band', () => {
        expect(t.ladder.severity).toHaveLength(t.ladder.cutoffs.length + 1)
        expect(t.ladder.colors).toHaveLength(t.ladder.cutoffs.length + 1)
        expect(t.ladder.causes.some((c) => c.id === '')).toBe(true)
        expect(t.ladder.forms.some((c) => c.id === '')).toBe(true)
      })
      it('uses only known placeholders and unique block ids', () => {
        expect(new Set(t.textBlocks.map((b) => b.id)).size).toBe(t.textBlocks.length)
        for (const b of t.textBlocks) for (const name of placeholders(b.text)) expect(TEXT_FIELDS, `${b.id}: {${name}}`).toContain(name)
      })
    })
  }
  it('Generic sections are in the reference report order', () => {
    expect(GENERIC_AUT.sections.map((s) => s.id)).toEqual([
      'cover', 'contents', 'scope-summary', 'calibration', 'photos', 'drawings', 'scan-sheet', 'manual-ut', 'cscan',
      'custom', 'reference', 'equipment', 'guide',
    ])
    expect(GENERIC_AUT.ladder.cutoffs).toEqual([5, 16, 30])
    expect(GENERIC_AUT.scanColumns.map((c) => c.header)).not.toContain('File Name')
  })
})
