// The short note under a table row that the drawing wraps across the circumference seam, or that sits past
// it. Past the seam is fine as typed (X = 0 and X = circumference are the same line); the note says where it
// is drawn and offers to write the number as drawn, if the user prefers that.

import type { CheckAction } from '../data/checks.ts'
import { formatNumber } from '../data/parse.ts'
import type { ListKey, Project } from '../data/schema.ts'
import { drawnScans } from './layout.ts'
import { circumference, isWrapped, nozzlePieces, objectPieces, pastSeamValue, scanPieces, type XPiece } from './wrap.ts'

export interface WrapNote {
  text: string
  /** Optional: write the value as it is drawn (never needed). */
  actions?: CheckAction[]
}

const n3 = (n: number) => formatNumber(Math.round(n * 1000) / 1000)
const span = (pieces: XPiece[]) => pieces.map((pc) => `${n3(pc.x0)} to ${n3(pc.x1)}`).join(' and ')
const past = (x: number, C: number) => x < 0 || x > C

/** A note for the row, or null. */
export function wrapNote(p: Project, list: ListKey, index: number): WrapNote | null {
  const C = circumference(p)
  if (C === null) return null
  const fine = (what: string, at: string) => `${what} past the seam is fine as typed: it is drawn at ${at}.`
  if (list === 'scans') {
    const sc = drawnScans(p)[index]
    if (!sc || !sc.include || sc.noWrap || sc.xStart === null || sc.xStop === null || sc.xStart > sc.xStop) return null
    const pieces = scanPieces(sc, C)
    if (isWrapped(pieces)) return { text: `Drawn across the seam in two pieces: X ${span(pieces)}, both hatched, the name on the larger one.` }
    const raw = p.scans[index]
    if (pieces[0].x0 !== sc.xStart && !raw.acrossSeam && raw.xStart !== null && raw.xStop !== null) {
      const shift = pieces[0].x0 - sc.xStart
      const [a, b] = [raw.xStart + shift, raw.xStop + shift].map((v) => Math.round(v * 1e6) / 1e6)
      return {
        text: fine('A scan wholly', `X ${n3(pieces[0].x0)} to ${n3(pieces[0].x1)}`),
        actions: [{ label: `Write as ${n3(a)} to ${n3(b)}`, list, index, changes: { xStart: a, xStop: b } }],
      }
    }
    return null
  }
  if (list === 'objects') {
    const o = p.objects[index]
    if (!o || !o.include || o.noWrap || o.x === null || o.circWidth === null) return null
    const pieces = objectPieces(o, C)
    if (isWrapped(pieces)) return { text: `Drawn across the seam in two pieces: X ${span(pieces)}, the name on the larger one.` }
    if (past(o.x, C) && o.x !== C) {
      const x = pastSeamValue(o.x, C)
      return { text: fine('An X position', `X ${n3(x)}`), actions: [{ label: `Write as ${n3(x)}`, list, index, changes: { x } }] }
    }
    return null
  }
  if (list === 'shellNozzles') {
    const n = p.shellNozzles[index]
    if (!n || !n.include || n.noWrap || n.x === null || n.y === null || n.diameter === null) return null
    const pieces = nozzlePieces(n, C)
    const moved = past(n.x, C) ? { actions: [{ label: `Write as ${n3(pastSeamValue(n.x, C))}`, list, index, changes: { x: pastSeamValue(n.x, C) } }] } : {}
    if (pieces.length > 1) {
      const where = past(n.x, C) ? ` (X ${n3(n.x)} is the same as ${n3(pastSeamValue(n.x, C))})` : ''
      return { text: `Drawn across the seam: the part past the edge is drawn at the other edge${where}.`, ...moved }
    }
    if (past(n.x, C)) return { text: fine('An X position', `X ${n3(pieces[0].cx)}`), ...moved }
    return null
  }
  return null
}
