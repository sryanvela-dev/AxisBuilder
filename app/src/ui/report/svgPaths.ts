// Small helpers the report's SVG drawing shares (PageSvg, the markup editor): page-model paths as SVG path data, and
// the pictures-map key of a picture's processed thumbnail.

import type { PathCmd } from '../../report/pageModel.ts'

const f = (n: number) => String(Math.round(n * 10000) / 10000)

export const pathD = (d: readonly PathCmd[]) =>
  d.map((c) => (c[0] === 'Z' ? 'Z' : c[0] === 'C' ? `C${f(c[1])} ${f(c[2])} ${f(c[3])} ${f(c[4])} ${f(c[5])} ${f(c[6])}` : `${c[0]}${f(c[1])} ${f(c[2])}`)).join('')

/** The pictures-map key of a picture's processed thumbnail (auto levels, redactions applied). */
export const processedKey = (imageKey: string) => `px|${imageKey}`
