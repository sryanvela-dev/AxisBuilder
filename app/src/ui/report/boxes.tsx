// The report screens' boxes, built on useEditBox like the drawing side's settings and table cells: a value is stored as
// soon as it is valid (one undo step per box, ending when you leave it), text that isn't valid yet is a draft that
// blocks the report and counts on its step. Same markup and CSS as SettingsForm (`field`) and table cells
// (`cell-field`). Thicknesses and lengths take fractions like the drawing (parseLength). A box with a saved list shows
// its suggestions, and a new value typed once joins the list (design 4.10).

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { formatNumber, parseLength, parseNumber, type Parsed } from '../../data/parse.ts'
import type { Project } from '../../data/schema.ts'
import { addString, suggestions, type StringListId } from '../../report/savedLists.ts'
import type { ReportStepId } from '../../state/session.ts'
import { useApp } from '../appContext.ts'
import { useEditBox } from '../useEditBox.ts'
import { useReport } from './reportContext.ts'

/**
 * text: any text; optText: blank = null; thickness: inches above 0; reading: inches, 0 allowed (a through-wall
 * reading); length: inches; number: any number; count: a whole number from 0; yBand: "from to to" in inches.
 */
export type BoxKind = 'text' | 'optText' | 'thickness' | 'reading' | 'length' | 'number' | 'count' | 'yBand'

export interface Message {
  text: string
  severity: 'error' | 'warning' | 'note'
}

interface Common {
  label: string
  /** Stores a value: the project with it (the box records it as one undo step). */
  set: (p: Project, value: never) => Project
  boxKey: string
  step: ReportStepId
  /** Where the box is, for the list of problems (default: the label). */
  where?: string
  help?: string
  /** In a table: the column says what it is (label read out and shown on hover). */
  compact?: boolean
  /** Checks on this value, shown under it. */
  messages?: Message[]
  /** Shown after the label, e.g. a "calculated" or "flagged" tag. */
  tag?: ReactNode
  disabled?: boolean
  className?: string
}

export interface BoxProps extends Common {
  value: string | number | null | readonly [number, number]
  kind?: BoxKind
  /** Blank is refused (a value is needed). */
  required?: boolean
  units?: string
  placeholder?: string
  /** A saved list: suggestions, and new values join it. */
  list?: StringListId
  multiline?: boolean
  wide?: boolean
}

const NUMBERS: readonly BoxKind[] = ['thickness', 'reading', 'length', 'number', 'count']

function formatValue(kind: BoxKind, v: BoxProps['value']): string {
  if (v === null || v === undefined) return ''
  if (kind === 'yBand' && Array.isArray(v)) return `${formatNumber(v[0])} to ${formatNumber(v[1])}`
  return typeof v === 'number' ? formatNumber(v) : String(v)
}

function parseValue(kind: BoxKind, text: string, required: boolean): Parsed<unknown> {
  if ((kind === 'text' || kind === 'optText') && required && text.trim() === '') return { ok: false, problem: "Enter a value; it can't be blank." }
  if (kind === 'text') return { ok: true, value: text }
  if (kind === 'optText') return { ok: true, value: text.trim() === '' ? null : text }
  if (kind === 'yBand') {
    if (text.trim() === '') return { ok: true, value: null }
    const m = /^(.+?)\s*(?:\bto\b|,|\s[-–]\s)\s*(.+)$/i.exec(text.trim())
    const a = m ? parseLength(m[1]) : null
    const b = m ? parseLength(m[2]) : null
    if (!a?.ok || !b?.ok || a.value === null || b.value === null) return { ok: false, problem: 'Type the band as "0 to 96" (inches along the shell).' }
    if (a.value === b.value) return { ok: false, problem: 'The band needs two different Y values.' }
    return { ok: true, value: [Math.min(a.value, b.value), Math.max(a.value, b.value)] }
  }
  const r = kind === 'number' || kind === 'count' ? parseNumber(text) : parseLength(text)
  if (!r.ok) return r
  if (r.value === null) return required ? { ok: false, problem: "Enter a value; it can't be blank." } : r
  if (kind === 'thickness' && !(r.value > 0)) return { ok: false, problem: 'A thickness is more than 0.' }
  if ((kind === 'reading' || kind === 'length') && r.value < 0) return { ok: false, problem: 'It can’t be below 0.' }
  if (kind === 'count' && !(Number.isInteger(r.value) && r.value >= 0)) return { ok: false, problem: 'A whole number from 0.' }
  return r
}

