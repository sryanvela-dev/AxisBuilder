// Tests of the drawing rules (v5.0 placement, Scale / Fixed height, panel room) start from the automatic text sizes:
// since 2026-10-25 several text types default to a fixed height (settings.ts textStyle `fixed`).
import type { Project } from '../src/data/schema.ts'
import { TEXT_TYPES } from '../src/data/settings.ts'

/** Every text size Automatic, as the drawing made them before the fixed default heights. */
export const AUTOMATIC_TEXT = Object.fromEntries(TEXT_TYPES.map((t) => [`${t.key}Size`, 'Automatic'])) as Partial<Project['settings']>

export function automaticText(p: Project): Project {
  return { ...p, settings: { ...p.settings, ...AUTOMATIC_TEXT } }
}
