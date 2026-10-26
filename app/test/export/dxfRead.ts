// A small DXF reader for the tests: group-code pairs, sections, and each object as a list of pairs.

export interface DxfObject {
  type: string
  pairs: [number, string][]
  /** First value of a group code. */
  get: (code: number) => string | undefined
  /** All values of a group code. */
  all: (code: number) => string[]
  num: (code: number) => number
}

export interface ParsedDxf {
  sections: Map<string, DxfObject[]>
  /** HEADER variables ($NAME -> its pairs). */
  header: Map<string, [number, string][]>
}

function obj(type: string, pairs: [number, string][]): DxfObject {
  return {
    type,
    pairs,
    get: (c) => pairs.find((p) => p[0] === c)?.[1],
    all: (c) => pairs.filter((p) => p[0] === c).map((p) => p[1]),
    num: (c) => Number(pairs.find((p) => p[0] === c)?.[1]),
  }
}

export function readDxf(text: string): ParsedDxf {
  const lines = text.split('\r\n')
  if (lines[lines.length - 1] === '') lines.pop()
  if (lines.length % 2 !== 0) throw new Error('odd number of lines')
  const pairs: [number, string][] = []
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i].trim())
    if (!Number.isInteger(code)) throw new Error(`bad group code "${lines[i]}" at line ${i + 1}`)
    pairs.push([code, lines[i + 1]])
  }
  if (pairs[pairs.length - 1][1] !== 'EOF') throw new Error('no EOF')
  const sections = new Map<string, DxfObject[]>()
  const header = new Map<string, [number, string][]>()
  let i = 0
  while (i < pairs.length - 1) {
    if (pairs[i][0] !== 0 || pairs[i][1] !== 'SECTION') throw new Error(`expected SECTION at pair ${i}`)
    const name = pairs[i + 1][1]
    i += 2
    const list: DxfObject[] = []
    let cur: [number, string][] | null = null
    let curType = ''
    let hvar: string | null = null
    while (!(pairs[i][0] === 0 && pairs[i][1] === 'ENDSEC')) {
      const [c, v] = pairs[i]
      if (name === 'HEADER') {
        if (c === 9) {
          hvar = v
          header.set(v, [])
        } else if (hvar) header.get(hvar)!.push([c, v])
      } else if (c === 0) {
        if (cur) list.push(obj(curType, cur))
        cur = []
        curType = v
      } else cur?.push([c, v])
      i++
    }
    if (cur) list.push(obj(curType, cur))
    sections.set(name, list)
    i++
  }
  return { sections, header }
}

/** Every handle in the file (code 5, and 105 for DIMSTYLE records). */
export function handles(d: ParsedDxf): string[] {
  const out: string[] = []
  for (const list of d.sections.values()) for (const o of list) out.push(...o.all(o.type === 'DIMSTYLE' ? 105 : 5))
  return out
}
