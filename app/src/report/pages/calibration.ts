// Calibration (design 6.4): the job, procedure, material, calibration block, AUT system, transducers (filled channels
// only), scanner and settings in boxes (blank fields are left out, never "X"), the dynamic calibration screenshot and
// the template's notes.

import { fontBox, measure, wrapText } from '../fonts.ts'
import type { PageItem, Rect } from '../pageModel.ts'
import { content, placeImage, standardPage, type BuildContext, type PageBuilder } from './common.ts'
import { COLORS, F, line, text, textBlock, titledBox } from './layout.ts'
import { examinationType, headerNominal, inch, longDate, noteText } from './values.ts'

type Row = [string, string]
interface Box {
  title: string
  rows: Row[]
  /** A small table instead of rows (transducers). */
  table?: { head: string[]; body: string[][] }
}

const SIZE = 7.8
const ROW_H = 0.17

function boxes(c: BuildContext): Box[] {
  const { p, r, t } = c
  const cal = r.calibration
  const keep = (rows: Row[]) => rows.filter(([, v]) => v.trim() !== '')
  const out: Box[] = [
    { title: 'Job', rows: keep([['Job number', r.job.jobNumber], ['Report revision', r.job.reportRevision], ['Date', longDate(p.project.date)], ['Examination', examinationType(r, t)], ['Examiners', r.job.techs.map((x) => x.name).filter((x) => x.trim()).join(', ')]]) },
    { title: 'Procedure', rows: keep([['Procedure', p.project.procedure], ['Revision', r.job.procedureRevision], ['Acceptance criteria', r.job.acceptanceCriteria], ['Technique', r.job.technique]]) },
    { title: 'Material and surface', rows: keep([['Material', p.project.material], ["Nominal 'T'", headerNominal(r)], ['Surface condition', r.job.surfaceCondition], ['Inspection surface', r.job.inspectionSurface]]) },
    { title: 'Calibration block', rows: keep([['Block', cal.block.name], ['Thickness range', cal.block.thicknessRange], ['Material', cal.block.material], ['Reference reflector', cal.referenceReflector]]) },
    { title: 'AUT system', rows: keep([['Maker', cal.system.maker], ['Model', cal.system.model], ['S/N', cal.system.serial]]) },
  ]
  const channels = cal.transducers.filter((x) => Object.values(x).some((v) => String(v).trim() !== ''))
  if (channels.length) {
    // One row per filled channel: maker, mode, element, size, frequency, angle, S/N (blank parts left out).
    const words = (x: (typeof channels)[number]) => [x.maker, x.mode, x.element, x.size, x.frequency, x.angle, x.serial && `S/N ${x.serial}`].filter((s) => s && s.trim()).join(' · ')
    out.push({ title: 'Transducers', rows: channels.map((x, i): Row => [channels.length > 1 ? `Channel ${i + 1}` : 'Transducer', words(x)]) })
  }
  const s = cal.scanner
  const yes = (b: boolean | null) => (b === null ? '' : b ? 'Yes' : 'No')
  out.push({
    title: 'Scanner and settings',
    rows: keep([
      ['Maker', s.maker], ['Model', s.model], ['S/N', s.serial], ['Drive', s.drive],
      ['Wheels', [s.wheelsOrientation, s.wheelsDirection, s.wheelsScanSpeed && `speed ${s.wheelsScanSpeed}`].filter(Boolean).join(', ')],
      ['Arm', [s.armOrientation, s.armDirection, s.armScanSpeed && `speed ${s.armScanSpeed}`, s.armLength && `length ${s.armLength}`].filter(Boolean).join(', ')],
      ['Track', yes(s.track)],
      ['Increments', cal.increments.x !== null || cal.increments.y !== null ? `(X) ${cal.increments.x !== null ? inch(cal.increments.x) : '–'} x (Y) ${cal.increments.y !== null ? inch(cal.increments.y) : '–'}` : ''],
      ['Temperature correction', r.options.tempCorrection.on ? (r.options.tempCorrection.tempF !== null ? `On, ${r.options.tempCorrection.tempF} °F` : 'On') : ''],
    ]),
  })
  return out.filter((b) => b.rows.length > 0 || b.table)
}

