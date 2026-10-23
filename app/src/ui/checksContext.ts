// The open job's checks and import report notes, worked out once per change and read by every
// field and table row on the step pages.

import { createContext, useContext } from 'react'
import type { Check } from '../data/checks.ts'
import { idKey } from '../data/schema.ts'
import type { ReportEntry } from '../data/xlsmImport.ts'
import type { StepId, WorkbookImport } from '../state/session.ts'

export interface JobChecks {
  checks: Check[]
  workbookImport: WorkbookImport | null
}

export const ChecksContext = createContext<JobChecks>({ checks: [], workbookImport: null })

export function useJobChecks(): JobChecks {
  return useContext(ChecksContext)
}

export function settingChecks(checks: Check[], section: string, key: string): Check[] {
  return checks.filter((c) => c.place.kind === 'setting' && c.place.section === section && c.place.key === key)
}

/** Report entries worth showing next to a setting or row: values to check and values changed on import. */
export function reportNotesFor(
  wb: WorkbookImport | null,
  step: StepId,
  target: { kind: 'setting'; section: string; key: string } | { kind: 'row'; list: string; id: string },
): ReportEntry[] {
  if (!wb?.targets || wb.checkedSteps.includes(step)) return []
  return wb.report.filter((e, i) => {
    if (e.kind !== 'invalid' && e.kind !== 'review' && e.kind !== 'changed') return false
    const t = wb.targets![i]
    if (!t || t.kind !== target.kind) return false
    if (t.kind === 'setting' && target.kind === 'setting') return t.section === target.section && t.key === target.key
    if (t.kind === 'row' && target.kind === 'row') return t.list === target.list && idKey(t.id) === idKey(target.id)
    return false
  })
}

export const REPORT_KIND_TEXT: Record<string, string> = {
  invalid: 'Not usable in Excel',
  review: 'Check this',
  changed: 'Changed on import',
}
