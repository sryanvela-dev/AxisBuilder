// Standard CAD color numbers (AutoCAD Color Index, also used by DraftSight) as screen colors, for the
// preview and the color picker. 1-9 are the named colors, 10-249 run through the hues in groups of ten
// (full, pale, then darker), 250-255 are grays. 7 is black or white depending on the background.

const NAMED: Record<number, string> = {
  1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#808080', 9: '#c0c0c0',
}
const GRAYS = [0x33, 0x5b, 0x84, 0xad, 0xd6, 0xff]
const VALUES = [1, 0.65, 0.5, 0.3, 0.15]

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** Screen color of a CAD color number (1-255), as #rrggbb. */
export function aciHex(n: number): string {
  if (NAMED[n]) return NAMED[n]
  if (n >= 250 && n <= 255) {
    const g = GRAYS[n - 250]
    return hex(g, g, g)
  }
  if (n < 10 || n > 249 || !Number.isInteger(n)) return NAMED[7]
  const hue = Math.floor((n - 10) / 10) * 15
  const k = n % 10
  const v = VALUES[Math.floor(k / 2)] * 255
  const sat = k % 2 === 0 ? 1 : 0.5
  // HSV -> RGB
  const c = v * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
  return hex(r + m, g + m, b + m)
}

/** Plain name of the named colors (for the picker's labels). */
export const ACI_NAMES: Record<number, string> = {
  1: 'Red', 2: 'Yellow', 3: 'Green', 4: 'Cyan', 5: 'Blue', 6: 'Magenta', 7: 'White / black', 8: 'Dark gray', 9: 'Light gray',
}

/** "Softer for screens": the named colors a shade darker than CAD's, so thin lines look less glaring. */
const SOFT: Record<number, [number, number, number]> = {
  1: [208, 0, 0], 2: [168, 138, 0], 3: [0, 138, 46], 4: [0, 135, 154], 5: [0, 51, 204], 6: [176, 0, 176],
}

/**
 * Print colors (PDF, report images, the Sheets view): CAD's exact colors (1 = 255,0,0, 5 = 0,0,255, ...), with 7
 * black on white paper as CAD plots it; soft = the softer shades for 1-6. Values 0..255.
 */
export function printRgb(n: number, soft = false): [number, number, number] {
  if (n === 7) return [0, 0, 0]
  if (soft && SOFT[n]) return SOFT[n]
  const h = aciHex(n)
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

export function printCss(n: number, soft = false): string {
  const [r, g, b] = printRgb(n, soft)
  return `rgb(${r} ${g} ${b})`
}

/** "1 Red", "Color 30". */
export function colorName(n: number): string {
  return ACI_NAMES[n] ? `${n} ${ACI_NAMES[n]}` : `Color ${n}`
}

/** Colors the app's theme draws itself (readable on light and dark): the rest use aciHex. */
const THEMED = new Set([1, 2, 3, 4, 5, 6, 7])

/** CSS color for the preview: theme variables for 1-7, the CAD color otherwise. */
export function aciCss(n: number): string {
  return THEMED.has(n) ? `var(--draw-${n})` : aciHex(n)
}
