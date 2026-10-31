// Report step 1, Setup (design 5): the template, the job fields the report shares with the drawing (read-only here),
// the report's own job fields (4.1), examiners and the reviewer, optional cover fields, the components (4.0), which
// sections are in the report (4.8) and the cover photo.

import { Fragment } from 'react'
import { SettingFieldFor } from '../SettingsForm.tsx'
import {
  ADDABLE_KINDS,
  KIND_NAMES,
  addComponent,
  addListItem,
  componentUses,
  moveListItem,
  optionalCoverFields,
  removeComponent,
  removeListItem,
  sectionOn,
  sectionTitle,
  setCoverExtra,
  setReportValue,
  setSectionOn,
  setSectionTitle,
  switchTemplate,
  updateComponent,
} from '../../report/edits.ts'
import { COMPONENT_KINDS, type Component } from '../../report/schema.ts'
import { TEMPLATES, templateOf } from '../../report/templates/registry.ts'
import { plural } from '../../state/steps.ts'
import { useApp } from '../appContext.ts'
import { Flag, ReportBox, ReportCheckbox, ReportSelect, RowMessages, type Message } from './boxes.tsx'
import { PhotoPick } from './PhotoPick.tsx'
import { reportPlaceId } from './places.ts'
import { ReportStepIssues, type ReportStepProps } from './ReportWorkspace.tsx'
import { RecordPicker, SavedListsButton } from './SavedListsUi.tsx'

const STEP = 'setup' as const

/** The shared job fields the report prints, from the Project step. */
const SHARED_FIELDS = ['client', 'location', 'component', 'equipmentName', 'equipmentType', 'unit', 'date'] as const

export function SetupStep({ status }: ReportStepProps) {
  const app = useApp()
  const p = app.state.job!.history.present
  const report = p.report!
  const template = templateOf(report.templateId)
  return (
    <>
      <ReportStepIssues status={status} />
      <section className="settings-group">
        <div className="group-head">
          <div>
            <h2>Template</h2>
            <p className="muted">Which report this is. Switching keeps everything entered.</p>
          </div>
          <SavedListsButton />
        </div>
        <div className="field-grid">
          <ReportSelect label="Report template" value={report.templateId} options={TEMPLATES.map((t) => ({ value: t.id, label: t.name }))}
            set={(q, v: string) => switchTemplate(q, v)} boxKey="report.templateId" step={STEP} help={`${template.title.join(' ')}. More templates come later.`} />
        </div>
      </section>

      <section className="settings-group">
        <div className="group-head">
          <div>
            <h2>From the job</h2>
            <p className="muted">Shared with the drawing: a change here is a change on the Project step too (and the other way round).</p>
          </div>
        </div>
        <div className="field-grid">
          <SettingFieldFor section="project" keys={SHARED_FIELDS} step="project" />
          {/* The procedure is the project's own field, here as a dropdown of saved procedures (user, 2026-10-30). */}
          <ReportBox label="Procedure" value={p.project.procedure} list="procedure" set={(q, v: string) => ({ ...q, project: { ...q.project, procedure: v } })}
            boxKey="project.procedure" step={STEP} help="Inspection procedure number. Shared with the drawing's Project step." />
          <SettingFieldFor section="project" keys={['material']} step="project" />
          <SettingFieldFor section="vessel" keys={['height', 'length']} step="project" />
        </div>
      </section>

      <section className="settings-group">
        <div className="group-head">
          <div>
            <h2>Report job fields</h2>
            <p className="muted">Only in the report. Boxes with suggestions remember new values on this computer.</p>
          </div>
        </div>
        <div className="field-grid">
          <JobBox field="jobNumber" label="Job number" help="Printed on the cover and in the footer." />
          <JobBox field="reportRevision" label="Report revision" />
          <JobBox field="procedureRevision" label="Procedure revision" help={`Revision of the procedure (${p.project.procedure || 'Project step'}).`} />
          <JobBox field="examinationType" label="Examination type" list="examinationType" placeholder={template.jobDefaults.examinationType}
            help={`Blank = ${template.jobDefaults.examinationType}.`} />
          <JobBox field="acceptanceCriteria" label="Acceptance criteria" list="acceptanceCriteria" />
          <JobBox field="surfaceCondition" label="Surface condition" list="surfaceCondition" />
          <JobBox field="inspectionSurface" label="Inspection surface" list="inspectionSurface" />
          <JobBox field="technique" label="Technique" list="technique" />
        </div>
      </section>

      <Examiners />
      <CoverFields />
      <Components status={status} />
      <Sections />

      <section className="settings-group">
        <div className="group-head">
          <div>
            <h2>Cover photo</h2>
            <p className="muted">Pick the photo itself, whatever it is called. No photo: the cover closes up the space.</p>
          </div>
        </div>
        <CoverPhoto />
      </section>
    </>
  )
}

