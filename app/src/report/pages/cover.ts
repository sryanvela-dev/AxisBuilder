// Cover (design 6.1, as the style sample): logo, job number and revision, the template's title with a blue side bar,
// the cover fields in two columns, the cover photo (fitted, never stretched; no photo closes the space up), examiners
// with their titles, the date, the optional reviewer, and the deep blue foot strip. Portrait letter.

import { fontBox, measure, wrapText } from '../fonts.ts'
import { imageKey, type PageItem } from '../pageModel.ts'
import type { FieldRef } from '../templates/types.ts'
import { type BuildContext, type PageBuilder, placeImage, stepOf } from './common.ts'
import { COLORS, F, LETTER_PORTRAIT, LOGO, line, rect, text } from './layout.ts'
import { fieldValue } from './values.ts'

/** Cover fields of the two-column grid: everything but the people and the date, optional ones only when turned on. */
function gridFields(c: BuildContext): { label: string; value: string }[] {
  const people = new Set(['report.job.techs', 'report.job.reviewer', 'project.date'])
  return c.t.coverFields
    .filter((f) => !people.has(f.source) && (!f.optional || c.r.job.coverExtras.includes(f.source)))
    .map((f: FieldRef) => ({ label: f.label, value: fieldValue(c.p, c.r, c.t, f) }))
    .filter((f) => f.value !== '')
}

export const buildCover: PageBuilder = (c, def) => {
  const W = LETTER_PORTRAIT.w
  const H = LETTER_PORTRAIT.h
  const L = 0.7
  const R = W - 0.7
  const items: PageItem[] = []
  const logoW = 2.2
  items.push({ t: 'image', ref: { source: 'brand', file: LOGO.file }, x: L, y: 0.6, w: logoW, h: logoW / LOGO.aspect, upright: { w: 900, h: 243 }, orientation: 1, rotate: 0, crop: null, marks: [], key: imageKey({ source: 'brand', file: LOGO.file }, null) })
  const job = c.r.job.jobNumber.trim()
  const rev = c.r.job.reportRevision.trim()
  if (job) items.push(text(R, 0.78, `Job ${job}`, F.body, 8, COLORS.muted, 'right'))
  if (rev) items.push(text(R, job ? 0.93 : 0.78, `Rev ${rev}`, F.body, 8, COLORS.muted, 'right'))

  // Title with the blue side bar.
  let y = 1.75
  const titleTop = y
  items.push(text(L + 0.27, y + fontBox(F.heading, 11).ascent, c.t.title[0].toUpperCase(), F.heading, 11, COLORS.blue))
  y += 0.24
  const titleLines = wrapText(c.t.title[1], F.title, 26, 4.6)
  for (const l of titleLines) {
    items.push(text(L + 0.27, y + fontBox(F.title, 26).ascent * 0.95, l, F.title, 26, COLORS.deep))
    y += (26 * 1.15) / 72
  }
  items.push(rect({ x: L, y: titleTop, w: 5 / 72, h: y - titleTop + 0.04 }, COLORS.blue))

  // Two-column fields.
  y += 0.45
  const fields = gridFields(c)
  const colW = (R - L - 0.33) / 2
  fields.forEach((f, i) => {
    const x = L + (i % 2) * (colW + 0.33)
    const top = y + Math.floor(i / 2) * 0.52
    items.push(text(x, top + 0.1, f.label.toUpperCase(), F.label, 7.5, COLORS.deep))
    items.push(text(x, top + 0.31, f.value, F.body, 11))
  })
  y += Math.ceil(fields.length / 2) * 0.52 + 0.15

  // People block at the foot (laid out first, so the photo knows how much room it has).
  const techs = c.r.job.techs.filter((t) => t.name.trim())
  const reviewer = c.r.job.reviewer && c.r.job.reviewer.name.trim() ? c.r.job.reviewer : null
  const date = fieldValue(c.p, c.r, c.t, { source: 'project.date', label: 'Date' })
  const rowH = 0.27
  const rows = Math.max(techs.length, 1) + (date ? 1 : 0) + (reviewer ? 1 : 0)
  const footTop = H - 0.7 - 0.2 - rows * rowH
  const label = (s: string) => s
  const byLabel = c.t.coverFields.find((f) => f.source === 'report.job.techs')?.label ?? 'Examination & Report By'
  const revLabel = c.t.coverFields.find((f) => f.source === 'report.job.reviewer')?.label ?? 'Report Reviewed By'
  items.push(line(L, footTop, R, footTop, 2, COLORS.blue))
  const nameX = L + Math.max(measure(byLabel, F.label, 10), measure(revLabel, F.label, 10), measure('Date', F.label, 10)) + 0.3
  let fy = footTop + 0.3
  if (techs.length) {
    items.push(text(L, fy, label(byLabel), F.label, 10, COLORS.deep))
    for (const t of techs) {
      items.push(text(nameX, fy, t.name.trim(), F.body, 10))
      if (t.title.trim()) items.push(text(R, fy, t.title.trim(), F.body, 10, COLORS.muted, 'right'))
      fy += rowH
    }
  }
  if (reviewer) {
    items.push(text(L, fy, revLabel, F.label, 10, COLORS.deep))
    items.push(text(nameX, fy, reviewer.name.trim(), F.body, 10))
    if (reviewer.title.trim()) items.push(text(R, fy, reviewer.title.trim(), F.body, 10, COLORS.muted, 'right'))
    fy += rowH
  }
  if (date) {
    items.push(text(L, fy + 0.06, 'Date', F.label, 10, COLORS.deep))
    items.push(text(nameX, fy + 0.06, date, F.body, 10))
  }

  // Cover photo between the fields and the people, fitted (no photo: the space closes up).
  if (c.r.coverPhoto) {
    const area = { x: L, y, w: R - L, h: Math.min(4.2, footTop - 0.35 - y) }
    if (area.h > 1) items.push(...placeImage(c, { source: 'cover', file: c.r.coverPhoto }, c.r.coverPhotoEdits, area, 'No cover photo', 'center', false, { kind: 'cover' }).items)
  }

  // Foot strip.
  items.push(rect({ x: 0, y: H - 0.18, w: W, h: 0.18 }, COLORS.deep))
  items.push(rect({ x: R - 1.2, y: H - 0.18 - 0.05, w: 1.2, h: 0.05 }, COLORS.orange))
  return { pages: [{ size: LETTER_PORTRAIT, sectionId: def.id, step: stepOf(def), label: 'Cover', footer: 'none', items }], bookmarks: [] }
}
