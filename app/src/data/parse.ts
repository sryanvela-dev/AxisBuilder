// Reading typed or pasted text into values: lengths in inches (decimals, fractions, feet and
// inches), head clock positions, yes/no and choices. Every function returns either the value
// (with a note showing how the text was read) or a plain problem that says how to write it.

import { HEADS, LABEL_MODES, RADIUS_POSITIONS, isValidClock } from './schema.ts'

export type Parsed<T> = { ok: true; value: T; note?: string } | { ok: false; problem: string }

/** Up to 4 decimals, no trailing zeros: 12.5, 0.375, 126. */
export function formatNumber(n: number): string {
  return String(Math.round(n * 10000) / 10000)
}

export const LENGTH_HELP = 'Enter inches, like 12.5, 12 1/2 or 12-1/2 (or feet and inches, like 10\' 6").'

/** "12 1/2", "12-1/2", "1/2", "12.5", ".5" -> inches; null if not a length. */
function inches(text: string): number | null {
  const t = text.trim()
  if (t === '') return 0
  let m = /^(\d+(?:\.\d+)?|\.\d+)$/.exec(t)
  if (m) return Number(m[1])
  m = /^(\d+)\s*(?:\s|-)\s*(\d+)\s*\/\s*(\d+)$/.exec(t)
  if (m) return Number(m[3]) === 0 ? null : Number(m[1]) + Number(m[2]) / Number(m[3])
  m = /^(\d+)\s*\/\s*(\d+)$/.exec(t)
  if (m) return Number(m[2]) === 0 ? null : Number(m[1]) / Number(m[2])
  return null
}

/**
 * A length in inches. Accepts decimals ("12.5"), fractions ("12 1/2", "12-1/2", "1/2"), an inch mark
 * or "in" ("12 1/2\""), feet and inches ("10' 6\"", "10'-6 1/2", "10 ft 6 in", "10'") and a minus sign.
 * Blank is null.
 */
