// Settings forms built from settings.ts: one box per setting (plain name, units, description,
// range or choices), in groups with "Show advanced" and "Reset to default". A setting that doesn't
// apply right now (showWhen) is hidden but keeps its value.

import { useId, useState } from 'react'
import { parseLength, parseNumber, type Parsed } from '../data/parse.ts'
import type { Project } from '../data/schema.ts'
import {
  SETTING_GROUPS,
  groupFields,
  isFieldShown,
  type FieldDef,
  type FieldSection,
  type GroupField,
  type SectionValues,
  type SettingGroupId,
} from '../data/settings.ts'
import { schemaProblem } from '../data/columns.ts'
import { draftKey, type StepId } from '../state/session.ts'
import { useApp } from './appContext.ts'
import { REPORT_KIND_TEXT, reportNotesFor, settingChecks, useJobChecks } from './checksContext.ts'
import { settingElementId } from './placeIds.ts'
import { useEditBox } from './useEditBox.ts'

const sectionValues = (p: Project): SectionValues => ({ project: p.project, vessel: p.vessel, settings: p.settings })

function setValue(p: Project, section: FieldSection, key: string, value: unknown): Project {
  return { ...p, [section]: { ...(p[section] as Record<string, unknown>), [key]: value } } as Project
}

export function SettingsGroup({ group, step }: { group: SettingGroupId; step: StepId }) {
  const app = useApp()
  const info = SETTING_GROUPS.find((g) => g.id === group)!
  const [advanced, setAdvanced] = useState(false)
  const values = sectionValues(app.state.job!.history.present)
  const all = groupFields(group)
  const applicable = all.filter((f) => isFieldShown(f.def, values))
  const basic = applicable.filter((f) => f.def.level === 'Basic')
  const adv = applicable.filter((f) => f.def.level === 'Advanced')
  const shown = advanced ? [...basic, ...adv] : basic

  async function reset() {
    const changed = shown.filter((f) => !Object.is(values[f.section][f.key], f.def.default))
    if (changed.length === 0) return
    const answer = await app.ask({
      title: `Reset ${info.title}?`,
      message: (
        <p>
          {changed.length === 1 ? '1 setting goes' : `${changed.length} settings go`} back to {changed.length === 1 ? 'its' : 'their'} default:{' '}
          {changed.map((f) => f.def.name).join(', ')}. You can undo this.
        </p>
      ),
      buttons: [
        { id: 'reset', label: 'Reset', primary: true },
        { id: 'cancel', label: 'Cancel' },
      ],
      cancelId: 'cancel',
    })
    if (answer !== 'reset') return
    app.edit(`Reset ${info.title}`, (p) => changed.reduce((acc, f) => setValue(acc, f.section, f.key, f.def.default), p))
    for (const f of changed) app.dispatch({ type: 'setDraft', key: draftKey(f.section, f.key), draft: null })
  }

  return (
    <section className="settings-group" aria-labelledby={`group-${group}`}>
      <div className="group-head">
        <div>
          <h2 id={`group-${group}`}>{info.title}</h2>
          <p className="muted">{info.intro}</p>
        </div>
        <div className="button-row">
          {adv.length > 0 && (
            <label className="switch">
              <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
              Show advanced ({adv.length})
            </label>
          )}
          <button type="button" className="btn btn-small" onClick={() => void reset()} title="Put the settings shown here back to their defaults">
            Reset to default
          </button>
        </div>
      </div>
      <div className="field-grid">
        {shown.map((f) => (
          <SettingField key={`${f.section}.${f.key}`} field={f} step={step} />
        ))}
      </div>
      {all.length > applicable.length && (
        <p className="muted hidden-note">
          {all.length - applicable.length === 1 ? '1 setting is' : `${all.length - applicable.length} settings are`} hidden because{' '}
          {all.length - applicable.length === 1 ? 'it does' : 'they do'} not apply with the current choices (values are kept).
        </p>
      )}
    </section>
  )
}

function SettingField({ field, step }: { field: GroupField; step: StepId }) {
  return field.def.type === 'number' || field.def.type === 'text' ? <TypedSetting field={field} step={step} /> : <PickedSetting field={field} step={step} />
}

function useSetting(field: GroupField) {
  const app = useApp()
  const { section, key, def } = field
  const value = (app.state.job!.history.present[section] as Record<string, unknown>)[key]
  const store = (v: unknown, group?: string) => app.edit(`Change ${def.name}`, (p) => setValue(p, section, key, v), group)
  return { value, store }
}

