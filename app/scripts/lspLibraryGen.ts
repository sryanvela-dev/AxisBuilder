// Translates the fixed LISP-writing VBA routines of v5.0 (src/SLG_Utilities.bas) into TypeScript, so the
// app writes the same text without anyone retyping ~2,400 Print lines. Used by gen-lsp-library.ts
// (writes src/export/lsp/library.generated.ts) and by a test that checks the generated file is current.
//
// Only a small VBA subset is understood; anything else stops the translation with an error:
//   Print #f, <expr>                     ->  o.w(<expr>)
//   If IsAutoCADOutput() Then / Else / End If
//   Select Case <name> / Case "A", "B" / Case Else / End Select   (string comparisons, no fall-through)
//   Exit Sub                             ->  return
//   WriteObjectWrapLisp f (and the other translated routines)    ->  WriteObjectWrapLisp(o)
// Expressions: "literal" & LispNum(name) & LispStr(name) & CStr(name) & CStr(HatchTransparencySetting())
// & LispStr(IIf(IsAutoCADOutput(), "a", "b")). Names become fields of the context `o`.

export interface Extract {
  /** Name of the generated function. */
  name: string
  /** VBA procedure to take (its whole body), or a line range inside one. */
  proc: string
  /** First line to translate: the first line that matches (default: the line after the Sub line). */
  from?: RegExp
  /** Stop before the first line that matches (default: End Sub). */
  until?: RegExp
}

