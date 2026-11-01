// Host B of the markup editor (design 14 "Editor", R5): a picture edited in place on its page in the Pages view. The
// page around it is dimmed; the toolbar floats at the top, the selection and picture settings at the bottom; the same
// editor (useMarkupEditor) as the full-size window, so every tool works the same. Esc (with nothing left to cancel), a
// click on the dimmed page, or Done leaves it.

import { useEffect, useRef, useState } from 'react'
import type { ImagePlace } from '../../../report/imageItems.ts'
import type { MarkFrame } from '../../../report/markGeometry.ts'
import type { ReadPicture } from '../reportFiles.ts'
import { MarkupStage } from './MarkupStage.tsx'
import { MarkupPanel, MarkupToolbar } from './MarkupToolbar.tsx'
import { useLevelsThumb } from './useLevelsThumb.ts'
import { useMarkupEditor } from './useMarkupEditor.ts'

export interface InPlaceProps {
  at: ImagePlace
  name: string
  /** The picture's frame on the page (page inches). */
  frame: MarkFrame
  /** Where the frame's top-left corner is on screen, relative to the Pages view, and the zoom (pixels per inch). */
  left: number
  top: number
  ppi: number
  pic: ReadPicture | null
  allowRedaction: boolean
  onDone: () => void
}

export function InPlaceEditor(p: InPlaceProps) {
  const ed = useMarkupEditor({ at: p.at, frame: p.frame, ppi: p.ppi, allowRedaction: p.allowRedaction })
  const [original, setOriginal] = useState(false)
  const levels = (ed.item?.edits.adjust.autoLevels ?? false) && p.allowRedaction
  const href = useLevelsThumb(p.pic, levels && !original, p.frame.crop)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => root.current?.focus(), [])
  return (
    <div className="markup-inplace" ref={root} tabIndex={-1} role="dialog" aria-label={`Mark up ${p.name} on the page`} onKeyDown={(e) => {
      ed.onKeyDown(e)
      if (!e.defaultPrevented && e.key === 'Escape') {
        e.preventDefault()
        p.onDone()
      }
      // Keys stay with the editor (the Pages view would turn the page or close).
      e.stopPropagation()
    }}>
      <div className="markup-inplace-dim" onPointerDown={p.onDone} />
      <div className="markup-inplace-bar">
        <div className="markup-row">
          <strong>Marking up {p.name}</strong>
          <span className="muted">on its page, at the size it prints</span>
          <span className="markup-spacer" />
          <button type="button" className="btn btn-primary btn-small" onClick={p.onDone} title="Back to the page (Esc)">Done</button>
        </div>
        <MarkupToolbar ed={ed} />
      </div>
      <div className="markup-inplace-stage" style={{ left: p.left, top: p.top }}>
        <MarkupStage ed={ed} picture={href ? { href } : null} label={`${p.name} with its marks`} />
      </div>
      <div className="markup-inplace-bar markup-inplace-bottom">
        <p className="muted markup-status" role="status">{ed.status}</p>
        <MarkupPanel ed={ed} original={original} setOriginal={setOriginal} />
      </div>
    </div>
  )
}
