// Host A of the markup editor (design 14 "Editor", R5): the full-size picture window. The picture as it prints (turned,
// cropped) fills the window at its printed shape, the marks drawn at print size for the slot the picture prints in
// (findPrinted), so labels look as big as they will on paper. The crop tool is a mode of the same window. Every change
// is stored at once (one undo step each); Done closes. Opened by "Mark up…" next to every report picture (photos, the
// cover photo, the calibration and data-page screenshots, custom-sheet pictures, uploaded pictures and PDF pages) and
// from the Pages view. Switched by MARKUP_ENABLED.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { MARKUP_ENABLED } from '../../../featureFlags.ts'
import type { ImagePlace } from '../../../report/imageItems.ts'
import { editorFrame, findPrinted, TOOLS } from '../../../report/markTools.ts'
import { uprightSize, type ImageRef, type SheetItem } from '../../../report/pageModel.ts'
import { SheetSvg } from '../PageSvg.tsx'
import { pictureAt, setPictureEdits } from '../../../report/pagesEdits.ts'
import type { MarkFrame } from '../../../report/markGeometry.ts'
import { useApp } from '../../appContext.ts'
import { CropTool, PictureWindow } from '../PictureWindow.tsx'
import { refKey, type ReadPicture } from '../reportFiles.ts'
import { useReport } from '../reportContext.ts'
import { pdfPageKey } from '../useReportPages.ts'
import { MarkupStage } from './MarkupStage.tsx'
import { MarkupPanel, MarkupToolbar, UndoRedo } from './MarkupToolbar.tsx'
import { useLevelsThumb } from './useLevelsThumb.ts'
import { useMarkupEditor } from './useMarkupEditor.ts'

/** What a "Mark up…" button points at: the picture's place and where its pixels come from. */
export interface MarkupTarget {
  at: ImagePlace
  /** The picture file (null while the slot has none). */
  picture: ImageRef | null
  /** An uploaded PDF page instead of a picture (no redaction, no crop). */
  pdfPage?: { file: string; page: number }
  /** A drawing sheet of the report instead of a picture (marks only: no redaction, crop or pixel edits). */
  drawing?: { item: SheetItem; thumbs: ReadonlyMap<string, string> }
  /** "photo 3", "the cover photo", for titles. */
  name: string
}

