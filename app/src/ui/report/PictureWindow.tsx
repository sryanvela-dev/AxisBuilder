// The full-size picture window (design 14 "Editor"): one frame that holds a picture tool, opened from the picture's row
// on any report step. R4 puts the crop tool in it; R5's markup editor uses the same window (and later a host in the
// Pages view), so the window knows nothing about the tool: it gives it the space, a title and OK / Cancel.
//
// Crop tool: the picture upright (phone orientation applied) and turned as it prints; drag the box or its handles; the
// picture's own shape is kept unless "Free" is on; preset shapes; turn left / right; Reset. OK stores the crop and the
// turn in one undo step; marks stay where they are on the picture (outside the crop they are hidden, not deleted).

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  FULL_BOX,
  boxAspect,
  dragBox,
  fitAspect,
  presetAspect,
  presetBox,
  storedCrop,
  turnBox,
  turnedSize,
  turned as turnOnce,
  unturnBox,
  type Handle,
} from '../../report/crop.ts'
import type { ImagePlace } from '../../report/imageItems.ts'
import { uprightSize, type ImageRef } from '../../report/pageModel.ts'
import { pictureAt, setPictureEdits } from '../../report/pagesEdits.ts'
import type { FracBox, Rotation } from '../../report/schema.ts'
import { useApp } from '../appContext.ts'
import { refKey, type ReadPicture } from './reportFiles.ts'
import { useReport } from './reportContext.ts'

/** The window: a title, the tool, OK and Cancel. Escape cancels, Enter (outside a box) is OK. */
export function PictureWindow(props: { title: string; children: ReactNode; onOk: () => void; onCancel: () => void; okLabel?: string; noCancel?: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    box.current?.focus()
    return () => previous?.focus?.()
  }, [])
  return (
    <div className="dialog-backdrop picture-window-backdrop" onKeyDown={(e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        props.onCancel()
      }
    }}>
      <div className={`dialog picture-window${props.className ? ` ${props.className}` : ''}`} role="dialog" aria-modal="true" aria-label={props.title} tabIndex={-1} ref={box}>
        <h2>{props.title}</h2>
        {props.children}
        <div className="dialog-buttons">
          {!props.noCancel && (
            <button type="button" className="btn" onClick={props.onCancel}>
              Cancel
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={props.onOk}>
            {props.okLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}

type Preset = 'original' | '4:3' | '3:2' | 'square'
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: '4:3', label: '4:3' },
  { id: '3:2', label: '3:2' },
  { id: 'square', label: 'Square' },
]
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
/** Largest size the picture is shown at in the window, in CSS pixels. */
const STAGE = { w: 860, h: 560 }

