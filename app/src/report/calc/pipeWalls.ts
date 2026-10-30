// Standard pipe walls for the nozzle nominal suggestion (report design 4.4.1): ASME B36.10M (welded and seamless
// wrought steel: schedules 10-160, STD, XS, XXS) and ASME B36.19M (stainless: 5S, 10S, 40S, 80S), NPS 1/2 to 24,
// every listed schedule; walls in inches.
//
// Source: the inch columns of B36.10M / B36.19M as reproduced in Wikipedia "Nominal Pipe Size" (checked value by
// value, 2026-10-29), with the standard's own rounding of the metric wall (11.13 mm = 0.438, where some charts print
// 0.437). Left out on purpose: B36.10M walls with no schedule name, Sch 120 below NPS 4 (not in B36.10M), XXS above
// NPS 12 (not listed). Not yet checked against a paper copy of the standards.

export interface PipeWall {
  /** Every name this wall goes by, preferred first ("XS", "80", "80S"). */
  names: string[]
  /** Inches. */
  wall: number
}

export interface PipeSize {
  /** As written on the drawing: "1/2", "1-1/2", "24". */
  nps: string
  /** Outside diameter, inches. */
  od: number
  /** Thinnest first. */
  walls: PipeWall[]
}

/**
 * One NPS from its schedule list: "name=wall" pairs; one wall with several names is written once per name and
 * merged. Names are ordered STD / XS / XXS, then schedule numbers, then the stainless S schedules.
 */
function size(nps: string, od: number, list: string): PipeSize {
  const byWall = new Map<number, string[]>()
  for (const pair of list.split(/\s+/)) {
    const [name, wall] = pair.split('=')
    const w = Number(wall)
    byWall.set(w, [...(byWall.get(w) ?? []), name])
  }
  const rank = (n: string) => (['STD', 'XS', 'XXS'].includes(n) ? 0 : n.endsWith('S') ? 2 : 1)
  const walls = [...byWall.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([wall, names]) => ({ wall, names: names.sort((a, b) => rank(a) - rank(b)) }))
  return { nps, od, walls }
}

export const PIPE_SIZES: readonly PipeSize[] = [
  size('1/2', 0.84, '5S=0.065 10=0.083 10S=0.083 30=0.095 STD=0.109 40=0.109 40S=0.109 XS=0.147 80=0.147 80S=0.147 160=0.188 XXS=0.294'),
  size('3/4', 1.05, '5S=0.065 10=0.083 10S=0.083 30=0.095 STD=0.113 40=0.113 40S=0.113 XS=0.154 80=0.154 80S=0.154 160=0.219 XXS=0.308'),
  size('1', 1.315, '5S=0.065 10=0.109 10S=0.109 30=0.114 STD=0.133 40=0.133 40S=0.133 XS=0.179 80=0.179 80S=0.179 160=0.250 XXS=0.358'),
  size('1-1/4', 1.66, '5S=0.065 10=0.109 10S=0.109 30=0.117 STD=0.140 40=0.140 40S=0.140 XS=0.191 80=0.191 80S=0.191 160=0.250 XXS=0.382'),
  size('1-1/2', 1.9, '5S=0.065 10=0.109 10S=0.109 30=0.125 STD=0.145 40=0.145 40S=0.145 XS=0.200 80=0.200 80S=0.200 160=0.281 XXS=0.400'),
  size('2', 2.375, '5S=0.065 10=0.109 10S=0.109 30=0.125 STD=0.154 40=0.154 40S=0.154 XS=0.218 80=0.218 80S=0.218 160=0.344 XXS=0.436'),
  size('2-1/2', 2.875, '5S=0.083 10=0.120 10S=0.120 30=0.188 STD=0.203 40=0.203 40S=0.203 XS=0.276 80=0.276 80S=0.276 160=0.375 XXS=0.552'),
  size('3', 3.5, '5S=0.083 10=0.120 10S=0.120 30=0.188 STD=0.216 40=0.216 40S=0.216 XS=0.300 80=0.300 80S=0.300 160=0.438 XXS=0.600'),
  size('3-1/2', 4.0, '5S=0.083 10=0.120 10S=0.120 30=0.188 STD=0.226 40=0.226 40S=0.226 XS=0.318 80=0.318 80S=0.318 XXS=0.636'),
  size('4', 4.5, '5S=0.083 10=0.120 10S=0.120 30=0.188 STD=0.237 40=0.237 40S=0.237 XS=0.337 80=0.337 80S=0.337 120=0.438 160=0.531 XXS=0.674'),
  size('5', 5.563, '5S=0.109 10S=0.134 STD=0.258 40=0.258 40S=0.258 XS=0.375 80=0.375 80S=0.375 120=0.500 160=0.625 XXS=0.750'),
  size('6', 6.625, '5S=0.109 10S=0.134 STD=0.280 40=0.280 40S=0.280 XS=0.432 80=0.432 80S=0.432 120=0.562 160=0.719 XXS=0.864'),
  size('8', 8.625, '5S=0.109 10S=0.148 20=0.250 30=0.277 STD=0.322 40=0.322 40S=0.322 60=0.406 XS=0.500 80=0.500 80S=0.500 100=0.594 120=0.719 140=0.812 XXS=0.875 160=0.906'),
  size('10', 10.75, '5S=0.134 10S=0.165 20=0.250 30=0.307 STD=0.365 40=0.365 40S=0.365 XS=0.500 60=0.500 80S=0.500 80=0.594 100=0.719 120=0.844 140=1.000 XXS=1.000 160=1.125'),
  size('12', 12.75, '5S=0.156 10S=0.180 20=0.250 30=0.330 STD=0.375 40S=0.375 40=0.406 XS=0.500 80S=0.500 60=0.562 80=0.688 100=0.844 120=1.000 XXS=1.000 140=1.125 160=1.312'),
  size('14', 14.0, '5S=0.156 10S=0.188 10=0.250 20=0.312 STD=0.375 30=0.375 40S=0.375 40=0.438 XS=0.500 80S=0.500 60=0.594 80=0.750 100=0.938 120=1.094 140=1.250 160=1.406'),
  size('16', 16.0, '5S=0.165 10S=0.188 10=0.250 20=0.312 STD=0.375 30=0.375 40S=0.375 XS=0.500 40=0.500 80S=0.500 60=0.656 80=0.844 100=1.031 120=1.219 140=1.438 160=1.594'),
  size('18', 18.0, '5S=0.165 10S=0.188 10=0.250 20=0.312 STD=0.375 40S=0.375 30=0.438 XS=0.500 80S=0.500 40=0.562 60=0.750 80=0.938 100=1.156 120=1.375 140=1.562 160=1.781'),
  size('20', 20.0, '5S=0.188 10S=0.218 10=0.250 STD=0.375 20=0.375 40S=0.375 XS=0.500 30=0.500 80S=0.500 40=0.594 60=0.812 80=1.031 100=1.281 120=1.500 140=1.750 160=1.969'),
  size('22', 22.0, '5S=0.188 10S=0.218 10=0.250 STD=0.375 20=0.375 40S=0.375 XS=0.500 30=0.500 80S=0.500 60=0.875 80=1.125 100=1.375 120=1.625 140=1.875 160=2.125'),
  size('24', 24.0, '5S=0.218 10=0.250 10S=0.250 STD=0.375 20=0.375 40S=0.375 XS=0.500 80S=0.500 30=0.562 40=0.688 60=0.969 80=1.219 100=1.531 120=1.812 140=2.062 160=2.344'),
]

