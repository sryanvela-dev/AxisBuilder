// Drawing mode in the preview (Phase 5b): a tool takes the pointer and keys in the drawing view and draws its own
// marks over the drawing. Pan and zoom stay with the view (wheel zooms; middle-drag, Space+drag or a drag that the
// tool doesn't take pans). Labels (labelTool.tsx) are the first tool; MUT areas (5c) are meant to be another.

import type { ReactNode } from 'react'
import type { Pt } from '../../engine/leaders.ts'
import { toLogical, type Orientation } from '../../engine/transform.ts'

/** Keys held with a pointer event: Shift = free (no snap), Ctrl = horizontal / vertical (ortho). */
export interface Mods {
  shift: boolean
  ctrl: boolean
}

export interface ToolPointer {
  /** SVG point (x right, y down; the drawing as it reads, upside down in y). */
  svg: Pt
  /** Screen pixels per drawing unit, for tolerances and marks drawn a fixed number of pixels big. */
  scale: number
  mods: Mods
  clientX: number
  clientY: number
}

export interface DrawingTool {
  /** CSS cursor for the pointer here (null = the view's own: grab). */
  hover: (p: ToolPointer) => string | null
  /** The pointer went down here: true = the tool takes this drag; false = the view pans. */
  down: (p: ToolPointer) => boolean
  move: (p: ToolPointer) => void
  /** End of a drag the tool took; moved = the pointer moved past the click distance. */
  up: (p: ToolPointer, moved: boolean) => void
  /** A click on nothing the tool took (no drag). */
  clickEmpty?: () => void
  /** Right-click; true = handled (no browser menu). */
  menu?: (p: ToolPointer) => boolean
  /** The pointer left the drawing. */
  leave?: () => void
  /** What the tool draws over the drawing, in SVG coordinates. */
  overlay: (scale: number) => ReactNode
}

/** SVG point -> logical point (the inverse of renderModel's toSvg). */
export function svgToLogical(o: Orientation, s: Pt): Pt {
  return toLogical(o, s[0], -s[1])
}

/** SVG point -> visual point (as the drawing reads, y up). */
export const svgToVisual = (s: Pt): Pt => [s[0], -s[1]]
export const visualToSvg = (v: Pt): Pt => [v[0], -v[1]]
