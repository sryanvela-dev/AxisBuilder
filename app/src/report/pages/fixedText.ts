// AUT Equipment and Guide to Interpretation (design 6.12): the template's fixed text, laid out so nothing is clipped
// (flowing onto another page when long), its pictures in a column on the right. The pictures from the old workbook are
// not in the app yet (client check pending), so each prints as a clearly marked placeholder box.

import { fontBox, wrapText } from '../fonts.ts'
import type { PageItem } from '../pageModel.ts'
import { content, standardPage, type PageBuilder } from './common.ts'
import { COLORS, F, lineHeight, placeholder, text } from './layout.ts'

const SIZE = 9.5
const HEAD = 11

/** "equipment-scanner" -> "Equipment scanner". */
const pictureName = (id: string) => (id.charAt(0).toUpperCase() + id.slice(1)).replace(/-/g, ' ')

export const buildFixedText: PageBuilder = (c, def, title) => {
  const fixed = c.t.fixedPages.find((f) => f.sectionId === def.id)
  if (!fixed) return { pages: [standardPage(c, def, title, title, '', [])], bookmarks: [] }
  const area = content()
  const picW = fixed.images.length ? 3.4 : 0
  const textW = area.w - (picW ? picW + 0.3 : 0)
  // Paragraph blocks: heading + lines, never split from its first line.
  const lh = lineHeight(SIZE)
  type Piece = { kind: 'head'; text: string } | { kind: 'line'; text: string } | { kind: 'gap' }
  const pieces: Piece[] = []
  for (const para of fixed.paragraphs) {
    if (pieces.length) pieces.push({ kind: 'gap' })
    if (para.heading) pieces.push({ kind: 'head', text: para.heading })
    for (const l of wrapText(para.text, F.body, SIZE, textW)) pieces.push({ kind: 'line', text: l })
  }
  const hOf = (p: Piece) => (p.kind === 'head' ? 0.3 : p.kind === 'gap' ? 0.1 : lh)
  const pages: PageItem[][] = [[]]
  let y = area.y
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]
    const need = p.kind === 'head' ? hOf(p) + lh : hOf(p)
    if (y + need > area.y + area.h && p.kind !== 'gap') {
      pages.push([])
      y = area.y
    }
    if (p.kind === 'gap') {
      if (y > area.y) y += hOf(p)
      continue
    }
    const items = pages[pages.length - 1]
    if (p.kind === 'head') items.push(text(area.x, y + fontBox(F.title, HEAD).ascent, p.text, F.title, HEAD, COLORS.blue))
    else items.push(text(area.x, y + (lh - fontBox(F.body, SIZE).ascent - fontBox(F.body, SIZE).descent) / 2 + fontBox(F.body, SIZE).ascent, p.text, F.body, SIZE))
    y += hOf(p)
  }
  // Pictures: placeholders down the right of the first page.
  if (picW) {
    const n = fixed.images.length
    const gap = 0.16
    const h = Math.min(1.9, (area.h - gap * (n - 1)) / n)
    fixed.images.forEach((id, i) => {
      const box = { x: area.x + area.w - picW, y: area.y + i * (h + gap), w: picW, h }
      pages[0].push(...placeholder(box, `Picture to come: ${pictureName(id)}`))
    })
    c.notes.push(`${title}: ${n} template picture${n === 1 ? '' : 's'} print as placeholders (${fixed.images.join(', ')}); the pictures are not in the app yet.`)
  }
  return { pages: pages.map((items, i) => standardPage(c, def, i ? `${title} ${i + 1}` : title, title, '', items)), bookmarks: [] }
}
