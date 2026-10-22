// How AxisBuilder v5.0 (VBA) turns numbers into text, reproduced exactly.
//
// VBA's Format() works on the decimal value of a Double as shown with 15 significant digits, and
// rounds half away from zero. JavaScript's toFixed() rounds the binary value instead (1.0005 ->
// "1.000"), so the digits are built here from toPrecision(15).
//
// Used by v5.0:
//   LispNum(n)        Replace(Format(n, "0.###"), ",", ".")  ->  302 -> "302.", 2.5 -> "2.5", -1 -> "-1."
//   Format(pct, "0.0")                                        ->  18.06 -> "18.1"
//   CStr(n)                                                   ->  17 -> "17", 0.5 -> "0.5"

/** Decimal digits of |n| with up to 15 significant digits: integer part and fraction part. */
function decimalParts(n: number): { int: string; frac: string } {
  const p = Math.abs(n).toPrecision(15)
  let [mant, expPart] = p.split('e')
  const exp = expPart ? Number(expPart) : 0
  let [i, f = ''] = mant.split('.')
  const digits = i + f
  let point = i.length + exp // position of the decimal point within `digits`
  if (point <= 0) {
    mant = '0'.repeat(1 - point) + digits
    point = 1
  } else if (point > digits.length) {
    mant = digits + '0'.repeat(point - digits.length)
  } else {
    mant = digits
  }
  i = mant.slice(0, point).replace(/^0+(?=\d)/, '')
  f = mant.slice(point)
  return { int: i, frac: f }
}

/** Adds one to a string of decimal digits ("199" -> "200", "99" -> "100"). */
function increment(digits: string): string {
  const a = digits.split('')
  let k = a.length - 1
  while (k >= 0) {
    if (a[k] === '9') {
      a[k] = '0'
      k--
    } else {
      a[k] = String(Number(a[k]) + 1)
      return a.join('')
    }
  }
  return '1' + a.join('')
}

/**
 * VBA Format(n, "0.###...") style: at least `minDecimals`, at most `maxDecimals` digits after the
 * point, rounded half away from zero; the point is always written when `maxDecimals` > 0 (so
 * "0.###" gives "302."). A negative value that rounds to zero keeps its sign ("-0."), as VBA does.
 */
export function vbaFormatFixed(n: number, minDecimals: number, maxDecimals: number): string {
  if (!Number.isFinite(n)) throw new Error(`Cannot format ${n}`)
  const { int, frac } = decimalParts(n)
  let intPart = int
  let fracPart = frac.padEnd(maxDecimals + 1, '0')
  const roundUp = Number(fracPart[maxDecimals]) >= 5
  fracPart = fracPart.slice(0, maxDecimals)
  if (roundUp) {
    const whole = increment(intPart + fracPart)
    intPart = whole.slice(0, whole.length - maxDecimals) || '0'
    fracPart = maxDecimals > 0 ? whole.slice(whole.length - maxDecimals) : ''
  }
  while (fracPart.length > minDecimals && fracPart.endsWith('0')) fracPart = fracPart.slice(0, -1)
  const sign = n < 0 || Object.is(n, -0) ? '-' : ''
  return `${sign}${intPart}${maxDecimals > 0 ? '.' : ''}${fracPart}`
}

/** v5.0 LispNum: Format(n, "0.###") with "," replaced by "." (always "." here). */
export function LispNum(n: number): string {
  return vbaFormatFixed(n, 0, 3)
}

/**
 * VBA CStr of a number: up to 15 significant digits, no trailing zeros, no point for whole numbers;
 * scientific notation ("1E-05", "1.5E+15") for very small or large values.
 */
export function CStr(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Cannot convert ${n}`)
  if (n === 0) return '0'
  const p = Math.abs(n).toPrecision(15)
  const exp = Number(Number(p).toExponential().split('e')[1])
  const sign = n < 0 ? '-' : ''
  if (exp >= 15 || exp < -4) {
    let [m, e] = Number(p).toExponential(14).split('e')
    m = m.replace(/\.?0+$/, '')
    const ev = Number(e)
    return `${sign}${m}E${ev < 0 ? '-' : '+'}${String(Math.abs(ev)).padStart(2, '0')}`
  }
  const { int, frac } = decimalParts(n)
  const f = frac.replace(/0+$/, '')
  return `${sign}${int}${f ? '.' + f : ''}`
}

/** v5.0 LispStr: backslashes doubled, quotes escaped, wrapped in quotes. */
export function LispStr(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}
