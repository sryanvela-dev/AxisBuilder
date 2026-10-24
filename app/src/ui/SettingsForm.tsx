// Settings forms built from settings.ts: one box per setting (plain name, units, description,
// range or choices), in groups with "Show advanced" and "Reset to default". A setting that doesn't
// apply right now (showWhen) is hidden but keeps its value. Text sizes and colors are a table, one row
// per kind of text; CAD colors use the color picker.

import { useEffect, useId, useState } from 'react'
import { parseLength, parseNumber, type Parsed } from '../data/parse.ts'
import type { Project } from '../data/schema.ts'
import {
  SETTINGS,
  SETTING_GROUPS,
  TEXT_TYPES,
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
import { ColorPicker } from './ColorPicker.tsx'
import { REVEAL_EVENT, type RevealDetail } from './FindSetting.tsx'

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

  // "Find a setting" picked an advanced one of this group: show the advanced settings.
  useEffect(() => {
    const reveal = (e: Event) => {
      const { section, key } = (e as CustomEvent<RevealDetail>).detail
      if (all.some((f) => f.section === section && f.key === key && f.def.level === 'Advanced')) setAdvanced(true)
    }
    window.addEventListener(REVEAL_EVENT, reveal)
    return () => window.removeEventListener(REVEAL_EVENT, reveal)
  }, [all])

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
      {group === 'headsDrawing' && (
        <p className="see-also">
          <button type="button" className="link-btn" onClick={() => app.goToStep('fieldData')}>
            Head views on or off and the head names: Field data step, Heads
          </button>
        </p>
      )}
      {group === 'textStyles' ? (
        <TextStylesTable fields={all} values={values} step={step} />
      ) : (
        <div className="field-grid">
          {shown.map((f) => (
            <SettingField key={`${f.section}.${f.key}`} field={f} step={step} />
          ))}
        </div>
      )}
      {group !== 'textStyles' && all.length > applicable.length && (
        <p className="muted hidden-note">
          {all.length - applicable.length === 1 ? '1 setting is' : `${all.length - applicable.length} settings are`} hidden because{' '}
          {all.length - applicable.length === 1 ? 'it does' : 'they do'} not apply with the current choices (values are kept).
        </p>
      )}
    </section>
  )
}

type FieldProps = { field: GroupField; step: StepId; compact?: boolean }

function SettingField(props: FieldProps) {
  const { def } = props.field
  if (def.type === 'number' && def.color) return <ColorSetting {...props} />
  return def.type === 'number' || def.type === 'text' ? <TypedSetting {...props} /> : <PickedSetting {...props} />
}

