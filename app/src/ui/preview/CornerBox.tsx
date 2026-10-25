// A corner value in the MUT areas tool's corner table (Phase 5c).

import { useState } from 'react'
import { parseLength } from '../../data/parse.ts'

/** One corner value in the corner table: stored on Enter or when the box is left; text that isn't a length stays red. */
export function CornerBox({ value, label, store }: { value: number; label: string; store: (v: number) => void }) {
  const shown = String(Math.round(value * 1000) / 1000)
  const [text, setText] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const commit = () => {
    if (text === null) return
    const r = parseLength(text)
    if (!r.ok || r.value === null) {
      setBad(true)
      return
    }
    setText(null)
    setBad(false)
    if (Math.abs(r.value - value) > 1e-9) store(r.value)
  }
  return (
    <input type="text" inputMode="decimal" className={bad ? 'cell-bad' : undefined} aria-label={label} aria-invalid={bad || undefined}
      value={text ?? shown} onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          setText(null)
          setBad(false)
        }
      }} />
  )
}
