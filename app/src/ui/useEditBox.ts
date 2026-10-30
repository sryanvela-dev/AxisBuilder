// One typed value (a setting or a table cell): reads the text as you type, stores it in the project
// as soon as it is valid (one undo step per box: the step ends when you leave it), and keeps text
// that is not valid yet as a draft, so the step bar can count it and nothing wrong is stored.

import { useEffect, useRef, useState } from 'react'
import type { Parsed } from '../data/parse.ts'
import type { AnyStepId } from '../state/session.ts'
import { useApp } from './appContext.ts'

export interface EditBoxOptions<T> {
  /** The stored value. */
  value: T
  format: (value: T) => string
  parse: (text: string) => Parsed<T>
  /** Stores the value; returns a problem (e.g. out of range) instead when it can't be stored. */
  commit: (value: T) => string | null
  /** Key of the box (drafts and the undo group). */
  boxKey: string
  /** The step whose page holds the box (a drawing or a report step). */
  step: AnyStepId
  /** Where the box is, for the step's list of problems. */
  where: string
}

export interface EditBox {
  text: string
  /** How the text was read, e.g. "12 1/2 = 12.5 in". */
  note: string | null
  /** Why the text is not stored. */
  problem: string | null
  onChange: (text: string) => void
  onBlur: () => void
}

export function useEditBox<T>(o: EditBoxOptions<T>): EditBox {
  const app = useApp()
  const draft = app.state.job?.drafts[o.boxKey] ?? null
  const [typing, setTyping] = useState<string | null>(null)
  const stored = useRef(o.value)

  useEffect(() => {
    // Changed from outside (undo, redo, paste, reset): show the stored value again.
    if (!Object.is(stored.current, o.value)) setTyping(null)
    stored.current = o.value
  }, [o.value])

  const text = typing ?? draft?.text ?? o.format(o.value)
  const parsed = typing !== null || draft ? o.parse(text) : null
  const note = parsed?.ok ? (parsed.note ?? null) : null

  return {
    text,
    note,
    problem: draft?.problem ?? null,
    onChange: (t) => {
      setTyping(t)
      const r = o.parse(t)
      const problem = r.ok ? (Object.is(r.value, o.value) ? null : o.commit(r.value)) : r.problem
      if (r.ok && problem === null) stored.current = r.value
      app.dispatch({ type: 'setDraft', key: o.boxKey, draft: problem ? { text: t, problem, step: o.step, where: o.where } : null })
    },
    onBlur: () => {
      setTyping(null)
      app.dispatch({ type: 'endEditGroup' })
    },
  }
}
