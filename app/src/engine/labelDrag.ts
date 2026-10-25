// Moving a nozzle label or its leader end by hand (Phase 5b): what a drop or a nudge stores in the project
// (data/overrides.ts). Pure, no UI: the preview's drawing mode calls these with points in logical coordinates.

import type { LabelOverride } from '../data/schema.ts'
import type { NozzleLabel } from './labels.ts'
import { offsetOf } from './labels.ts'
import { angleToward, clampToArc, type Pt } from './leaders.ts'
import { toLogical, toVisual, type Orientation } from './transform.ts'

/** Arrow-key nudge of a selected label, in inches as the drawing reads; Shift moves NUDGE_BIG. */
export const NUDGE = 0.5
export const NUDGE_BIG = 6

/**
 * The label dropped with its center at `at`. Inside the circle it becomes an inside label (no leader) when it fits
 * there (`canBeInside`); otherwise it stays where it was dropped, with a leader.
 */
export function dropLabel(o: Orientation, l: NozzleLabel, at: Pt): Pick<LabelOverride, 'label'> {
  const inCircle = Math.hypot(at[0] - l.x, at[1] - l.y) < l.r
  if (inCircle && l.canBeInside) return { label: 'inside' }
  const d = offsetOf(o, [l.x, l.y], at)
  return { label: { dx: round(d.dx), dy: round(d.dy) } }
}

/** The leader end dropped at `at`: the angle toward it on the circle, held to the drawn part across the seam. */
export function dropTip(o: Orientation, l: NozzleLabel, at: Pt): Pick<LabelOverride, 'tip'> {
  return { tip: round(clampToArc(o, angleToward(o, [l.x, l.y], at), l.tipArc)) }
}

/** The label moved by (dx, dy) as the drawing reads. */
export function nudgeLabel(o: Orientation, l: NozzleLabel, dx: number, dy: number): Pick<LabelOverride, 'label'> {
  const [vx, vy] = toVisual(o, l.tx, l.ty)
  return dropLabel(o, l, toLogical(o, vx + dx, vy + dy))
}

/** Stored values are kept to 1/1000 (inches or degrees), so the project file stays readable. */
const round = (v: number) => Math.round(v * 1000) / 1000