/** Text sizes and colors: one row per text type (each its own CAD layer). */
function TextStylesTable({ fields, values, step }: { fields: GroupField[]; values: SectionValues; step: StepId }) {
  const app = useApp()
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const defs = SETTINGS as Record<string, FieldDef>
  // One row back to Automatic and its default color (one undo step); drafts typed in the row go too.
  const resetRow = (key: string, name: string) => {
    const row = ['Size', 'Scale', 'Height', 'Color'].map((k) => byKey.get(`${key}${k}`)!)
    app.edit(`Reset ${name}`, (p) => row.reduce((acc, f) => setValue(acc, f.section, f.key, f.def.default), p))
    for (const f of row) app.dispatch({ type: 'setDraft', key: draftKey(f.section, f.key), draft: null })
  }
  return (
    <div>
      <table className="text-styles">
        <thead>
          <tr>
            <th scope="col">Text</th>
            <th scope="col">Size</th>
            <th scope="col">Scale or height</th>
            <th scope="col">Color</th>
            <th scope="col"><span className="visually-hidden">Reset</span></th>
          </tr>
        </thead>
        <tbody>
          {TEXT_TYPES.map((t) => {
            const size = byKey.get(`${t.key}Size`)!
            const mode = values.settings[`${t.key}Size` as keyof SectionValues['settings']]
            const amount = mode === 'Scale' ? byKey.get(`${t.key}Scale`) : mode === 'Fixed height' ? byKey.get(`${t.key}Height`) : undefined
            const name = defs[`${t.key}Size`].name.replace(/: size$/, '')
            const changed = ['Size', 'Scale', 'Height', 'Color'].some((k) => {
              const f = byKey.get(`${t.key}${k}`)!
              return !Object.is(values[f.section][f.key], f.def.default)
            })
            return (
              <tr key={t.key}>
                <th scope="row">
                  {name}
                  <span className="muted layer-name">{t.layer}</span>
                </th>
                <td>
                  <SettingField field={size} step={step} compact />
                </td>
                <td>
                  {amount ? (
                    <SettingField key={amount.key} field={amount} step={step} compact />
                  ) : (
                    <span className="muted">{t.base === null ? 'Sized to fit' : `${t.base} in`}</span>
                  )}
                </td>
                <td>
                  <SettingField field={byKey.get(`${t.key}Color`)!} step={step} compact />
                </td>
                <td>
                  <button type="button" className="btn btn-small" disabled={!changed} onClick={() => resetRow(t.key, name)}
                    title={changed ? `Put ${name.toLowerCase()} back to Automatic and the default color` : 'Already at the default'} aria-label={`Reset ${name}`}>
                    Reset
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="muted hidden-note">
        Scale multiplies the automatic size. Fixed height sets the main text of that kind to the height (other text on the same layer, such as
        a title, keeps its proportion). A bigger legend or title block makes room for itself; TEXTRESIZE in CAD still works on every layer.
      </p>
    </div>
  )
}

function useSetting(field: GroupField) {
  const app = useApp()
  const { section, key, def } = field
  const value = (app.state.job!.history.present[section] as Record<string, unknown>)[key]
  const store = (v: unknown, group?: string) => app.edit(`Change ${def.name}`, (p) => setValue(p, section, key, v), group)
  return { value, store }
}

/** A setting you type: text or a number (lengths accept fractions and feet and inches). */
function TypedSetting({ field, step, compact }: FieldProps) {
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
  return <FieldFrame id={id} field={field} step={step} input={input} problem={box.problem} note={box.note} compact={compact} />
}

/** A CAD color number, picked from swatches. */
function ColorSetting({ field, step, compact }: FieldProps) {
  const id = useId()
  const { value, store } = useSetting(field)
  const input = <ColorPicker id={id} value={value as number} onChange={(n) => store(n)} label={field.def.name} describedBy={`${id}-help`} compact={compact} />
  return <FieldFrame id={id} field={field} step={step} input={input} problem={null} note={null} compact={compact} />
}

/** A setting you pick: a list, a yes/no box or a date. Each change is one undo step. */
function PickedSetting({ field, step, compact }: FieldProps) {
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
  return <FieldFrame id={id} field={field} step={step} input={input} problem={null} note={null} compact={compact} />
}

function FieldFrame(props: { id: string; field: GroupField; step: StepId; input: React.JSX.Element; problem: string | null; note: string | null; compact?: boolean }) {
  const { checks, workbookImport } = useJobChecks()
  const { id, field, step, problem, note } = props
  const { section, key, def } = field
  const fieldChecks = settingChecks(checks, section, key)
  const notes = reportNotesFor(workbookImport, step, { kind: 'setting', section, key })
  const bad = problem !== null || fieldChecks.some((c) => c.severity === 'error')
  if (props.compact) {
    // In a table: the column says what it is; the name is read out and shown on hover.
    return (
      <div className={`cell-field${bad ? ' field-bad' : ''}`} id={settingElementId(section, key)} title={`${def.name}. ${def.description}${rangeHint(def)}`}>
        <label htmlFor={id} className="visually-hidden">
          {def.name}
        </label>
        <span className="cell-input">
          {props.input}
          {def.type === 'number' && def.units && !def.color ? <span className="muted">{def.units}</span> : null}
        </span>
        <div id={`${id}-help`} className="field-messages">
          {problem && <p className="msg msg-error">Not stored: {problem}</p>}
          {!problem && fieldChecks.map((c) => <p key={c.text} className={`msg msg-${c.severity}`}>{c.text}</p>)}
        </div>
      </div>
    )
  }
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
