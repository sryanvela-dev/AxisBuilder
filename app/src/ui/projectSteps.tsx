// The Project, Field data and Drawing steps: settings forms (from settings.ts) and the field data tables.

import { Fragment } from 'react'
import { resetAllOverrides } from '../data/overrides.ts'
import { FIELD_LISTS } from '../data/columns.ts'
import { scrollPageTo } from './scrollPage.ts'
import { formatNumber } from '../data/parse.ts'
import { LIST_META } from '../data/schema.ts'
import { SETTING_GROUPS, VESSEL_FIELDS } from '../data/settings.ts'
import { sectionPlan } from '../engine/sections.ts'
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
          <button key={g.id} type="button" className="list-chip" onClick={() => scrollPageTo(document.getElementById(`group-${g.id}`))}>
            {g.title}
          </button>
        ))}
      </nav>
      {SETTING_GROUPS.filter((g) => g.step === 'Drawing').map((g) =>
        g.id === 'sections' ? (
          <SectionSheets key={g.id} />
        ) : g.id === 'leaders' ? (
          <Fragment key={g.id}>
            <SettingsGroup group={g.id} step="drawing" />
            <MovedLabels />
          </Fragment>
        ) : (
          <SettingsGroup key={g.id} group={g.id} step="drawing" />
        ),
      )}
    </>
  )
}

/** Labels moved by hand in the preview (Move labels): how many, and "Reset all moved labels" (asks first). */
function MovedLabels() {
  const app = useApp()
  const count = app.state.job!.history.present.labelOverrides.length
  async function resetAll() {
    const answer = await app.ask({
      title: 'Reset all moved labels?',
      message: <p>{count === 1 ? 'The label you moved goes' : `All ${count} labels you moved go`} back to automatic placement. You can undo this.</p>,
      buttons: [
        { id: 'reset', label: 'Reset all', primary: true },
        { id: 'cancel', label: 'Cancel' },
      ],
      cancelId: 'cancel',
    })
    if (answer === 'reset') app.edit('Reset all moved labels', resetAllOverrides)
  }
  return (
    <section className="moved-labels" aria-label="Labels moved by hand">
      <p className="muted">
        {count === 0
          ? 'To move a nozzle label or its leader end, click Move labels above the drawing preview and drag it.'
          : `${count === 1 ? '1 nozzle label is' : `${count} nozzle labels are`} moved by hand (Move labels in the drawing preview). Changing the leader shape, arrowhead or text size keeps them where you put them.`}
      </p>
      {count > 0 && (
        <button type="button" className="btn btn-small" onClick={resetAll}>
          Reset all moved labels
        </button>
      )}
    </section>
  )
}

/** Section sheets: the settings and the plan they give (engine/sections.ts). */
function SectionSheets() {
  const app = useApp()
  const p = app.state.job!.history.present
  const vertical = p.vessel.orientation === 'Vertical'
  const plan = sectionPlan(p)
  return (
    <>
      <SettingsGroup group="sections" step="drawing" />
      {typeof plan !== 'string' && (
        <section className="section-plan" aria-label="Section plan">
          <h3>
            The plan: {plan.sections.length} section sheet{plan.sections.length === 1 ? '' : 's'}
            {plan.overview ? ' after an overview sheet' : ''}
          </h3>
          {plan.problems.map((t) => (
            <p key={t} className="msg msg-warning">
              {t}
            </p>
          ))}
          {plan.notes.map((t) => (
            <p key={t} className="muted">
              {t}
            </p>
          ))}
          {plan.sections.length > 0 && (
            <table className="report">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Along the shell</th>
                  <th>Sheet shows</th>
                  <th>Scale</th>
                  <th>Smallest scan label</th>
                </tr>
              </thead>
              <tbody>
                {plan.sections.map((s) => (
                  <tr key={s.n}>
                    <td>{s.n}</td>
                    <td>
                      {formatNumber(s.start)} to {formatNumber(s.end)} in
                    </td>
                    <td>
                      {formatNumber(s.viewStart)} to {formatNumber(s.viewEnd)} in
                    </td>
                    <td>1:{formatNumber(Math.round(10 / s.scale) / 10)}</td>
                    <td>{s.smallestLabel === null ? <span className="muted">no scans</span> : `${formatNumber(Math.round(s.smallestLabel * 1000) / 1000)} in`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted">
            The preview's Sheets button shows each sheet as it prints.{' '}
            {vertical
              ? 'Vertical sheets (the length up the sheet) are made by the app; the CAD command builds horizontal layouts only, so for this job they come with the PDF export.'
              : 'In CAD: after loading the drawing, switch to the letter-size Sheet tab and type ABSECTIONSHEETS.'}
          </p>
        </section>
      )}
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
              onClick={() => scrollPageTo(document.getElementById(listElementId(list)))}
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
