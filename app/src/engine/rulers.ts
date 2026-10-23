// Which rulers the drawing gets and where: read from the same generated code the exporter writes
// (PrintVisualRulers in library.generated.ts, translated from the VBA), so the preview can never
// disagree with the .lsp about ruler placement. The calls are small LISP expressions such as
// (SL_RulerY_CW_Bottom (+ vesselXLen 2.) 0.0 vesselYLen spacing "Y_AXIS" "..."), evaluated here.

import { PrintVisualRulers, type LibraryContext } from '../export/lsp/library.generated.ts'

export interface RulerCall {
  /** LISP function, e.g. SL_RulerX_CW_Left. */
  fn: string
  axis: 'X' | 'Y'
  /** Side of the ruler line the ticks and text go to (+1 / -1 along the other axis). */
  side: 1 | -1
  x0: number
  y0: number
  length: number
  spacing: number
  layer: string
  label: string
}

/** Axis and tick side of each ruler function (from the LISP bodies). */
const RULERS: Record<string, { axis: 'X' | 'Y'; side: 1 | -1 }> = {
  SL_RulerX: { axis: 'X', side: -1 },
  SL_RulerX_Top: { axis: 'X', side: 1 },
  SL_RulerX_CW_Left: { axis: 'X', side: -1 },
  SL_RulerX_CCW_Left: { axis: 'X', side: 1 },
  SL_RulerY: { axis: 'Y', side: -1 },
  SL_RulerY_Right: { axis: 'Y', side: 1 },
  SL_RulerY_CW_Bottom: { axis: 'Y', side: 1 },
  SL_RulerY_CCW_Bottom: { axis: 'Y', side: -1 },
  SL_RulerY_CCW_Top: { axis: 'Y', side: 1 },
}

type Expr = number | string | { sym: string } | Expr[]

function parse(text: string): Expr {
  let i = 0
  const read = (): Expr => {
    while (/\s/.test(text[i])) i++
    if (text[i] === '(') {
      i++
      const list: Expr[] = []
      for (;;) {
        while (/\s/.test(text[i])) i++
        if (text[i] === ')') {
          i++
          return list
        }
        list.push(read())
      }
    }
    if (text[i] === '"') {
      let s = ''
      i++
      while (text[i] !== '"') {
        if (text[i] === '\\') i++
        s += text[i++]
      }
      i++
      return s
    }
    let tok = ''
    while (i < text.length && !/[\s()]/.test(text[i])) tok += text[i++]
    return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(tok) ? Number(tok) : { sym: tok }
  }
  return read()
}

function evaluate(e: Expr, vars: Record<string, number>): number {
  if (typeof e === 'number') return e
  if (typeof e === 'string') throw new Error('text where a number was expected')
  if (!Array.isArray(e)) {
    if (!(e.sym in vars)) throw new Error(`unknown value ${e.sym}`)
    return vars[e.sym]
  }
  const [op, ...args] = e
  const vals = args.map((a) => evaluate(a, vars))
  switch ((op as { sym: string }).sym) {
    case '+':
      return vals.reduce((a, b) => a + b, 0)
    case '-':
      return vals.length === 1 ? -vals[0] : vals.slice(1).reduce((a, b) => a - b, vals[0])
    case '*':
      return vals.reduce((a, b) => a * b, 1)
    case '/':
      return vals.slice(1).reduce((a, b) => a / b, vals[0])
    default:
      throw new Error(`unknown operator ${JSON.stringify(op)}`)
  }
}

export interface RulerInput {
  ori: string
  placement: string
  rulerOffset: number
  vesselXLen: number
  vesselYLen: number
  spacing: number
  xAxisLabel: string
  yAxisLabel: string
}

/** The ruler calls the drawing makes for these settings (none when the placement is NONE). */
export function rulerCalls(r: RulerInput): RulerCall[] {
  if (['NONE', 'OFF', 'NO', ''].includes(r.placement.trim().toUpperCase())) return []
  const lines: string[] = []
  const ctx: LibraryContext = {
    w: (l) => lines.push(l),
    acad: false,
    hatchTransparency: 0,
    overlayImageFrame: 0,
    rulerOffset: r.rulerOffset,
    ori: r.ori,
    placement: r.placement,
    xAxisLabel: r.xAxisLabel,
    yAxisLabel: r.yAxisLabel,
  }
  PrintVisualRulers(ctx)
  const vars = { vesselXLen: r.vesselXLen, vesselYLen: r.vesselYLen, spacing: r.spacing }
  const out: RulerCall[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t.startsWith('(SL_Ruler')) continue
    const call = parse(t) as Expr[]
    const fn = (call[0] as { sym: string }).sym
    const kind = RULERS[fn]
    if (!kind) throw new Error(`Unknown ruler function ${fn}`)
    out.push({
      fn,
      ...kind,
      x0: evaluate(call[1], vars),
      y0: evaluate(call[2], vars),
      length: evaluate(call[3], vars),
      spacing: evaluate(call[4], vars),
      layer: call[5] as string,
      label: call[6] as string,
    })
  }
  return out
}
