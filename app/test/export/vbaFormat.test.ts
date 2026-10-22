import { describe, expect, it } from 'vitest'
import { CStr, LispNum, LispStr, vbaFormatFixed } from '../../src/export/lsp/vbaFormat.ts'

describe('LispNum = Format(n, "0.###")', () => {
  it('keeps the decimal point on whole numbers', () => {
    expect(LispNum(302)).toBe('302.')
    expect(LispNum(0)).toBe('0.')
    expect(LispNum(-1)).toBe('-1.')
    expect(LispNum(1000000)).toBe('1000000.')
  })

  it('writes up to three decimals without trailing zeros', () => {
    expect(LispNum(2.5)).toBe('2.5')
    expect(LispNum(0.75)).toBe('0.75')
    expect(LispNum(98.1)).toBe('98.1')
    expect(LispNum(417.3)).toBe('417.3')
    expect(LispNum(-30.8)).toBe('-30.8')
    expect(LispNum(1.25)).toBe('1.25')
    expect(LispNum(3.14159)).toBe('3.142')
  })

  it('rounds half away from zero on the decimal value, like VBA', () => {
    expect(LispNum(1.0005)).toBe('1.001') // toFixed(3) would give 1.000
    expect(LispNum(2.0005)).toBe('2.001')
    expect(LispNum(-1.0005)).toBe('-1.001')
    expect(LispNum(0.9995)).toBe('1.')
    expect(LispNum(9.9999)).toBe('10.')
    expect(LispNum(0.0004)).toBe('0.')
  })

  it('handles values from floating-point arithmetic', () => {
    expect(LispNum(0.1 + 0.2)).toBe('0.3')
    expect(LispNum(302 * 0.3)).toBe('90.6')
    expect(LispNum(360 + 12 + 0)).toBe('372.')
  })

  it('keeps the minus sign when a negative value rounds to zero (VBA quirk)', () => {
    expect(LispNum(-0.0001)).toBe('-0.')
  })

  it('handles very small and very large values without exponents', () => {
    expect(LispNum(1e-10)).toBe('0.')
    expect(LispNum(123456789.123)).toBe('123456789.123')
    expect(LispNum(1e20)).toBe('100000000000000000000.')
  })
})

describe('Format(n, "0.0")', () => {
  it('always writes one decimal', () => {
    expect(vbaFormatFixed(18.06, 1, 1)).toBe('18.1')
    expect(vbaFormatFixed(18, 1, 1)).toBe('18.0')
    expect(vbaFormatFixed(0.05, 1, 1)).toBe('0.1')
    expect(vbaFormatFixed(99.96, 1, 1)).toBe('100.0')
  })
})

describe('CStr', () => {
  it('converts numbers like VBA', () => {
    expect(CStr(17)).toBe('17')
    expect(CStr(0)).toBe('0')
    expect(CStr(0.5)).toBe('0.5')
    expect(CStr(-3)).toBe('-3')
    expect(CStr(0.1 + 0.2)).toBe('0.3')
    expect(CStr(0.0001)).toBe('0.0001')
    expect(CStr(0.00001)).toBe('1E-05')
    expect(CStr(1.5e15)).toBe('1.5E+15')
  })
})

describe('LispStr', () => {
  it('escapes backslashes and quotes', () => {
    expect(LispStr('N1')).toBe('"N1"')
    expect(LispStr('C:\\A "B"')).toBe('"C:\\\\A \\"B\\""')
  })
})