export function parseLength(text: string): Parsed<number | null> {
  let t = text.trim()
  if (t === '') return { ok: true, value: null }
  if (/^-?\d+,\d+$/.test(t)) return { ok: false, problem: `Use a point for decimals ("${t.replace(',', '.')}"), not a comma.` }
  let sign = 1
  if (t.startsWith('-') && !/^-\s*$/.test(t)) {
    sign = -1
    t = t.slice(1).trim()
  }
  t = t.replace(/\s*(?:"|''|in\.?|inch(?:es)?)$/i, '').trim()
  const feet = /^(\d+(?:\.\d+)?)\s*(?:'|ft\.?|feet|foot)\s*-?\s*(.*)$/i.exec(t)
  let value: number | null
  if (feet) {
    const rest = feet[2].replace(/\s*(?:"|''|in\.?|inch(?:es)?)$/i, '')
    const inch = inches(rest)
    value = inch === null ? null : Number(feet[1]) * 12 + inch
  } else {
    value = t === '' ? null : inches(t)
  }
  if (value === null) return { ok: false, problem: `"${text.trim()}" is not a length. ${LENGTH_HELP}` }
  value *= sign
  const plain = /^-?(\d+(\.\d+)?|\.\d+)$/.test(text.trim())
  return plain ? { ok: true, value } : { ok: true, value, note: `${text.trim()} = ${formatNumber(value)} in` }
}

/** A plain number (percent sign allowed). Blank is null. */
export function parseNumber(text: string): Parsed<number | null> {
  const t = text.trim().replace(/\s*%$/, '')
  if (t === '') return { ok: true, value: null }
  if (/^-?\d+,\d+$/.test(t)) return { ok: false, problem: `Use a point for decimals ("${t.replace(',', '.')}"), not a comma.` }
  if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(t)) return { ok: false, problem: `"${text.trim()}" is not a number. Enter a number, like 50 or 12.5.` }
  return { ok: true, value: Number(t) }
}

export const CLOCK_HELP = 'Enter a clock position from 1 to 12, like 3, 3:30 or 3.5.'

/** How a clock position is read: "3:30 = 3.5 o'clock", "10.5 = 10:30 o'clock", "3 o'clock". */
export function describeClock(clock: string): string {
  const hm = /^(\d{1,2}):(\d{2})$/.exec(clock)
  if (hm) return `${clock} = ${formatNumber(Number(hm[1]) + Number(hm[2]) / 60)} o'clock`
  const n = Number(clock)
  if (Number.isInteger(n)) return `${clock} o'clock`
  const h = Math.floor(n)
  const min = Math.round((n - h) * 60)
  return `${clock} = ${min === 60 ? h + 1 : h}:${String(min === 60 ? 0 : min).padStart(2, '0')} o'clock`
}

/**
 * A head clock position as written on the field form: "3", "3:30" or "3.5" (also "3:30:00", "3:30 AM"
 * and "3 o'clock" as Excel or people may write them). Stored as written, without the extras. Blank is null.
 */
export function parseClock(text: string): Parsed<string | null> {
  let t = text.trim()
  if (t === '') return { ok: true, value: null }
  t = t.replace(/\s*o'?\s*clock$/i, '').replace(/\s*(am|pm)$/i, '').trim()
  t = t.replace(/^(\d{1,2}:\d{2}):00$/, '$1')
  if (/°|deg/i.test(t)) return { ok: false, problem: `Degrees are not used for head positions. ${CLOCK_HELP}` }
  if (!isValidClock(t)) return { ok: false, problem: `"${text.trim()}" is not a clock position. ${CLOCK_HELP}` }
  return { ok: true, value: t, note: describeClock(t) }
}

const YES = ['yes', 'y', 'true', '1', 'x', 'on', 'include', 'included']
const NO = ['no', 'n', 'false', '0', 'off', '-']

/** Yes/no as people type it (YES, y, x, true, 1 / NO, n, false, 0). Blank is null. */
export function parseYesNo(text: string): Parsed<boolean | null> {
  const t = text.trim().toLowerCase()
  if (t === '') return { ok: true, value: null }
  if (YES.includes(t)) return { ok: true, value: true }
  if (NO.includes(t)) return { ok: true, value: false }
  return { ok: false, problem: `"${text.trim()}" is not yes or no. Enter Yes or No.` }
}

/** Plain names for choices shown in lists. */
export const RADIUS_LABELS: Record<(typeof RADIUS_POSITIONS)[number], string> = {
  CENTER: 'Center',
  HALF: 'Half radius',
  THREE_QUARTER: '3/4 radius',
  OUTER: 'Outer edge',
  CUSTOM: 'Custom %',
}
export const LABEL_MODE_LABELS: Record<(typeof LABEL_MODES)[number], string> = {
  AUTO: 'Auto',
  INSIDE: 'Inside',
  OUTSIDE: 'Outside',
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, ' ')

function choiceOf<C extends string>(text: string, choices: readonly C[], aliases: Record<string, C>, what: string, list: string): Parsed<C | null> {
  const t = norm(text)
  if (t === '') return { ok: true, value: null }
  const hit = choices.find((c) => norm(c) === t) ?? aliases[t]
  return hit ? { ok: true, value: hit } : { ok: false, problem: `"${text.trim()}" is not a ${what}. Use one of: ${list}.` }
}

export function parseHead(text: string): Parsed<(typeof HEADS)[number] | null> {
  const aliases: Record<string, (typeof HEADS)[number]> = { '1': 'HEAD 1', h1: 'HEAD 1', head1: 'HEAD 1', '2': 'HEAD 2', h2: 'HEAD 2', head2: 'HEAD 2' }
  return choiceOf(text, HEADS, aliases, 'head', 'HEAD 1, HEAD 2')
}

export function parseRadius(text: string): Parsed<(typeof RADIUS_POSITIONS)[number] | null> {
  const aliases: Record<string, (typeof RADIUS_POSITIONS)[number]> = {
    centre: 'CENTER', c: 'CENTER', '0': 'CENTER',
    'half radius': 'HALF', '1/2': 'HALF', '0.5': 'HALF',
    '3/4': 'THREE_QUARTER', '3/4 radius': 'THREE_QUARTER', 'three quarter': 'THREE_QUARTER', 'three quarters': 'THREE_QUARTER', '0.75': 'THREE_QUARTER',
    'outer edge': 'OUTER', edge: 'OUTER', '1': 'OUTER',
    'custom %': 'CUSTOM',
  }
  return choiceOf(text, RADIUS_POSITIONS, aliases, 'radius position', Object.values(RADIUS_LABELS).join(', '))
}

export function parseLabelMode(text: string): Parsed<(typeof LABEL_MODES)[number] | null> {
  const aliases: Record<string, (typeof LABEL_MODES)[number]> = { in: 'INSIDE', out: 'OUTSIDE', a: 'AUTO' }
  return choiceOf(text, LABEL_MODES, aliases, 'label position', Object.values(LABEL_MODE_LABELS).join(', '))
}

/** Min. T on a nozzle: a thickness in inches, or TOL. Blank is null. */
export function parseNozzleMinT(text: string): Parsed<number | 'TOL' | null> {
  if (text.trim().toUpperCase() === 'TOL') return { ok: true, value: 'TOL' }
  const r = parseLength(text)
  return r.ok ? r : { ok: false, problem: `"${text.trim()}" is not a thickness. Enter inches (like 0.375 or 3/8) or TOL.` }
}