/** A typed value (text or a number). */
export function ReportBox(props: BoxProps) {
  const app = useApp()
  const shared = useReport()
  const id = useId()
  const kind = props.kind ?? 'text'
  const box = useEditBox<unknown>({
    value: props.value,
    format: (v) => formatValue(kind, v as BoxProps['value']),
    parse: (t) => parseValue(kind, t, props.required === true),
    commit: (v) => {
      app.edit(`Change ${props.where ?? props.label}`, (p) => props.set(p, v as never), props.boxKey)
      return null
    },
    boxKey: props.boxKey,
    step: props.step,
    where: props.where ?? props.label,
  })
  const onBlur = () => {
    box.onBlur()
    const list = props.list
    if (list && box.text.trim() !== '' && !box.problem) shared.changeLists((l) => addString(l, list, box.text))
  }
  const common = {
    id,
    value: box.text,
    disabled: props.disabled,
    placeholder: props.placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => box.onChange(e.target.value),
    onBlur,
    'aria-describedby': `${id}-help`,
    'aria-invalid': box.problem ? true : undefined,
  }
  const input = props.multiline ? (
    <textarea {...common} rows={2} />
  ) : props.list ? (
    <ComboInput common={common} options={suggestions(shared.savedLists, props.list)} label={props.where ?? props.label}
      onPick={(v) => {
        box.onChange(v)
        app.dispatch({ type: 'endEditGroup' })
        const list = props.list!
        shared.changeLists((l) => addString(l, list, v))
      }} />
  ) : (
    <input {...common} type="text" inputMode={NUMBERS.includes(kind) ? 'decimal' : undefined} autoComplete="off" spellCheck={kind === 'text' || kind === 'optText'} />
  )
  return <Frame {...props} id={id} problem={box.problem} note={box.note} input={input} />
}

/**
 * A text box that is also a dropdown (a saved list): the arrow, a click in the empty box or Arrow down shows the whole
 * list to pick from; typing filters it, and a value not in the list can still be typed (it joins the list when the box
 * is left). The list is placed over the page (fixed), so a table's scroll area never cuts it off.
 */