/** The room the full-screen window leaves the picture (the stage area's own size, followed as the window resizes). */
function useStageRoom(ref: React.RefObject<HTMLDivElement | null>): { w: number; h: number } {
  const [room, setRoom] = useState({ w: 900, h: 560 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setRoom({ w: Math.max(200, el.clientWidth - 16), h: Math.max(160, el.clientHeight - 16) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return room
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** CSS pixels per inch: the browser's "actual size" (1 in = 96 CSS px; true on paper scale when the screen's scaling is set right). */
const CSS_PPI = 96
type Zoom = 'fit' | 1 | 2

/** The full-size markup window for one picture. */
export function MarkupWindow({ target, onClose }: { target: MarkupTarget; onClose: () => void }) {
  const app = useApp()
  const { pages } = useReport()
  const report = app.state.job!.history.present.report!
  const item = pictureAt(report, target.at)
  const pic = target.pdfPage ? pages.pictures.get(pdfPageKey(target.pdfPage.file, target.pdfPage.page)) : target.picture ? pages.pictures.get(refKey(target.picture)) : null
  const printed = useMemo(() => findPrinted(pages.doc, target.at), [pages.doc, target.at])
  const [mode, setMode] = useState<'markup' | 'crop'>('markup')
  const title = `Mark up ${target.name}`
  if (!item) return null
  const edits = item.edits
  if (target.drawing) {
    const d = target.drawing
    const frame = editorFrame({ w: d.item.region.w, h: d.item.region.h }, { crop: null, rotate: 0 }, printed)
    return (
      <PictureWindow title={title} okLabel="Done" noCancel onOk={onClose} onCancel={onClose} className="markup-window" bare>
        <EditorBody target={target} title={title} onDone={onClose} pic={null} frame={frame} printedW={printed?.frame.w ?? null} printedPage={printed ? printed.page + 1 : null}
          sheet={{ item: { ...d.item, box: { x: frame.x, y: frame.y, w: frame.w, h: frame.h }, marks: undefined }, thumbs: d.thumbs }} />
      </PictureWindow>
    )
  }
  // A PDF page's marks are in fractions of the page as stored (before its turn); its size comes from the printed page.
  const upright = target.pdfPage ? (printed?.frame.upright ?? (pic ? { w: pic.info.width, h: pic.info.height } : null)) : pic ? uprightSize(pic.info) : null
  return (
    <PictureWindow title={title} okLabel="Done" noCancel onOk={onClose} onCancel={onClose} className="markup-window" bare={mode === 'markup' && !!pic && !!upright}>
      {!pic || !upright ? (
        <p className="msg msg-warning">{pic === null ? 'The picture could not be read: choose its folder or file again, then try.' : 'Reading the picture...'}</p>
      ) : mode === 'crop' ? (
        <>
          <CropTool pic={pic} crop={edits.crop} rotate={edits.rotate} onChange={(crop, rotate) => app.edit(`Crop ${target.name}`, (p) => setPictureEdits(p, target.at, { crop, rotate }), `crop:${JSON.stringify(target.at)}`)} />
          <div className="button-row">
            <button type="button" className="btn btn-primary" onClick={() => {
              app.dispatch({ type: 'endEditGroup' })
              setMode('markup')
            }}>Back to markup</button>
          </div>
        </>
      ) : (
        <EditorBody target={target} title={title} onDone={onClose} pic={pic} frame={editorFrame(upright, target.pdfPage ? { crop: null, rotate: edits.rotate } : edits, printed)} printedW={printed?.frame.w ?? null}
          printedPage={printed ? printed.page + 1 : null} onCrop={target.pdfPage ? undefined : () => setMode('crop')} />
      )}
    </PictureWindow>
  )
}

function EditorBody({ target, title, onDone, pic, frame, printedW, printedPage, onCrop, sheet }: {
  target: MarkupTarget
  title: string
  onDone: () => void
  pic: ReadPicture | null
  frame: MarkFrame
  printedW: number | null
  printedPage: number | null
  onCrop?: () => void
  /** A drawing sheet drawn under the marks (placed in the frame). */
  sheet?: { item: SheetItem; thumbs: ReadonlyMap<string, string> }
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const room = useStageRoom(wrap)
  // Fit (the whole picture on screen) or actual print size (1x, 2x), kept per browser.
  const [zoom, setZoomState] = useState<Zoom>(() => {
    try {
      const z = localStorage.getItem('axisbuilder:markupZoom')
      return z === '1' ? 1 : z === '2' ? 2 : 'fit'
    } catch {
      return 'fit'
    }
  })
  const setZoom = (z: Zoom) => {
    setZoomState(z)
    try {
      localStorage.setItem('axisbuilder:markupZoom', String(z))
    } catch {
      // not kept
    }
  }
  const fitPpi = Math.min(room.w / frame.w, room.h / frame.h)
  const ppi = zoom === 'fit' ? fitPpi : zoom * CSS_PPI
  const ed = useMarkupEditor({ at: target.at, frame, ppi, allowRedaction: !target.pdfPage && !target.drawing })
  const [original, setOriginal] = useState(false)
  const levels = (ed.item?.edits.adjust.autoLevels ?? false) && !target.pdfPage && !target.drawing
  const href = useLevelsThumb(pic, levels && !original, frame.crop)
  const root = useRef<HTMLDivElement>(null)
  const sheetId = useId().replace(/:/g, '')
  useEffect(() => root.current?.focus(), [])
  const printed = printedW !== null ? `prints ${printedW.toFixed(2)} in wide on p. ${printedPage}` : `not in the report yet (as if ${frame.w.toFixed(1)} in wide)`
  const hint = ed.status || TOOLS.find((t) => t.id === ed.tool)?.hint || ''
  return (
    <div className="markup-editor" ref={root} tabIndex={-1} onKeyDown={(e) => {
      const t = e.target as HTMLElement
      if (onCrop && e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey && t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && t.tagName !== 'SELECT') {
        e.preventDefault()
        onCrop()
        return
      }
      ed.onKeyDown(e)
    }}>
      <div className="markup-head">
        <h2 className="visually-hidden">{title}</h2>
        <MarkupToolbar ed={ed} part="settings" />
        <span className="markup-spacer" />
        <UndoRedo />
        <button type="button" className="btn btn-primary" onClick={onDone} title="Close (Esc)">Done</button>
      </div>
      <div className="markup-body">
        <MarkupToolbar ed={ed} part="tools" showCrop={!!onCrop} onCrop={onCrop} />
        <div className="markup-stage-wrap" ref={wrap}>
          <MarkupStage ed={ed} picture={href ? { href } : null} label={`${target.name} with its marks`} paper={!!sheet}>
            {sheet && <SheetSvg it={sheet.item} thumbs={sheet.thumbs} minW={1 / ppi} id={`${sheetId}-sheet`} />}
          </MarkupStage>
        </div>
      </div>
      <MarkupPanel ed={ed} original={original} setOriginal={setOriginal} compact hint={hint} extra={(
        <>
          <span className="muted markup-printed" title={`${target.name}: ${printed}. Marks and text are drawn to the printed scale at every zoom`}>
            <strong>{capital(target.name)}</strong> · {printed}
          </span>
          <span className="markup-group" role="group" aria-label="Zoom">
            <button type="button" className={`btn btn-small${zoom === 'fit' ? ' on' : ''}`} aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}
              title="The whole picture on screen">Fit ({Math.round((fitPpi / CSS_PPI) * 100)}%)</button>
            <button type="button" className={`btn btn-small${zoom === 1 ? ' on' : ''}`} aria-pressed={zoom === 1} onClick={() => setZoom(1)}
              title="Actual print size: one inch on paper is one inch on screen (with the screen's scaling at its recommended setting); scroll to move around">Actual size</button>
            <button type="button" className={`btn btn-small${zoom === 2 ? ' on' : ''}`} aria-pressed={zoom === 2} aria-label="Zoom to 200 percent of print size" onClick={() => setZoom(2)}
              title="Twice the print size, for fine work">200%</button>
          </span>
        </>
      )} />
    </div>
  )
}

/** "Mark up…" next to a picture: opens the full-size markup window (when the markup editor is switched on). */
export function MarkupButton(props: MarkupTarget & { small?: boolean }) {
  const [open, setOpen] = useState(false)
  const app = useApp()
  const report = app.state.job!.history.present.report!
  const n = pictureAt(report, props.at)?.edits.markup.length ?? 0
  if (!MARKUP_ENABLED || (!props.picture && !props.pdfPage)) return null
  return (
    <>
      <button type="button" className={props.small ? 'icon-btn' : 'btn btn-small'} onClick={() => setOpen(true)}
        aria-label={`Mark up ${props.name}`} title={n ? `Marked up (${n} mark${n === 1 ? '' : 's'}): change the marks` : 'Draw boxes, arrows, highlights, labels and badges on the picture'}>
        {props.small ? '✎' : n ? `Mark up (${n})…` : 'Mark up…'}
      </button>
      {open && <MarkupWindow target={props} onClose={() => setOpen(false)} />}
    </>
  )
}