/** A setting you type: text or a number (lengths accept fractions and feet and inches). */
function TypedSetting({ field, step }: { field: GroupField; step: StepId }) {
  const id = useId()
  const { section, key, def } = field
  const { value, store } = useSetting(field)
  const box = useEditBox<unknown>({
    value,
    format: (v) => (v === null || v === undefined ? '' : String(v)),
    parse: (t): Parsed<unknown> => {
      if (def.type !== 'number') return { ok: true, value: t }
      const r = def.units === 'in' ? parseLength(t) : parseNumber(t)
      if (r.ok && r.value === null && !def.nullable) return { ok: false, problem: "Enter a value; it can't be blank." }
      return r
    },
    commit: (v) => {
      const res = def.schema.safeParse(v)
      if (!res.success) return schemaProblem(res.error.issues[0])
      store(v, draftKey(section, key))
      return null
    },
    boxKey: draftKey(section, key),
    step,
    where: def.name,
  })
  const common = {
    id,
    value: box.text,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => box.onChange(e.target.value),
    onBlur: box.onBlur,
    'aria-describedby': `${id}-help`,
  }
  const input =
    def.type === 'text' && def.multiline ? (
      <textarea {...common} rows={2} />
    ) : (
      <input {...common} type="text" inputMode={def.type === 'number' ? 'decimal' : undefined} autoComplete="off" />
    )
  return <FieldFrame id={id} field={field} step={step} input={input} problem={box.problem} note={box.note} />
}

/** A setting you pick: a list, a yes/no box or a date. Each change is one undo step. */
function PickedSetting({ field, step }: { field: GroupField; step: StepId }) {
  const id = useId()
  const { def } = field
  const { value, store } = useSetting(field)
  let input: React.JSX.Element
  if (def.type === 'choice') {
    input = (
      <select id={id} value={String(value)} onChange={(e) => store(e.target.value)} aria-describedby={`${id}-help`}>
        {def.allowBlank && <option value="">(none)</option>}
        {def.choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    )
  } else if (def.type === 'yesNo') {
    input = <input id={id} type="checkbox" checked={value === true} onChange={(e) => store(e.target.checked)} aria-describedby={`${id}-help`} />
  } else {
    input = <input id={id} type="date" value={String(value)} onChange={(e) => store(e.target.value)} aria-describedby={`${id}-help`} />
  }
  return <FieldFrame id={id} field={field} step={step} input={input} problem={null} note={null} />
}

function FieldFrame(props: { id: string; field: GroupField; step: StepId; input: React.JSX.Element; problem: string | null; note: string | null }) {
  const { checks, workbookImport } = useJobChecks()
  const { id, field, step, problem, note } = props
  const { section, key, def } = field
  const fieldChecks = settingChecks(checks, section, key)
  const notes = reportNotesFor(workbookImport, step, { kind: 'setting', section, key })
  const bad = problem !== null || fieldChecks.some((c) => c.severity === 'error')
  return (
    <div className={`field${def.type === 'text' && def.multiline ? ' field-wide' : ''}${bad ? ' field-bad' : ''}`} id={settingElementId(section, key)}>
      <label htmlFor={id} className="field-label">
        {def.name}
        {def.units ? <span className="muted"> ({def.units})</span> : null}
        {def.level === 'Advanced' && <span className="tag">Advanced</span>}
      </label>
      {props.input}
      <div id={`${id}-help`} className="field-messages">
        {problem && <p className="msg msg-error">Not stored: {problem}</p>}
        {!problem &&
          fieldChecks.map((c) => (
            <p key={c.text} className={`msg msg-${c.severity}`}>
              {c.text} {c.fix}
            </p>
          ))}
        {note && !problem && <p className="msg msg-note">{note}</p>}
        <p className="field-help muted">
          {def.description}
          {rangeHint(def)}
        </p>
        {notes.map((e) => (
          <p key={`${e.sheet}${e.cell}${e.message}`} className="msg msg-report">
            From Excel ({e.sheet} {e.cell}): {REPORT_KIND_TEXT[e.kind]}. {e.message}
          </p>
        ))}
      </div>
    </div>
  )
}

/** How lengths can be typed (shown under every length box). */
const LENGTH_TYPING = `Type it as 12.5, 12 1/2, 12-1/2 or 10' 6".`

/** " Allowed: 0 to 90." from the setting's own range (and how to type a length). */
function rangeHint(def: FieldDef): string {
  if (def.type !== 'number') return ''
  const parts: string[] = []
  if (def.min !== undefined && def.max !== undefined) parts.push(`${def.min} to ${def.max}`)
  else if (def.min !== undefined) parts.push(`${def.min} or more`)
  else if (def.max !== undefined) parts.push(`up to ${def.max}`)
  if (def.greaterThan !== undefined) parts.push(`more than ${def.greaterThan}`)
  if (def.integer) parts.push('whole numbers')
  const allowed = parts.length ? ` Allowed: ${parts.join(', ')}.` : ''
  return def.units === 'in' ? `${allowed} ${LENGTH_TYPING}` : allowed
}