function ComboInput(props: {
  common: React.InputHTMLAttributes<HTMLInputElement> & { value: string }
  options: readonly string[]
  label: string
  onPick: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState(false)
  const [active, setActive] = useState(-1)
  const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null)
  const wrap = useRef<HTMLSpanElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const text = props.common.value
  const shown = filter && text.trim() !== '' ? props.options.filter((o) => o.toLowerCase().includes(text.trim().toLowerCase())) : props.options
  const measure = () => {
    const r = wrap.current?.getBoundingClientRect()
    if (r) setPlace({ top: r.bottom + 2, left: r.left, width: r.width })
  }
  const show = (byTyping: boolean) => {
    measure()
    setFilter(byTyping)
    setActive(-1)
    setOpen(true)
  }
  // The list stays under its box while the page or a table scrolls (it used to close, often before a pick could be
  // made: focusing a box in a scrolled table scrolls it); scrolling the list itself changes nothing.
  useEffect(() => {
    if (!open) return
    const follow = (e: Event) => {
      if (list.current && e.target instanceof Node && list.current.contains(e.target)) return
      const r = wrap.current?.getBoundingClientRect()
      if (r) setPlace({ top: r.bottom + 2, left: r.left, width: r.width })
    }
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
  }, [open])
  const pick = (v: string) => {
    props.onPick(v)
    setOpen(false)
  }
  return (
    <span className="combo" ref={wrap}>
      <input
        {...props.common}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          props.common.onChange?.(e)
          show(true)
        }}
        onClick={() => {
          if (text === '' && !open) show(false)
        }}
        onBlur={(e) => {
          setOpen(false)
          props.common.onBlur?.(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (!open) show(false)
            else setActive((a) => Math.min(shown.length - 1, a + 1))
          } else if (e.key === 'ArrowUp' && open) {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter' && open && active >= 0 && shown[active]) {
            e.preventDefault()
            pick(shown[active])
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      />
      <button type="button" className="combo-arrow" tabIndex={-1} disabled={props.common.disabled} aria-label={`Show the list for ${props.label}`} title="Show the list"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) setOpen(false)
          else {
            show(false)
            wrap.current?.querySelector('input')?.focus({ preventScroll: true })
          }
        }}>
        ▾
      </button>
      {open && place && shown.length > 0 && (
        <ul ref={list} className="combo-list" role="listbox" onMouseDown={(e) => e.preventDefault()} style={{ top: place.top, left: place.left, minWidth: place.width }}>
          {shown.map((o, i) => (
            <li key={o} role="option" aria-selected={o === text} className={i === active ? 'combo-active' : undefined}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(o)
              }}>
              {o}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

export interface SelectProps extends Common {
  value: string
  options: readonly { value: string; label: string }[]
}

/** A choice from a list; each change is one undo step. */
export function ReportSelect(props: SelectProps) {
  const app = useApp()
  const id = useId()
  const input = (
    <select id={id} value={props.value} disabled={props.disabled} aria-describedby={`${id}-help`}
      onChange={(e) => app.edit(`Change ${props.where ?? props.label}`, (p) => props.set(p, e.target.value as never))}>
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
  return <Frame {...props} id={id} problem={null} note={null} input={input} />
}

export interface CheckProps extends Common {
  value: boolean
}

/** A yes / no box; each change is one undo step. */
export function ReportCheckbox(props: CheckProps) {
  const app = useApp()
  const id = useId()
  const input = (
    <input id={id} type="checkbox" checked={props.value} disabled={props.disabled} aria-describedby={`${id}-help`}
      onChange={(e) => app.edit(`Change ${props.where ?? props.label}`, (p) => props.set(p, e.target.checked as never))} />
  )
  return <Frame {...props} id={id} problem={null} note={null} input={input} />
}

function Frame(props: Common & { id: string; input: ReactNode; problem: string | null; note: string | null; units?: string; wide?: boolean }) {
  const { id, problem, note, messages = [] } = props
  const bad = problem !== null || messages.some((m) => m.severity === 'error')
  const msgs = (
    <div id={`${id}-help`} className="field-messages">
      {problem && <p className="msg msg-error">Not stored: {problem}</p>}
      {!problem && messages.map((m) => <p key={m.text} className={`msg msg-${m.severity}`}>{m.text}</p>)}
      {note && !problem && <p className="msg msg-note">{note}</p>}
      {!props.compact && props.help && <p className="field-help muted">{props.help}</p>}
    </div>
  )
  if (props.compact) {
    return (
      <div className={`cell-field${bad ? ' field-bad' : ''}${props.className ? ` ${props.className}` : ''}`} title={props.help ? `${props.label}. ${props.help}` : props.label}>
        <label htmlFor={id} className="visually-hidden">
          {props.where ?? props.label}
        </label>
        <span className="cell-input">
          {props.input}
          {props.units ? <span className="muted">{props.units}</span> : null}
          {props.tag}
        </span>
        {msgs}
      </div>
    )
  }
  return (
    <div className={`field${props.wide ? ' field-wide' : ''}${bad ? ' field-bad' : ''}${props.className ? ` ${props.className}` : ''}`}>
      <label htmlFor={id} className="field-label">
        {props.label}
        {props.units ? <span className="muted"> ({props.units})</span> : null}
        {props.tag}
      </label>
      {props.input}
      {msgs}
    </div>
  )
}

/** Checks on a table row, in a row of their own below it (as the drawing's tables show them). */
export function RowMessages({ messages, colSpan }: { messages: Message[]; colSpan: number }) {
  if (messages.length === 0) return null
  return (
    <tr className="row-messages">
      <td colSpan={colSpan}>
        {messages.map((m) => (
          <p key={m.text} className={`msg msg-${m.severity}`}>
            {m.text}
          </p>
        ))}
      </td>
    </tr>
  )
}

/** A small tag after a label or value: "calculated", "flagged", "from the drawing". */
export function Flag({ children, kind = 'review', title }: { children: ReactNode; kind?: 'review' | 'changed' | 'other'; title?: string }) {
  return (
    <span className={`kind kind-${kind} flag`} title={title}>
      {children}
    </span>
  )
}
