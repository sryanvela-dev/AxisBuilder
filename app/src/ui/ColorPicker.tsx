// A CAD color picker: the standard CAD color numbers (1-255) as swatches. The named colors and grays
// come first, the full table opens below them. The swatch colors are the CAD ones (engine/aci.ts);
// 7 shows as black or white, as CAD draws it on its background.

import { useEffect, useId, useRef, useState } from 'react'
import { aciHex, colorName } from '../engine/aci.ts'

const NAMED = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const GRAYS = [250, 251, 252, 253, 254, 255]
/** 10-249 as 24 hue columns of ten shades (as CAD's own color dialog lays them out). */
const HUES = Array.from({ length: 24 }, (_, h) => Array.from({ length: 10 }, (_, k) => 10 + h * 10 + k))

function Swatch({ n, current, onPick }: { n: number; current: number; onPick: (n: number) => void }) {
  return (
    <button
      type="button"
      className={`swatch${n === current ? ' swatch-current' : ''}${n === 7 ? ' swatch-7' : ''}`}
      style={n === 7 ? undefined : { background: aciHex(n) }}
      title={colorName(n)}
      aria-label={colorName(n)}
      aria-pressed={n === current}
      onClick={() => onPick(n)}
    />
  )
}

export function ColorPicker(props: { id?: string; value: number; onChange: (n: number) => void; label: string; describedBy?: string; compact?: boolean }) {
  const { value, onChange } = props
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const [above, setAbove] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const popId = useId()

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const pick = (n: number) => {
    onChange(n)
    setOpen(false)
  }
  const known = Number.isInteger(value) && value >= 1 && value <= 255
  return (
    <span className="color-picker" ref={root}>
      <button
        id={props.id}
        type="button"
        className="btn color-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={`${props.label}: ${colorName(value)}`}
        title={colorName(value)}
        aria-describedby={props.describedBy}
        onClick={(e) => {
          // Opens upwards near the bottom of the window.
          setAbove(window.innerHeight - e.currentTarget.getBoundingClientRect().bottom < 340)
          setOpen(!open)
        }}
      >
        <span className={`swatch swatch-small${value === 7 ? ' swatch-7' : ''}`} style={value === 7 || !known ? undefined : { background: aciHex(value) }} aria-hidden="true" />
        {props.compact ? value : colorName(value)}
      </button>
      {open && (
        <div className={`color-pop${above ? ' color-pop-above' : ''}`} id={popId} role="dialog" aria-label={`Pick a color for ${props.label}`}>
          <div className="swatch-row">
            {NAMED.map((n) => (
              <Swatch key={n} n={n} current={value} onPick={pick} />
            ))}
          </div>
          <div className="swatch-row">
            {GRAYS.map((n) => (
              <Swatch key={n} n={n} current={value} onPick={pick} />
            ))}
          </div>
          {all ? (
            <div className="swatch-grid">
              {HUES.map((col) => (
                <div key={col[0]} className="swatch-col">
                  {col.map((n) => (
                    <Swatch key={n} n={n} current={value} onPick={pick} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <button type="button" className="btn btn-small" onClick={() => setAll(true)}>
              More colors (10 to 249)
            </button>
          )}
          <p className="muted color-note">The standard CAD color numbers. 7 is black or white, whichever shows on the CAD background.</p>
        </div>
      )}
    </span>
  )
}