export const NPS_SIZES = PIPE_SIZES.map((s) => s.nps) as [string, ...string[]]

export function pipeSize(nps: string): PipeSize | undefined {
  return PIPE_SIZES.find((s) => s.nps === nps)
}

/** The NPS as a number: "1-1/2" -> 1.5. */
function npsValue(nps: string): number {
  const m = /^(?:(\d+)-)?(\d+)(?:\/(\d+))?$/.exec(nps)
  if (!m) return NaN
  const whole = m[1] ? Number(m[1]) : 0
  return m[3] ? whole + Number(m[2]) / Number(m[3]) : whole + Number(m[2])
}

/**
 * The pipe size of a drawing nozzle from its diameter (inches): the NPS when the diameter is one (4 -> "4", 1.5 ->
 * "1-1/2"), else the NPS whose outside diameter it is (4.5 -> "4"); null when it is neither (the user picks).
 */
export function npsForDiameter(diameter: number | null): string | null {
  if (diameter === null || !(diameter > 0)) return null
  const byNps = PIPE_SIZES.find((s) => Math.abs(npsValue(s.nps) - diameter) < 1e-6)
  if (byNps) return byNps.nps
  return PIPE_SIZES.find((s) => Math.abs(s.od - diameter) < 0.01)?.nps ?? null
}

/** "XS, 0.337 in"; a plain schedule number reads "Sch 160, 0.531 in". */
export function wallLabel(w: PipeWall): string {
  const n = w.names[0]
  return `${/^\d+$/.test(n) ? `Sch ${n}` : n}, ${w.wall.toFixed(3)} in`
}

/** The thickest reading may be this much below the wall (mill under-tolerance is 12.5%). */
export const PIPE_PICK_RATIO = 0.875
/** A thickest reading more than this much over the pick is flagged. */
export const PIPE_FLAG_RATIO = 1.15

export interface PipePick {
  wall: PipeWall
  /** The thickest reading is more than 15% over the pick: look at the size or the readings. */
  flagged: boolean
}

/**
 * The suggested nominal for a nozzle (4.4.1): the heaviest standard wall W for its size where the thickest reading at
 * that nozzle (all its rows) is at least 87.5% of W. Null for an unknown size or no reading. When every wall is too
 * heavy (a reading below 87.5% of the thinnest), the thinnest wall is picked.
 */
export function pickPipeWall(nps: string, thickest: number | null): PipePick | null {
  const s = pipeSize(nps)
  if (!s || thickest === null || !(thickest > 0)) return null
  const fits = s.walls.filter((w) => thickest >= PIPE_PICK_RATIO * w.wall - 1e-9)
  const wall = fits.length > 0 ? fits[fits.length - 1] : s.walls[0]
  return { wall, flagged: thickest > PIPE_FLAG_RATIO * wall.wall + 1e-9 }
}
