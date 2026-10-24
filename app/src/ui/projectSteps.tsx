// The Project, Field data and Drawing steps: settings forms (from settings.ts) and the field data tables.

import { FIELD_LISTS } from '../data/columns.ts'
import { formatNumber } from '../data/parse.ts'
import { LIST_META } from '../data/schema.ts'
import { SETTING_GROUPS, VESSEL_FIELDS } from '../data/settings.ts'
import type { StepStatus } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { useJobChecks } from './checksContext.ts'
import { DataTable } from './DataTable.tsx'
import { listElementId } from './placeIds.ts'
import { SettingsGroup } from './SettingsForm.tsx'
import { ImportReportPart, StepIssues } from './stepParts.tsx'

type StepProps = { status: StepStatus }

export function ProjectStep({ status }: StepProps) {
  return (
    <>
      <StepIssues status={status} />
      {SETTING_GROUPS.filter((g) => g.step === 'Project').map((g) => (
        <SettingsGroup key={g.id} group={g.id} step="project" />
      ))}
      <ImportReportPart step="project" />
    </>
  )
}

/** The Drawing step: how the drawing looks, with the preview beside it (wider on this step). */
export function DrawingStep({ status }: StepProps) {
  return (
    <>
      <StepIssues status={status} />
      <nav className="list-nav" aria-label="Drawing settings">
        {SETTING_GROUPS.filter((g) => g.step === 'Drawing').map((g) => (
          <button key={g.id} type="button" className="list-chip" onClick={() => document.getElementById(`group-${g.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
            {g.title}
          </button>
        ))}
      </nav>
      {SETTING_GROUPS.filter((g) => g.step === 'Drawing').map((g) => (
        <SettingsGroup key={g.id} group={g.id} step="drawing" />
      ))}
    </>
  )
}

export function FieldDataStep({ status }: StepProps) {
  const app = useApp()
  const { checks } = useJobChecks()
  const p = app.state.job!.history.present
  const counts = (list: (typeof FIELD_LISTS)[number]) => {
    const own = checks.filter((c) => (c.place.kind === 'row' || c.place.kind === 'list') && c.place.list === list)
    return { errors: own.filter((c) => c.severity === 'error').length, warnings: own.filter((c) => c.severity === 'warning').length }
  }
  const size = (v: number | null) => (v === null ? 'not entered' : `${formatNumber(v)} in`)
  return (
    <>
      <StepIssues status={status} />
      <p className="muted">
        Positions are in inches. X goes around the shell (0 to the {VESSEL_FIELDS.height.name.toLowerCase()}, {size(p.vessel.height)}), Y goes
        along it (0 to the {VESSEL_FIELDS.length.name.toLowerCase()}, {size(p.vessel.length)}). Lengths can be typed as 12.5, 12 1/2 or 10' 6".
      </p>
      <nav className="list-nav" aria-label="Field data lists">
        {FIELD_LISTS.map((list) => {
          const c = counts(list)
          return (
            <button
              key={list}
              type="button"
              className="list-chip"
              onClick={() => document.getElementById(listElementId(list))?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
            >
              {LIST_META[list].name} <span className="muted">({p[list].length})</span>
              {c.errors > 0 && <span className="kind kind-invalid">{c.errors}</span>}
              {c.warnings > 0 && <span className="kind kind-review">{c.warnings}</span>}
            </button>
          )
        })}
      </nav>
      {FIELD_LISTS.map((list) => (
        <div key={list}>
          {list === 'headNozzles' && <SettingsGroup group="heads" step="fieldData" />}
          <section className="list-section" id={listElementId(list)} aria-labelledby={`list-title-${list}`}>
            <h2 id={`list-title-${list}`}>
              {LIST_META[list].name} <span className="muted">({p[list].length})</span>
            </h2>
            <DataTable list={list} step="fieldData" />
          </section>
        </div>
      ))}
      <ImportReportPart step="fieldData" />
    </>
  )
}