/** The crop tool on one picture: the box is kept in the turned picture's fractions while the window is open. */
export function CropTool(props: { pic: ReadPicture; crop: FracBox | null; rotate: Rotation; onChange: (crop: FracBox | null, rotate: Rotation) => void }) {
  const upright = uprightSize(props.pic.info)
  const { rotate } = props
  const size = turnedSize(upright, rotate)
  const box = turnBox(rotate, props.crop ?? FULL_BOX)
  const [free, setFree] = useState(false)
  // The shape kept while dragging: the box's own, unless Free.
  const aspect = free ? null : boxAspect(box, size)
  const k = Math.min(STAGE.w / size.w, STAGE.h / size.h, 1.5)
  const W = Math.round(size.w * k)
  const H = Math.round(size.h * k)
  const drag = useRef<{ handle: Handle; x: number; y: number; start: FracBox; aspect: number | null; w: number; h: number } | null>(null)
  const stage = useRef<SVGSVGElement>(null)
  const set = (b: FracBox, r: Rotation = rotate) => props.onChange(storedCrop(unturnBox(r, b)), r)

  const down = (handle: Handle) => (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    // The picture's size on screen (the window may draw it smaller than W x H).
    const r = stage.current?.getBoundingClientRect()
    drag.current = { handle, x: e.clientX, y: e.clientY, start: box, aspect, w: r?.width || W, h: r?.height || H }
  }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    set(dragBox(d.start, d.handle, (e.clientX - d.x) / d.w, (e.clientY - d.y) / d.h, d.aspect, size))
  }
  const up = () => {
    drag.current = null
  }
  const nudge = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01
    const by: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const d = by[e.key]
    if (!d) return
    e.preventDefault()
    set(dragBox(box, 'move', d[0], d[1], null, size))
  }
  const preset = (p: Preset) => {
    setFree(false)
    set(presetBox(presetAspect(p, size), size))
  }
  const turn = (dir: 'left' | 'right') => props.onChange(props.crop, turnOnce(rotate, dir))

  // The picture is upright; the turn is drawn here as the PDF turns it.
  const imgW = rotate === 90 || rotate === 270 ? H : W
  const imgH = rotate === 90 || rotate === 270 ? W : H
  const px = (b: FracBox) => ({ x: b.x0 * W, y: b.y0 * H, w: (b.x1 - b.x0) * W, h: (b.y1 - b.y0) * H })
  const r = px(box)
  const handleAt = (h: Handle): [number, number] => [
    h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2,
    h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2,
  ]
  const pxW = Math.round((box.x1 - box.x0) * size.w)
  const pxH = Math.round((box.y1 - box.y0) * size.h)
  return (
    <div className="crop-tool">
      <div className="button-row crop-bar">
        <span className="muted">Shape:</span>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className="btn btn-small" onClick={() => preset(p.id)}>
            {p.label}
          </button>
        ))}
        <label className="check-inline">
          <input type="checkbox" checked={free} onChange={(e) => {
            setFree(e.target.checked)
            if (!e.target.checked) set(fitAspect(box, boxAspect(box, size), size))
          }} />
          Free (any shape)
        </label>
        <button type="button" className="icon-btn" onClick={() => turn('left')} aria-label="Turn the picture left" title="Turn left (a quarter, anticlockwise)">⟲</button>
        <button type="button" className="icon-btn" onClick={() => turn('right')} aria-label="Turn the picture right" title="Turn right (a quarter, clockwise)">⟳</button>
        <button type="button" className="btn btn-small" onClick={() => props.onChange(null, 0)} title="The whole picture, not turned">
          Reset
        </button>
      </div>
      <div className="crop-stage" style={{ width: W, height: H }}>
        <svg ref={stage} width={W} height={H} viewBox={`0 0 ${W} ${H}`} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="img" aria-label="The picture with the crop box">
          <image href={props.pic.thumb} x={(W - imgW) / 2} y={(H - imgH) / 2} width={imgW} height={imgH} preserveAspectRatio="none"
            transform={rotate ? `rotate(${rotate} ${W / 2} ${H / 2})` : undefined} />
          <path className="crop-shade" fillRule="evenodd" d={`M0 0H${W}V${H}H0Z M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z`} />
          <rect className="crop-box" x={r.x} y={r.y} width={r.w} height={r.h} tabIndex={0} onPointerDown={down('move')} onKeyDown={nudge}
            aria-label="Crop box: drag to move, arrow keys nudge" />
          {[1, 2].map((n) => (
            <g key={n} className="crop-thirds">
              <line x1={r.x + (r.w * n) / 3} y1={r.y} x2={r.x + (r.w * n) / 3} y2={r.y + r.h} />
              <line x1={r.x} y1={r.y + (r.h * n) / 3} x2={r.x + r.w} y2={r.y + (r.h * n) / 3} />
            </g>
          ))}
          {HANDLES.map((h) => {
            const [x, y] = handleAt(h)
            return <rect key={h} className={`crop-handle crop-handle-${h}`} x={x - 6} y={y - 6} width={12} height={12} onPointerDown={down(h)} />
          })}
        </svg>
      </div>
      <p className="muted crop-info">
        {props.crop ? `Prints ${pxW} x ${pxH} pixels of ${size.w} x ${size.h}.` : `The whole picture (${size.w} x ${size.h} pixels).`}
        {free ? ' Any shape.' : ' Dragging keeps this shape; tick Free for any shape.'} Marks outside the box are hidden, not deleted.
      </p>
    </div>
  )
}

/** The crop window for one picture in the report; OK is one undo step. */
export function CropDialog(props: { at: ImagePlace; picture: ImageRef; name: string; onClose: () => void }) {
  const app = useApp()
  const { pages } = useReport()
  const report = app.state.job!.history.present.report!
  const item = useMemo(() => pictureAt(report, props.at), [report, props.at])
  const [crop, setCrop] = useState<FracBox | null>(item?.edits.crop ?? null)
  const [rotate, setRotate] = useState<Rotation>(item?.edits.rotate ?? 0)
  const pic = pages.pictures.get(refKey(props.picture))
  const ok = () => {
    app.edit(`Crop ${props.name}`, (p) => setPictureEdits(p, props.at, { crop, rotate }))
    props.onClose()
  }
  return (
    <PictureWindow title={`Crop ${props.name}`} onOk={ok} onCancel={props.onClose}>
      {pic ? (
        <CropTool pic={pic} crop={crop} rotate={rotate} onChange={(c, r) => {
          setCrop(c)
          setRotate(r)
        }} />
      ) : (
        <p className="msg msg-warning">{pic === null ? 'The picture could not be read: choose its folder or file again, then try.' : 'Reading the picture...'}</p>
      )}
    </PictureWindow>
  )
}

/** "Crop..." beside a picture: opens the crop window. Shows when the picture has a file. */
export function CropButton(props: { at: ImagePlace; picture: ImageRef | null; name: string; small?: boolean }) {
  const [open, setOpen] = useState(false)
  const app = useApp()
  const report = app.state.job!.history.present.report!
  const edits = pictureAt(report, props.at)?.edits
  if (!props.picture) return null
  const cropped = edits?.crop !== null && edits?.crop !== undefined
  return (
    <>
      <button type="button" className={props.small ? 'icon-btn' : 'btn btn-small'} onClick={() => setOpen(true)}
        aria-label={`Crop ${props.name}`} title={cropped ? 'Cropped: change or reset the crop' : 'Crop or turn the picture'}>
        {props.small ? '✂' : cropped ? 'Crop (cropped)…' : 'Crop…'}
      </button>
      {open && <CropDialog at={props.at} picture={props.picture} name={props.name} onClose={() => setOpen(false)} />}
    </>
  )
}
