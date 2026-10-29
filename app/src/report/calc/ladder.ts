// Wall loss, the comment ladder and the comment builder (report design 4.3.1 and 8). Pure functions; the wording and
// cutoffs come from the template, so a client template can change them.

import type { LadderColor, LadderDef } from '../templates/types.ts'

/** Wall loss % against the row's own nominal: (1 - min / nominal) x 100; negative when thicker than nominal. */
export function wallLossPercent(minT: number | null, nominal: number | null): number | null {
  if (minT === null || nominal === null || !(nominal > 0)) return null
  return (1 - minT / nominal) * 100
}

/** Wall loss as printed: two decimals, "2.72%". */
export function formatWallLoss(wallLoss: number): string {
  return `${wallLoss.toFixed(2)}%`
}

/**
 * The ladder band of a wall loss (0 = the mildest): <= cutoff[0] is band 0, > cutoff[0] up to cutoff[1] band 1, and so
 * on; above the last cutoff the last band. Negative wall loss (thicker than nominal) is band 0. Compared at the printed
 * two decimals, so a printed 5.00% is never called Minor.
 */
export function ladderBand(wallLoss: number, cutoffs: readonly number[]): number {
  const shown = Math.round(wallLoss * 100) / 100
  let band = 0
  while (band < cutoffs.length && shown > cutoffs[band]) band++
  return band
}

/** Print colour of a wall loss (design 8: No significant and Minor black, Moderate amber, Significant red). */
export function ladderColor(ladder: LadderDef, band: number): LadderColor {
  return ladder.colors[Math.min(band, ladder.colors.length - 1)]
}

/** The comment builder's picks on a scan result or a manual reading. */
export interface CommentPicks {
  severityOverride: string | null
  form: string
  cause: string
  surface: string
  midWall: string
  commentOverride: string | null
}

export interface BuiltComment {
  text: string
  /** Severity choice id used (the ladder's, or the override). */
  severity: string
  /** Severity chosen by hand and different from the ladder (flagged). */
  severityOverridden: boolean
  /** Free text replaces the built comment (flagged). */
  freeText: boolean
}

const words = (list: LadderDef['forms'], id: string) => list.find((c) => c.id === id)?.words ?? ''

/**
 * "[Severity] [form] [surface] [cause] detected." plus "Mid-wall [indication] detected." when one is picked (design
 * 4.3.1). A form that is a noun (pitting) comes after the surface and stands in for a blank cause: "Moderate I.D.
 * pitting detected.", "Moderate I.D. pitting corrosion detected.". A blank cause reads "wall loss" otherwise. The app
 * never names a cause the tech didn't pick, and the wall loss figure is never written in the comment.
 */
export function buildComment(ladder: LadderDef, band: number, picks: CommentPicks): BuiltComment {
  const ladderSeverity = ladder.severity[Math.min(band, ladder.severity.length - 1)]
  const picked = picks.severityOverride === null ? undefined : ladder.severity.find((s) => s.id === picks.severityOverride)
  const severity = picked ?? ladderSeverity
  const base = { severity: severity.id, severityOverridden: picked !== undefined && picked.id !== ladderSeverity.id }
  if (picks.commentOverride !== null && picks.commentOverride.trim() !== '') {
    return { ...base, text: picks.commentOverride.trim(), freeText: true }
  }
  const form = words(ladder.forms, picks.form)
  const noun = ladder.formIsNoun.includes(picks.form)
  const cause = picks.cause === '' ? '' : words(ladder.causes, picks.cause)
  const blankCause = words(ladder.causes, '')
  const surface = words(ladder.surfaces, picks.surface)
  const parts = noun
    ? [severity.words, surface, form, cause]
    : [severity.words, form, surface, cause || blankCause]
  let text = `${parts.filter((w) => w !== '').join(' ')} detected.`
  const mid = words(ladder.midWall, picks.midWall)
  if (mid !== '') text += ` Mid-wall ${mid.toLowerCase()} detected.`
  return { ...base, text, freeText: false }
}
