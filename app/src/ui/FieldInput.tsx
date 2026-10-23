// One project or vessel value, edited in place. Every change goes through the store (undo/redo);
// typing in one box is one undo step. Numbers are only stored once they are valid.

import { useEffect, useId, useRef, useState } from 'react'
import { PROJECT_FIELDS, VESSEL_FIELDS, type FieldDef, type NumberDef } from '../data/settings.ts'
import type { Project } from '../data/schema.ts'
import { useApp } from './appContext.ts'

type Section = 'project' | 'vessel'
const TABLES: Record<Section, Record<string, FieldDef>> = { project: PROJECT_FIELDS, vessel: VESSEL_FIELDS }

function numberProblem(def: NumberDef, text: string): string | null {
  if (text.trim() === '') return def.nullable ? null : 'Enter a number.'
  const n = Number(text)
  if (!Number.isFinite(n)) return 'Enter a number, like 120 or 120.5.'
  if (def.integer && !Number.isInteger(n)) return 'Enter a whole number.'
  if (def.min !== undefined && n < def.min) return `Must be at least ${def.min}.`
  if (def.greaterThan !== undefined && n <= def.greaterThan) return `Must be more than ${def.greaterThan}.`
  if (def.max !== undefined && n > def.max) return `Must be at most ${def.max}.`
  return null
}

export function FieldInput({ section, field }: { section: Section; field: string }) {
  const app = useApp()
  const id = useId()
  const def = TABLES[section][field]
  if (!def) throw new Error(`Unknown field ${section}.${field}`)
  const value = (app.state.job!.history.present[section] as Record<string, unknown>)[field]

  const commit = (v: unknown) =>
    app.edit(
      `Change ${def.name}`,
      (p: Project) => ({ ...p, [section]: { ...(p[section] as Record<string, unknown>), [field]: v } }) as Project,
      `${section}.${field}`,
    )

  const label = (
    <label htmlFor={id} className="field-label">
      {def.name}
      {def.units ? <span className="muted"> ({def.units})</span> : null}
    </label>
  )
  const help = <p className="field-help muted">{def.description}</p>

  if (def.type === 'number') return <NumberField id={id} def={def} value={value as number | null} commit={commit} label={label} help={help} />

  let input: React.JSX.Element
  if (def.type === 'choice') {
    input = (
      <select id={id} value={String(value)} onChange={(e) => commit(e.target.value)}>
        {def.allowBlank && <option value="">(none)</option>}
        {def.choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    )
  } else if (def.type === 'yesNo') {
    input = <input id={id} type="checkbox" checked={value === true} onChange={(e) => commit(e.target.checked)} />
  } else if (def.type === 'date') {
    input = <input id={id} type="date" value={String(value)} onChange={(e) => commit(e.target.value)} />
  } else {
    input = <input id={id} type="text" value={String(value)} onChange={(e) => commit(e.target.value)} autoComplete="off" />
  }
  return (
    <div className="field">
      {label}
      {input}
      {help}
    </div>
  )
}

function NumberField(props: {
  id: string
  def: NumberDef
  value: number | null
  commit: (v: number | null) => void
  label: React.JSX.Element
  help: React.JSX.Element
}) {
  const { id, def, value, commit } = props
  // While typing, the box shows the text as typed ("12." stays "12."); a valid number is stored at once.
  const [draft, setDraft] = useState<string | null>(null)
  const committed = useRef(value)
  useEffect(() => {
    // Changed from outside (undo, redo, import): show the stored value again.
    if (!Object.is(committed.current, value)) setDraft(null)
    committed.current = value
  }, [value])
  const text = draft ?? (value === null ? '' : String(value))
  const problem = draft === null ? null : numberProblem(def, draft)
  return (
    <div className="field">
      {props.label}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-problem` : undefined}
        onChange={(e) => {
          const t = e.target.value
          setDraft(t)
          if (numberProblem(def, t) === null) {
            const v = t.trim() === '' ? null : Number(t)
            if (!Object.is(v, value)) {
              committed.current = v
              commit(v)
            }
          }
        }}
        onBlur={() => {
          if (draft !== null && numberProblem(def, draft) === null) setDraft(null)
        }}
      />
      {problem ? (
        <p id={`${id}-problem`} className="field-problem">
          {problem} Not stored until it is fixed.
        </p>
      ) : (
        props.help
      )}
    </div>
  )
}
