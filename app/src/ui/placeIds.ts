// Element ids of settings, table rows and lists, so a list of problems can jump to them.

import type { CheckPlace } from '../data/checks.ts'

export function settingElementId(section: string, key: string): string {
  return `setting-${section}-${key}`
}

export function rowElementId(list: string, index: number): string {
  return `row-${list}-${index}`
}

export function photoElementId(scanIndex: number): string {
  return `photo-${scanIndex}`
}

export function listElementId(list: string): string {
  return `list-${list}`
}

/** Scrolls to a setting or row and puts the cursor in it (in the cell of the field, when given). */
export function jumpTo(place: CheckPlace) {
  const id =
    place.kind === 'setting' ? settingElementId(place.section, place.key)
      : place.kind === 'row' ? rowElementId(place.list, place.index)
        : place.kind === 'photo' ? photoElementId(place.index)
          : listElementId(place.list)
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const cell = place.kind === 'row' && place.field ? el.querySelector<HTMLElement>(`[data-field="${place.field}"] [data-cell]`) : null
  ;(cell ?? el.querySelector<HTMLElement>('input, select, textarea'))?.focus({ preventScroll: true })
}
