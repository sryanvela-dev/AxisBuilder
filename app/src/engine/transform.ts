// Orientation transforms of the drawing (the LISP's SL_tf_x / SL_tf_y / SL_rot and the text and head
// rotations that depend on SL_ORIENTATION). Logical X = around the shell, Y = along it.

export type Orientation = 'Vertical' | 'Horizontal CW' | 'Horizontal CCW'

/** Logical point -> visual (drawing) point: Vertical (x, y), CW (y, -x), CCW (-y, x). */
export function toVisual(o: Orientation, x: number, y: number): [number, number] {
  if (o === 'Vertical') return [x, y]
  if (o === 'Horizontal CCW') return [-y, x]
  return [y, -x]
}

/** Inverse of toVisual (v5.0 VisualToLogicalX/Y). */
export function toLogical(o: Orientation, vx: number, vy: number): [number, number] {
  if (o === 'Vertical') return [vx, vy]
  if (o === 'Horizontal CCW') return [vy, -vx]
  return [-vy, vx]
}

/** SL_rot: the drawing rotation added to every text and image (degrees, counter-clockwise). */
export function rotationOffset(o: Orientation): number {
  return o === 'Vertical' ? 0 : o === 'Horizontal CCW' ? 90 : -90
}

/** SL_ReadableRot: logical text rotation that reads upright on the drawing. */
export function readableRot(o: Orientation): number {
  return o === 'Vertical' ? 0 : o === 'Horizontal CCW' ? -90 : 90
}

/** SL_RulerTextRotX. */
export function rulerTextRotX(o: Orientation): number {
  return o === 'Horizontal CW' ? 180 : 0
}

/** SL_RulerTextRotY. */
export function rulerTextRotY(o: Orientation): number {
  return o === 'Horizontal CCW' ? -90 : 90
}

/** SL_HeadVector: clock angle (0 = 12 o'clock) -> logical direction for the orientation. */
export function headVector(o: Orientation, deg: number): [number, number] {
  const rad = deg * (Math.PI / 180)
  const sx = Math.sin(rad)
  const sy = Math.cos(rad)
  if (o === 'Vertical') return [sx, sy]
  if (o === 'Horizontal CCW') return [sy, -sx]
  return [-sy, sx]
}
