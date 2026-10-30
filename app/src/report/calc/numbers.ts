// Small number helpers for the report: temperature correction, readings from positions and increments, numbers in
// words for the summary.

/** Temperature corrected thickness (design 8, formula printed in the reference report): UT x (1.007 - 0.0001 x T°F). */
export function temperatureCorrected(ut: number, tempF: number): number {
  return ut * (1.007 - 0.0001 * tempF)
}

/** A thickness with the job's temperature correction applied when it is on (min and avg, before wall loss). */
export function correctedThickness(ut: number | null, correction: { on: boolean; tempF: number | null }): number | null {
  if (ut === null || !correction.on || correction.tempF === null) return ut
  return temperatureCorrected(ut, correction.tempF)
}

/**
 * Readings in a scan from its size and increments (design 5): (|ΔX| / X increment + 1) x (|ΔY| / Y increment + 1).
 * Matches every scan of the reference job's CSV exactly. A span that isn't a whole number of increments counts the
 * index points that fit. Null when a value is missing or an increment is not above 0.
 */
export function readingsFromIncrements(spanX: number | null, spanY: number | null, incrX: number | null, incrY: number | null): number | null {
  if (spanX === null || spanY === null || incrX === null || incrY === null || !(incrX > 0) || !(incrY > 0)) return null
  const points = (span: number, incr: number) => Math.floor(Math.abs(span) / incr + 1e-6) + 1
  return points(spanX, incrX) * points(spanY, incrY)
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function under1000(n: number): string {
  const out: string[] = []
  if (n >= 100) {
    out.push(`${ONES[Math.floor(n / 100)]} hundred`)
    n %= 100
    if (n === 0) return out.join(' ')
  }
  if (n < 20) out.push(ONES[n])
  else out.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''))
  return out.join(' ')
}

/** A whole number from 0 to 999,999 in words: 17 -> "seventeen", 2045 -> "two thousand forty-five". */
export function numberInWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) throw new Error(`No words for ${n}.`)
  if (n < 1000) return under1000(n)
  const rest = n % 1000
  return `${under1000(Math.floor(n / 1000))} thousand${rest ? ` ${under1000(rest)}` : ''}`
}

/** As the summary writes a count: "seventeen (17)"; with words off, or past 999,999, just "17". */
export function countText(n: number, inWords = true): string {
  const digits = n.toLocaleString('en-US')
  return inWords && Number.isInteger(n) && n >= 0 && n <= 999_999 ? `${numberInWords(n)} (${digits})` : digits
}