function JobBox({ field, label, help, list, placeholder }: { field: 'jobNumber' | 'reportRevision' | 'procedureRevision' | 'examinationType' | 'acceptanceCriteria' | 'surfaceCondition' | 'inspectionSurface' | 'technique' | 'coordinates' | 'costCenter'; label: string; help?: string; list?: Parameters<typeof ReportBox>[0]['list']; placeholder?: string }) {
  const app = useApp()
  const value = app.state.job!.history.present.report!.job[field]
  return <ReportBox label={label} value={value} set={(q, v: string) => setReportValue(q, ['job', field], v)} boxKey={`report.job.${field}`} step={STEP} help={help} list={list} placeholder={placeholder} />
}

function Examiners() {
  const app = useApp()
  const job = app.state.job!.history.present.report!.job
  const reviewer = job.reviewer
  const clear = () => app.dispatch({ type: 'clearDrafts', prefix: 'report.job.techs.' })
  return (
    <section className="settings-group" id="report-examiners">
      <div className="group-head">
        <div>
          <h2>Examiners</h2>
          <p className="muted">"Examination & Report By" on the cover, in this order.</p>
        </div>
      </div>
      {job.techs.length === 0 ? (
        <p className="muted">No examiner yet. The report needs at least one.</p>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Saved list</th>
                <th><span className="visually-hidden">Order and delete</span></th>
              </tr>
            </thead>
            <tbody>
              {job.techs.map((t, i) => (
                <tr key={i}>
                  <td>
                    <ReportBox compact label="Name" where={`Examiner ${i + 1}, name`} value={t.name} list="examinerName" set={(q, v: string) => setReportValue(q, ['job', 'techs', i, 'name'], v)} boxKey={`report.job.techs.${i}.name`} step={STEP} />
                  </td>
                  <td>
                    <ReportBox compact label="Title" where={`Examiner ${i + 1}, title`} value={t.title} list="examinerTitle" set={(q, v: string) => setReportValue(q, ['job', 'techs', i, 'title'], v)} boxKey={`report.job.techs.${i}.title`} step={STEP} />
                  </td>
                  <td>
                    <RecordPicker list="examiners" current={t} label={`examiner ${i + 1}`}
                      onPick={(rec) => app.edit('Pick a saved examiner', (q) => setReportValue(q, ['job', 'techs', i], { name: rec.name, title: rec.title }))} />
                  </td>
                  <td className="row-actions">
                    <button type="button" className="icon-btn" disabled={i === 0} aria-label={`Move examiner ${i + 1} up`} title="Move up"
                      onClick={() => { app.edit('Move an examiner', (q) => moveListItem(q, ['job', 'techs'], i, -1)); clear() }}>↑</button>
                    <button type="button" className="icon-btn" disabled={i === job.techs.length - 1} aria-label={`Move examiner ${i + 1} down`} title="Move down"
                      onClick={() => { app.edit('Move an examiner', (q) => moveListItem(q, ['job', 'techs'], i, 1)); clear() }}>↓</button>
                    <button type="button" className="icon-btn icon-danger" aria-label={`Delete examiner ${i + 1}`} title="Delete (Ctrl+Z brings it back)"
                      onClick={() => { app.edit('Delete an examiner', (q) => removeListItem(q, ['job', 'techs'], i)); clear() }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="button-row">
        <button type="button" className="btn" onClick={() => app.edit('Add an examiner', (q) => addListItem(q, ['job', 'techs'], { name: '', title: '' }))}>
          Add examiner
        </button>
        <RecordPicker list="examiners" current={{}} label="a new examiner" pickOnly
          onPick={(rec) => app.edit('Add a saved examiner', (q) => addListItem(q, ['job', 'techs'], { name: rec.name, title: rec.title }))} />
      </div>
      <h3>Reviewer</h3>
      <div className="field-grid">
        <ReportCheckbox label="Report reviewed by" value={reviewer !== null} set={(q, on: boolean) => setReportValue(q, ['job', 'reviewer'], on ? { name: '', title: '' } : null)}
          boxKey="report.job.reviewer" step={STEP} help="A reviewer line on the cover (off by default)." />
        {reviewer && (
          <>
            <ReportBox label="Reviewer name" list="examinerName" value={reviewer.name} set={(q, v: string) => setReportValue(q, ['job', 'reviewer', 'name'], v)} boxKey="report.job.reviewer.name" step={STEP} />
            <ReportBox label="Reviewer title" list="examinerTitle" value={reviewer.title} set={(q, v: string) => setReportValue(q, ['job', 'reviewer', 'title'], v)} boxKey="report.job.reviewer.title" step={STEP} />
            <div className="field">
              <span className="field-label">Saved list</span>
              <RecordPicker list="examiners" current={reviewer} label="the reviewer" onPick={(rec) => app.edit('Pick a saved reviewer', (q) => setReportValue(q, ['job', 'reviewer'], { name: rec.name, title: rec.title }))} />
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/** Optional cover fields (the template's optional ones, the reviewer apart). */
function CoverFields() {
  const app = useApp()
  const p = app.state.job!.history.present
  const report = p.report!
  const fields = optionalCoverFields(templateOf(report.templateId)).filter((f) => f.source !== 'report.job.reviewer')
  if (fields.length === 0) return null
  return (
    <section className="settings-group">
      <div className="group-head">
        <div>
          <h2>Optional cover fields</h2>
          <p className="muted">Off unless turned on here.</p>
        </div>
      </div>
      <div className="field-grid">
        {fields.map((f) => {
          const on = report.job.coverExtras.includes(f.source)
          const own = f.source.startsWith('report.job.') ? (f.source.slice('report.job.'.length) as 'coordinates' | 'costCenter') : null
          return (
            <div key={f.source} className="cover-extra">
              <ReportCheckbox label={`${f.label} on the cover`} value={on} set={(q, v: boolean) => setCoverExtra(q, f.source, v)} boxKey={`report.cover.${f.source}`} step={STEP}
                help={own ? undefined : `${f.label} comes from the Project step${f.source === 'project.unit' ? ` (${p.project.unit || 'blank'})` : ''}.`} />
              {on && own && <JobBox field={own} label={f.label} />}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Components({ status }: ReportStepProps) {
  const app = useApp()
  const p = app.state.job!.history.present
  const report = p.report!
  const messagesOf = (c: Component): Message[] =>
    status.issues.filter((i) => i.check?.place.kind === 'component' && i.check.place.id === c.id).map((i) => ({ text: `${i.text} ${i.fix ?? ''}`.trim(), severity: i.blocksExport ? 'error' : 'warning' }))

  async function remove(c: Component) {
    const uses = componentUses(p, c.id)
    if (uses.scans + uses.readings > 0) {
      const answer = await app.ask({
        title: `Remove ${c.name}?`,
        message: (
          <p>
            {[uses.scans ? plural(uses.scans, 'scan') : '', uses.readings ? plural(uses.readings, 'reading') : ''].filter(Boolean).join(' and ')}{' '}
            {uses.scans + uses.readings === 1 ? 'was' : 'were'} put on {c.name}; they go back to automatic. You can undo this.
          </p>
        ),
        buttons: [
          { id: 'remove', label: 'Remove', primary: true },
          { id: 'cancel', label: 'Cancel' },
        ],
        cancelId: 'cancel',
      })
      if (answer !== 'remove') return
    }
    app.edit(`Remove ${c.name}`, (q) => removeComponent(q, c.id))
    app.dispatch({ type: 'clearDrafts', prefix: `report.components.${c.id}.` })
  }

  return (
    <section className="settings-group" id="report-components">
      <div className="group-head">
        <div>
          <h2>Components</h2>
          <p className="muted">
            Every scan and reading is measured against its component's nominal. Shell courses are found by their Y band; a boot or other part is
            picked on the scan or reading.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="grid report-components">
          <thead>
            <tr>
              <th>Name</th>
              <th>Kind</th>
              <th>Nominal (in)</th>
              <th>Material</th>
              <th title="Shell courses: the Y range along the shell, e.g. 0 to 96">Y band (in)</th>
              <th>Notes</th>
              <th><span className="visually-hidden">Delete</span></th>
            </tr>
          </thead>
          <tbody>
            {report.components.map((c) => {
              const key = `report.components.${c.id}`
              const messages = messagesOf(c)
              return (
                <Fragment key={c.id}>
                <tr id={reportPlaceId({ kind: 'component', id: c.id })} className={messages.length ? 'has-messages' : undefined}>
                  <td>
                    <ReportBox compact label="Name" where={`${c.name}, name`} value={c.name} required kind="text"
                      set={(q, v: string) => (v.trim() === '' ? q : updateComponent(q, c.id, { name: v.trim() }))} boxKey={`${key}.name`} step={STEP} />
                  </td>
                  <td>
                    <ReportSelect compact label="Kind" where={`${c.name}, kind`} value={c.kind} options={COMPONENT_KINDS.map((k) => ({ value: k, label: KIND_NAMES[k] }))}
                      set={(q, v: Component['kind']) => updateComponent(q, c.id, { kind: v })} boxKey={`${key}.kind`} step={STEP} />
                  </td>
                  <td>
                    <ReportBox compact label="Nominal" where={`${c.name}, nominal`} kind="thickness" value={c.nominal}
                      set={(q, v: number | null) => updateComponent(q, c.id, { nominal: v })} boxKey={`${key}.nominal`} step={STEP} />
                  </td>
                  <td>
                    <ReportBox compact label="Material" where={`${c.name}, material`} kind="optText" value={c.material} placeholder={p.project.material || 'the job’s'}
                      set={(q, v: string | null) => updateComponent(q, c.id, { material: v })} boxKey={`${key}.material`} step={STEP} help="Blank = the job's material." />
                  </td>
                  <td>
                    {c.kind === 'course' || c.yRange !== null ? (
                      <ReportBox compact label="Y band" where={`${c.name}, Y band`} kind="yBand" value={c.yRange} placeholder="0 to 96"
                        set={(q, v: [number, number] | null) => updateComponent(q, c.id, { yRange: v })} boxKey={`${key}.yRange`} step={STEP} help='Type "from to to" in inches along the shell.' />
                    ) : (
                      <span className="muted not-used" title="Only shell courses have a Y band">–</span>
                    )}
                  </td>
                  <td>
                    <ReportBox compact label="Notes" where={`${c.name}, notes`} value={c.notes} set={(q, v: string) => updateComponent(q, c.id, { notes: v })} boxKey={`${key}.notes`} step={STEP} />
                  </td>
                  <td className="row-actions">
                    <button type="button" className="icon-btn icon-danger" aria-label={`Remove ${c.name}`} title="Remove (Ctrl+Z brings it back)" onClick={() => void remove(c)}>
                      ×
                    </button>
                  </td>
                </tr>
                <RowMessages messages={messages} colSpan={7} />
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="button-row">
        {ADDABLE_KINDS.map((k) => (
          <button key={k} type="button" className="btn" onClick={() => app.edit(`Add ${KIND_NAMES[k].toLowerCase()}`, (q) => addComponent(q, k))}>
            Add {k === 'course' ? 'shell course' : KIND_NAMES[k].toLowerCase()}
          </button>
        ))}
      </div>
    </section>
  )
}

function Sections() {
  const app = useApp()
  const report = app.state.job!.history.present.report!
  const template = templateOf(report.templateId)
  return (
    <section className="settings-group">
      <div className="group-head">
        <div>
          <h2>Sections</h2>
          <p className="muted">In report order. Turn optional sections off, or rename the title printed in the page header.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="grid report-sections">
          <thead>
            <tr>
              <th>In the report</th>
              <th>Title</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {template.sections.map((s) => {
              const own = report.sections[s.id]
              const automatic = s.defaultOn === 'whenAny' && own?.on === undefined
              return (
                <tr key={s.id} id={`report-section-${s.id}`}>
                  <td>
                    <ReportCheckbox compact label={`${s.title} in the report`} value={sectionOn(report, s)} disabled={!s.optional}
                      set={(q, on: boolean) => setSectionOn(q, s.id, on)} boxKey={`report.sections.${s.id}.on`} step={STEP} />
                  </td>
                  <td>
                    <ReportBox compact label="Title" where={`${s.title}, title`} value={sectionTitle(report, s)} placeholder={s.title}
                      set={(q, v: string) => setSectionTitle(q, s.id, v)} boxKey={`report.sections.${s.id}.title`} step={STEP}
                      tag={own?.title !== undefined ? <Flag kind="changed" title={`Template title: ${s.title}`}>renamed</Flag> : undefined} />
                  </td>
                  <td className="muted">{!s.optional ? 'Always in.' : automatic ? 'In when it has something to print.' : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CoverPhoto() {
  const app = useApp()
  const report = app.state.job!.history.present.report!
  return <PhotoPick label="Cover photo" slot="coverPhoto" value={report.coverPhoto} set={(q, f) => setReportValue(q, ['coverPhoto'], f)} />
}