export const EXTRACTS: Extract[] = [
  { name: 'WriteLispHeader', proc: 'WriteLispHeader' },
  { name: 'WriteObjectWrapLisp', proc: 'WriteObjectWrapLisp' },
  { name: 'WriteSectionViewportLisp', proc: 'WriteSectionViewportLisp' },
  { name: 'WriteOverlayLispFunctions', proc: 'WriteOverlayLispFunctions' },
  // PrintVisualBottomLeftRulers after its setup lines (placement read, NONE/OFF/NO exit).
  { name: 'PrintVisualRulers', proc: 'PrintVisualBottomLeftRulers', from: /^\s*Select Case ori\s*$/ },
  // ExportAxisBuilderLSP from the AXISDRAWING alias to the end of the file text.
  { name: 'WriteCommandsTail', proc: 'ExportAxisBuilderLSP', from: /^\s*Print #f, "\(defun c:AXISDRAWING/, until: /^\s*Close #f\s*$/ },
]

const ROUTINES = new Set(EXTRACTS.map((e) => e.name))

/** VBA string literal body -> text ("" -> "). */
function vbaString(lit: string): string {
  return lit.slice(1, -1).replace(/""/g, '"')
}

/** Splits at top-level `&` (outside quotes and parentheses). */
function splitConcat(expr: string): string[] {
  const parts: string[] = []
  let depth = 0
  let inStr = false
  let cur = ''
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (inStr) {
      cur += ch
      if (ch === '"') {
        if (expr[i + 1] === '"') {
          cur += '"'
          i++
        } else inStr = false
      }
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === '&' && depth === 0) {
      parts.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  parts.push(cur.trim())
  return parts
}

interface Ctx {
  numbers: Set<string>
  strings: Set<string>
}

function term(t: string, ctx: Ctx, where: string): string {
  let m: RegExpExecArray | null
  if (/^"(?:[^"]|"")*"$/.test(t)) return JSON.stringify(vbaString(t))
  if ((m = /^LispNum\((\w+)\)$/.exec(t))) {
    ctx.numbers.add(m[1])
    return `LispNum(o.${m[1]})`
  }
  if ((m = /^LispStr\((\w+)\)$/.exec(t))) {
    ctx.strings.add(m[1])
    return `LispStr(o.${m[1]})`
  }
  if ((m = /^LispStr\(IIf\(IsAutoCADOutput\(\), ("(?:[^"]|"")*"), ("(?:[^"]|"")*")\)\)$/.exec(t))) {
    return `LispStr(o.acad ? ${JSON.stringify(vbaString(m[1]))} : ${JSON.stringify(vbaString(m[2]))})`
  }
  if (t === 'CStr(HatchTransparencySetting())') {
    ctx.numbers.add('hatchTransparency')
    return 'CStr(o.hatchTransparency)'
  }
  if ((m = /^CStr\((\w+)\)$/.exec(t))) {
    ctx.numbers.add(m[1])
    return `CStr(o.${m[1]})`
  }
  throw new Error(`${where}: unsupported expression term: ${t}`)
}

function expression(expr: string, ctx: Ctx, where: string): string {
  return splitConcat(expr).map((t) => term(t, ctx, where)).join(' + ')
}

/** Joins VBA continuation lines (" _" at the end) and drops comments and blank lines. */
function logicalLines(lines: { text: string; no: number }[]): { text: string; no: number }[] {
  const out: { text: string; no: number }[] = []
  let buf = ''
  let start = 0
  for (const l of lines) {
    const t = l.text.replace(/\s+$/, '')
    if (!buf) start = l.no
    if (/\s_$/.test(t)) {
      buf += t.slice(0, -1).trim() + ' '
      continue
    }
    const full = (buf + t.trim()).trim()
    buf = ''
    if (full === '' || full.startsWith("'") || /^Dim\s/.test(full)) continue
    out.push({ text: full, no: start })
  }
  return out
}

/** Translates one extract into the body of a TypeScript function. */
function translate(lines: { text: string; no: number }[], ctx: Ctx): string[] {
  const out: string[] = []
  const selects: { name: string; first: boolean }[] = []
  let indent = 1
  const emit = (s: string) => out.push('  '.repeat(indent) + s)
  for (const { text, no } of logicalLines(lines)) {
    const where = `SLG_Utilities.bas line ${no}`
    let m: RegExpExecArray | null
    if ((m = /^Print #f, (.*)$/.exec(text))) {
      emit(`o.w(${expression(m[1], ctx, where)})`)
    } else if (text === 'If IsAutoCADOutput() Then') {
      emit('if (o.acad) {')
      indent++
    } else if (text === 'Else') {
      indent--
      emit('} else {')
      indent++
    } else if (text === 'End If') {
      indent--
      emit('}')
    } else if ((m = /^Select Case (\w+)$/.exec(text))) {
      ctx.strings.add(m[1])
      selects.push({ name: m[1], first: true })
    } else if ((m = /^Case (.+)$/.exec(text)) && selects.length) {
      const sel = selects[selects.length - 1]
      if (!sel.first) indent--
      if (m[1] === 'Else') {
        emit(sel.first ? '{' : '} else {')
      } else {
        const values = splitList(m[1], where).map((v) => `o.${sel.name} === ${JSON.stringify(v)}`)
        emit(`${sel.first ? 'if' : '} else if'} (${values.join(' || ')}) {`)
      }
      sel.first = false
      indent++
    } else if (text === 'End Select') {
      const sel = selects.pop()!
      if (!sel.first) {
        indent--
        emit('}')
      }
    } else if (text === 'Exit Sub') {
      emit('return')
    } else if ((m = /^(\w+) f$/.exec(text)) && ROUTINES.has(m[1])) {
      emit(`${m[1]}(o)`)
    } else {
      throw new Error(`${where}: unsupported statement: ${text}`)
    }
  }
  if (selects.length || indent !== 1) throw new Error('Unbalanced If/Select in an extract')
  return out
}

function splitList(list: string, where: string): string[] {
  const vals: string[] = []
  const re = /\s*("(?:[^"]|"")*")\s*(,|$)/y
  let m: RegExpExecArray | null
  let pos = 0
  re.lastIndex = 0
  while (pos < list.length && (m = re.exec(list))) {
    vals.push(vbaString(m[1]))
    pos = re.lastIndex
  }
  if (pos !== list.length) throw new Error(`${where}: unsupported Case list: ${list}`)
  return vals
}

/** The generated TypeScript module for the given VBA source text. */
export function generateLibrary(basText: string): string {
  const lines = basText.split(/\r?\n/)
  const ctx: Ctx = { numbers: new Set(), strings: new Set() }
  const functions: string[] = []
  for (const ex of EXTRACTS) {
    const start = lines.findIndex((l) => new RegExp(`^(Public |Private )?Sub ${ex.proc}\\(`).test(l))
    if (start < 0) throw new Error(`Procedure ${ex.proc} not found`)
    const end = lines.findIndex((l, i) => i > start && /^End Sub\s*$/.test(l))
    let from = start + 1
    if (ex.from) {
      from = lines.findIndex((l, i) => i > start && i < end && ex.from!.test(l))
      if (from < 0) throw new Error(`${ex.name}: start line not found`)
    }
    let to = end
    if (ex.until) {
      to = lines.findIndex((l, i) => i > from && i < end && ex.until!.test(l))
      if (to < 0) throw new Error(`${ex.name}: end line not found`)
    }
    const body = translate(lines.slice(from, to).map((text, i) => ({ text, no: from + i + 1 })), ctx)
    functions.push(
      `/** From ${ex.proc}${ex.from ? ' (part)' : ''}, SLG_Utilities.bas lines ${from + 1}-${to}. */\n` +
        `export function ${ex.name}(o: LibraryContext): void {\n${body.join('\n')}\n}\n`,
    )
  }
  for (const n of ctx.numbers) if (ctx.strings.has(n)) throw new Error(`${n} is used as both number and text`)
  const fields = [
    '  /** Writes one line (v5.0 Print #f). */',
    '  w: (line: string) => void',
    '  /** CAD Platform = AutoCAD. */',
    '  acad: boolean',
    ...[...ctx.numbers].sort().map((n) => `  ${n}: number`),
    ...[...ctx.strings].sort().map((n) => `  ${n}: string`),
  ]
  return [
    '// GENERATED by scripts/gen-lsp-library.ts from src/SLG_Utilities.bas (v5.0). Do not edit by hand:',
    '// run `npm run gen:lsp-library` after a VBA change. A test fails when this file is out of date.',
    '/* eslint-disable */',
    '',
    "import { CStr, LispNum, LispStr } from './vbaFormat.ts'",
    '',
    '/** Values the translated routines read. */',
    'export interface LibraryContext {',
    ...fields,
    '}',
    '',
    ...functions,
  ].join('\n')
}