function boxHeight(b: Box, w: number): number {
  const inner = w - 0.28
  const labelW = Math.min(1.35, inner * 0.45)
  const rows = b.rows.reduce((a, [, v]) => a + Math.max(1, wrapText(v, F.body, SIZE, inner - labelW).length) * ROW_H, 0)
  const table = b.table ? (b.table.body.length + 1) * ROW_H : 0
  return 3 / 72 + 0.11 + 0.3 + rows + table + 0.12
}

function boxItems(b: Box, r: Rect): PageItem[] {
  const tb = titledBox(r, b.title)
  const items = [...tb.items]
  const inner = tb.inner
  const labelW = Math.min(1.35, inner.w * 0.45)
  let y = inner.y
  const base = (top: number) => top + ROW_H / 2 + fontBox(F.body, SIZE).cap / 2
  for (const [k, v] of b.rows) {
    const lines = wrapText(v, F.body, SIZE, inner.w - labelW)
    items.push(text(inner.x, base(y), k, F.label, SIZE, COLORS.deep))
    lines.forEach((l, i) => items.push(text(inner.x + labelW, base(y + i * ROW_H), l, F.body, SIZE)))
    y += Math.max(1, lines.length) * ROW_H
    items.push(line(inner.x, y, inner.x + inner.w, y, 0.4, COLORS.line))
  }
  if (b.table) {
    const cols = b.table.head.length
    const widths = b.table.head.map((h, i) => Math.max(measure(h, F.heading, 7), ...b.table!.body.map((row) => measure(row[i], F.body, SIZE))) + 0.08)
    const k = inner.w / widths.reduce((a, x) => a + x, 0)
    const xs = widths.reduce<number[]>((a, w) => [...a, a[a.length - 1] + w * k], [inner.x])
    b.table.head.forEach((h, i) => items.push(text(xs[i] + 0.03, base(y), h, F.heading, 7, COLORS.deep)))
    y += ROW_H
    items.push(line(inner.x, y, inner.x + inner.w, y, 0.6, COLORS.deep))
    for (const row of b.table.body) {
      for (let i = 0; i < cols; i++) items.push(text(xs[i] + 0.03, base(y), row[i], F.body, SIZE))
      y += ROW_H
      items.push(line(inner.x, y, inner.x + inner.w, y, 0.4, COLORS.line))
    }
  }
  return items
}

export const buildCalibration: PageBuilder = (c, def, title) => {
  const area = content()
  const rightW = 3.55
  const gap = 0.2
  const leftW = area.w - rightW - gap
  const colW = (leftW - gap) / 2
  const items: PageItem[] = []
  const cols = [area.y, area.y]
  for (const b of boxes(c)) {
    const h = boxHeight(b, colW)
    const col = cols[0] <= cols[1] ? 0 : 1
    items.push(...boxItems(b, { x: area.x + col * (colW + gap), y: cols[col], w: colW, h }))
    cols[col] += h + 0.14
  }
  if (Math.max(...cols) > area.y + area.h + 0.01) c.notes.push('Calibration: the boxes run past the page; shorten the longest entries.')

  // Screenshot and notes on the right.
  const rx = area.x + leftW + gap
  const notes = [noteText(c.t, 'calibration'), c.r.options.tempCorrection.on ? noteText(c.t, 'temperature') : null].filter((x): x is string => !!x)
  const noteH = notes.reduce((a, n) => a + wrapText(n, F.body, 7.8, rightW).length * 0.145 + 0.08, 0)
  const shotArea = { x: rx, y: area.y, w: rightW, h: area.h - noteH - 0.4 }
  items.push(text(rx, area.y - 0.06, 'Dynamic calibration', F.heading, 9, COLORS.blue))
  const shot = placeImage(c, c.r.calibration.dynamicImage ? { source: 'calibration', file: c.r.calibration.dynamicImage } : null, c.r.calibration.dynamicImageEdits, { ...shotArea, y: shotArea.y + 0.06 }, 'No calibration screenshot', 'top', true)
  items.push(...shot.items)
  let y = shot.box.y + shot.box.h + 0.18
  for (const n of notes) {
    const b = textBlock(n, rx, y, rightW, F.body, 7.8, COLORS.muted, { k: 1.3 })
    items.push(...b.items)
    y += b.height + 0.08
  }
  return { pages: [standardPage(c, def, title, title, '', items)], bookmarks: [] }
}
