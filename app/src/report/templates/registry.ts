// The report templates the app knows. A new template (XTO Horizontal, API 653 Tank, a client's) is one more entry here
// plus any page type it needs; nothing else changes.

import { GENERIC_AUT } from './generic.ts'
import type { ReportTemplate } from './types.ts'

export const TEMPLATES: readonly ReportTemplate[] = [GENERIC_AUT]

export const DEFAULT_TEMPLATE_ID = GENERIC_AUT.id

/** The template with this id, or undefined (a job made with a template this app doesn't have). */
export function findTemplate(id: string): ReportTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

/** The template a job uses; throws for an unknown id (callers check findTemplate first where that can happen). */
export function templateOf(id: string): ReportTemplate {
  const t = findTemplate(id)
  if (!t) throw new Error(`Unknown report template "${id}".`)
  return t
}
