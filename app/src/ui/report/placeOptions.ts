// Where a custom sheet or an uploaded page prints (design 4.8): in its own section, or after another section that is on.

import type { Project } from '../../data/schema.ts'
import { sectionOn, sectionTitle } from '../../report/edits.ts'
import { DEFAULT_PLACE_AFTER } from '../../report/schema.ts'
import { templateOf } from '../../report/templates/registry.ts'
import type { SectionDef } from '../../report/templates/types.ts'

/** "Print after" choices: its own section, or after any other section that is on. */
export function placeOptions(r: NonNullable<Project['report']>, own: SectionDef | undefined): { value: string; label: string }[] {
  const t = templateOf(r.templateId)
  const own0 = own ? [{ value: own.id, label: `In its own section (${sectionTitle(r, own)})` }] : []
  return [
    ...own0,
    ...t.sections
      .filter((d) => d.id !== own?.id && d.pageType !== 'cover' && d.pageType !== 'contents' && d.pageType !== 'custom' && d.pageType !== 'uploaded' && sectionOn(r, d))
      .map((d) => ({ value: d.id, label: `After ${sectionTitle(r, d)}` })),
  ]
}

/** The "print after" value as the select shows it (the default place is the own section). */
export const placeValue = (after: string, own: SectionDef | undefined) => (after === DEFAULT_PLACE_AFTER || after === own?.id ? own?.id ?? after : after)
