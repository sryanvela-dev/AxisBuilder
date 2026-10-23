import { describe, expect, it } from 'vitest'
import { describeClock, parseClock, parseHead, parseLabelMode, parseLength, parseNozzleMinT, parseNumber, parseRadius, parseYesNo } from '../../src/data/parse.ts'

const value = (r: ReturnType<typeof parseLength>) => (r.ok ? r.value : `problem: ${r.problem}`)

describe('lengths', () => {
  it.each([
    ['12.5', 12.5],
    ['12', 12],
    ['.5', 0.5],
    ['12 1/2', 12.5],
    ['12-1/2', 12.5],
    ['12 - 1/2', 12.5],
    ['3/8', 0.375],
    ['12 1/2"', 12.5],
    ['12.5 in', 12.5],
    ['-6', -6],
    ['-1 1/2', -1.5],
    ["10'", 120],
    ["10' 6\"", 126],
    ["10'-6", 126],
    ["10'-6 1/2\"", 126.5],
    ['10 ft 6 in', 126],
    ['2.5 ft', 30],
    ['', null],
    ['  ', null],
  ])('"%s" is %s in', (text, expected) => {
    expect(value(parseLength(text))).toBe(expected)
  })

  it('shows how a fraction or feet were read, not a plain number', () => {
    expect(parseLength('12 1/2')).toEqual({ ok: true, value: 12.5, note: '12 1/2 = 12.5 in' })
    expect(parseLength("10' 6\"")).toEqual({ ok: true, value: 126, note: "10' 6\" = 126 in" })
    expect(parseLength('12.5')).toEqual({ ok: true, value: 12.5 })
  })

  it.each(['abc', '12..5', '1/0', '12 1/', 'twelve', '-'])('"%s" is not a length, with a hint how to write one', (text) => {
    const r = parseLength(text)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problem).toContain('12 1/2')
  })

  it('a decimal comma gets its own explanation', () => {
    expect(parseLength('12,5')).toEqual({ ok: false, problem: 'Use a point for decimals ("12.5"), not a comma.' })
  })
})

describe('other values', () => {
  it('numbers and percent', () => {
    expect(parseNumber('50')).toEqual({ ok: true, value: 50 })
    expect(parseNumber('50 %')).toEqual({ ok: true, value: 50 })
    expect(parseNumber('')).toEqual({ ok: true, value: null })
    expect(parseNumber('x').ok).toBe(false)
  })

  it('head clock positions are kept as written and explained', () => {
    expect(parseClock('3:30')).toEqual({ ok: true, value: '3:30', note: "3:30 = 3.5 o'clock" })
    expect(parseClock('3.5')).toEqual({ ok: true, value: '3.5', note: "3.5 = 3:30 o'clock" })
    expect(parseClock('3')).toEqual({ ok: true, value: '3', note: "3 o'clock" })
    expect(parseClock("3 o'clock")).toMatchObject({ ok: true, value: '3' })
    expect(parseClock('3:30:00')).toMatchObject({ ok: true, value: '3:30' })
    expect(parseClock('3:30 AM')).toMatchObject({ ok: true, value: '3:30' })
    expect(parseClock('')).toEqual({ ok: true, value: null })
    expect(describeClock('10:20')).toBe("10:20 = 10.3333 o'clock")
    expect(describeClock('12.5')).toBe("12.5 = 12:30 o'clock")
  })

  it.each(['13', '0', '3:75', 'abc'])('clock "%s" is refused with a hint', (t) => {
    const r = parseClock(t)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problem).toContain('like 3, 3:30 or 3.5')
  })

  it('degrees are refused with their own reason', () => {
    const r = parseClock('90°')
    expect(!r.ok && r.problem).toContain('Degrees are not used')
  })

  it('yes/no, choices and Min. T', () => {
    expect(['YES', 'y', 'x', 'True', '1'].map((t) => parseYesNo(t))).toEqual(Array(5).fill({ ok: true, value: true }))
    expect(['NO', 'n', 'false', '0'].map((t) => parseYesNo(t))).toEqual(Array(4).fill({ ok: true, value: false }))
    expect(parseYesNo('maybe').ok).toBe(false)
    expect(parseHead('1')).toEqual({ ok: true, value: 'HEAD 1' })
    expect(parseHead('Head 2')).toEqual({ ok: true, value: 'HEAD 2' })
    expect(parseRadius('3/4')).toEqual({ ok: true, value: 'THREE_QUARTER' })
    expect(parseRadius('three quarter')).toEqual({ ok: true, value: 'THREE_QUARTER' })
    expect(parseRadius('center')).toEqual({ ok: true, value: 'CENTER' })
    expect(parseRadius('middle').ok).toBe(false)
    expect(parseLabelMode('outside')).toEqual({ ok: true, value: 'OUTSIDE' })
    expect(parseNozzleMinT('tol')).toEqual({ ok: true, value: 'TOL' })
    expect(parseNozzleMinT('3/8')).toMatchObject({ ok: true, value: 0.375 })
    expect(parseNozzleMinT('thin').ok).toBe(false)
  })
})
