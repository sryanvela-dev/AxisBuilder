// The short note under a table row that the drawing wraps across the circumference seam.

import { formatNumber } from '../data/parse.ts'
import type { ListKey, Project } from '../data/schema.ts'
import { drawnScans } from './layout.ts'
import { circumference, isWrapped, nozzlePieces, objectPieces, scanPieces, type XPiece } from './wrap.ts'

const span = (pieces: XPiece[]) => pieces.map((pc) => `${formatNumber(Math.round(pc.x0 * 1000) / 1000)} to ${formatNumber(Math.round(pc.x1 * 1000) / 1000)}`).join(' and ')

/** "Drawn across the seam in two pieces: X 437 to 458 and 0 to 17." or null. */
export function wrapNote(p: Project, list: ListKey, index: number): string | null {
  const C = circumference(p)
  if (C === null) return null
  if (list === 'scans') {
    const sc = drawnScans(p)[index]
    if (!sc || !sc.include || sc.xStart === null || sc.xStop === null || sc.xStart > sc.xStop) return null
    const pieces = scanPieces(sc, C)
    return isWrapped(pieces) ? `Drawn across the seam in two pieces: X ${span(pieces)}, both hatched, the name on the larger one.` : null
  }
  if (list === 'objects') {
    const o = p.objects[index]
    if (!o || !o.include || o.x === null || o.circWidth === null) return null
    const pieces = objectPieces(o, C)
    return isWrapped(pieces) ? `Drawn across the seam in two pieces: X ${span(pieces)}, the name on the larger one.` : null
  }
  if (list === 'shellNozzles') {
    const n = p.shellNozzles[index]
    if (!n || !n.include || n.x === null || n.y === null || n.diameter === null) return null
    const pieces = nozzlePieces(n, C)
    return pieces.length > 1 ? 'Drawn across the seam: the part past the edge is drawn at the other edge.' : null
  }
  return null
}
