// The on-screen snap marker (shared by every drawing-mode tool): a small symbol per snap kind at the snapped point,
// drawn a fixed number of pixels big, and a dashed line to the point it lines up with.

import type { Pt } from '../../engine/leaders.ts'
import type { Snap } from '../../engine/snap.ts'
import { visualToSvg } from './drawingTool.ts'

const SIZE = 6

const SNAP_NAMES: Record<NonNullable<Snap['kind']>, string> = {
  endpoint: 'Endpoint',
  intersection: 'Intersection',
  center: 'Center',
  perpendicular: 'Perpendicular',
  align: 'Lined up',
  on: 'On the line',
  free: 'Free (no snap)',
}

/** snap: in the visual frame (engine/snap.ts). */
export function SnapMarker({ snap, scale }: { snap: Snap; scale: number }) {
  if (!snap.kind || snap.kind === 'free') return null
  const s = SIZE / scale
  const [x, y] = visualToSvg(snap.pt)
  const ref: Pt | null = snap.ref ? visualToSvg(snap.ref) : null
  const ref2: Pt | null = snap.ref2 ? visualToSvg(snap.ref2) : null
  let mark
  switch (snap.kind) {
    case 'endpoint':
      mark = <rect x={x - s} y={y - s} width={2 * s} height={2 * s} />
      break
    case 'intersection':
      mark = <path d={`M${x - s} ${y - s}L${x + s} ${y + s}M${x - s} ${y + s}L${x + s} ${y - s}`} />
      break
    case 'center':
      mark = <circle cx={x} cy={y} r={s} />
      break
    case 'perpendicular':
      mark = <path d={`M${x - s} ${y - s}V${y + s}H${x + s}M${x - s} ${y}H${x}V${y + s}`} />
      break
    case 'align':
      mark = <path d={`M${x - s} ${y}H${x + s}M${x} ${y - s}V${y + s}`} />
      break
    default:
      mark = <path d={`M${x - s} ${y - s}L${x} ${y}L${x - s} ${y + s}M${x + s} ${y - s}L${x} ${y}L${x + s} ${y + s}`} />
  }
  return (
    <g className="snap-marker">
      <title>{SNAP_NAMES[snap.kind]}</title>
      {ref && <line className="snap-guide" x1={ref[0]} y1={ref[1]} x2={x} y2={y} />}
      {ref2 && <line className="snap-guide" x1={ref2[0]} y1={ref2[1]} x2={x} y2={y} />}
      {mark}
    </g>
  )
}
