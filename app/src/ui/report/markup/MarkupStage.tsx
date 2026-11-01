// The markup editor's drawing surface: an SVG in view inches (the picture as it prints), drawn at the host's zoom. The
// picture underneath, its marks through the page's own drawing code (report/marks.ts + PageSvg's BasicItem, so the
// stage looks exactly like the page and the PDF), redactions as stand-ins (black, or the picture blurred there; the
// PDF and the Pages view remove the pixels), the selection with its handles, alignment guides, the selection box and
// the right-click menu.

import { useId, type ReactNode } from 'react'
import { boxCorners, boxToView, markBounds, markHandles, type Pt } from '../../../report/markGeometry.ts'
import { markItemsOf } from '../../../report/marks.ts'
import { storedToPage } from '../../../report/pageModel.ts'
import type { Mark } from '../../../report/schema.ts'
import { BasicItem } from '../PageSvg.tsx'
import { ROTATE_PX, type MarkupEditorState } from './useMarkupEditor.ts'

/** The picture under the marks: an upright thumbnail, placed turned and cropped as the page places it. */
export interface StagePicture {
  href: string
}

const num = (n: number) => String(Math.round(n * 100000) / 100000)

export function MarkupStage({ ed, picture, label, children, paper }: { ed: MarkupEditorState; picture: StagePicture | null; label: string; children?: ReactNode; /** White paper under the marks (a drawing sheet) instead of the dark picture ground. */ paper?: boolean }) {
  const { frame, ppi } = ed
  const id = useId().replace(/:/g, '')
  const W = Math.round(frame.w * ppi)
  const H = Math.round(frame.h * ppi)
  const px = 1 / ppi
  const [a, b, c, d, e, f] = storedToPage(frame, 1)
  const matrix = `matrix(${[a, b, c, d, e, f].map(num).join(' ')})`
  const drawn = [...ed.marks].sort((x, y) => x.z - y.z)
  const one = ed.selected.length === 1 ? ed.selected[0] : null
  const handles = one && !one.locked ? markHandles(frame, one, ROTATE_PX / ppi) : []

  const redaction = (m: Extract<Mark, { kind: 'redaction' }>, key: string, preview = false) => {
    const pts = boxCorners(boxToView(frame, m.box))
    const poly = pts.map((p) => p.map(num).join(',')).join(' ')
    if (m.mode === 'black') return <polygon key={key} points={poly} fill="#000" opacity={preview ? 0.8 : 1} />
    const g = boxToView(frame, m.box)
    return (
      <g key={key}>
        <clipPath id={`${id}-${key}`}>
          <polygon points={poly} />
        </clipPath>
        {picture ? (
          <g clipPath={`url(#${id}-${key})`}>
            <image href={picture.href} x={0} y={0} width={1} height={1} preserveAspectRatio="none" transform={matrix} filter={`url(#${id}-blur-${Math.max(1, Math.round(Math.min(g.w, g.h) * 12))})`} />
          </g>
        ) : <polygon points={poly} fill="#8a8f96" />}
        <polygon points={poly} fill="none" stroke="#ffffff" strokeOpacity={0.6} strokeDasharray={`${4 * px} ${3 * px}`} strokeWidth={px} />
      </g>
    )
  }
  const blurs = [...new Set(drawn.filter((m): m is Extract<Mark, { kind: 'redaction' }> => m.kind === 'redaction' && m.mode === 'blur').map((m) => {
    const g = boxToView(frame, m.box)
    return Math.max(1, Math.round(Math.min(g.w, g.h) * 12))
  }))]

  const markNodes = (m: Mark, key: string) => (m.kind === 'redaction' ? redaction(m, key, m.id === 'preview') : markItemsOf(frame, m).map((it, k) => <BasicItem key={`${key}-${k}`} it={it} />))

  return (
    <div className="markup-stage" style={{ width: W, height: H }}>
      <svg width={W} height={H} viewBox={`${num(frame.x)} ${num(frame.y)} ${num(frame.w)} ${num(frame.h)}`} role="img" aria-label={label}
        style={{ cursor: ed.cursor }} {...ed.pointer}>
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} />
          </clipPath>
          {blurs.map((k) => (
            <filter key={k} id={`${id}-blur-${k}`} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation={k / 96} />
            </filter>
          ))}
        </defs>
        <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill={paper ? "#ffffff" : "#20262d"} />
        <g clipPath={`url(#${id}-clip)`}>
          {picture && <image href={picture.href} x={0} y={0} width={1} height={1} preserveAspectRatio="none" transform={matrix} />}
          {children}
          {drawn.map((m) => markNodes(m, m.id))}
          {ed.creating && markNodes(ed.creating, 'preview')}
        </g>
        <g className="markup-overlay" pointerEvents="none">
          {ed.selected.map((m) => {
            const r = markBounds(frame, m)
            return <rect key={m.id} x={r.x - 2 * px} y={r.y - 2 * px} width={r.w + 4 * px} height={r.h + 4 * px} fill="none" stroke={m.locked ? '#9aa4b0' : '#3d8bfd'} strokeWidth={1.25 * px} strokeDasharray={`${4 * px} ${3 * px}`} />
          })}
          {one && handles.some((h) => h.h === 'rotate') && (() => {
            const g = (one.kind === 'rect' || one.kind === 'ellipse') ? boxToView(frame, one.box, one.angle) : null
            const top = handles.find((h) => h.h === 'n')?.at
            const rot = handles.find((h) => h.h === 'rotate')!.at
            return g && top ? <line x1={top[0]} y1={top[1]} x2={rot[0]} y2={rot[1]} stroke="#3d8bfd" strokeWidth={px} /> : null
          })()}
          {handles.map((h) => (h.h === 'rotate'
            ? <circle key={h.h} cx={h.at[0]} cy={h.at[1]} r={5 * px} fill="#ffffff" stroke="#3d8bfd" strokeWidth={1.5 * px} />
            : <rect key={h.h} x={h.at[0] - 4.5 * px} y={h.at[1] - 4.5 * px} width={9 * px} height={9 * px} fill="#ffffff" stroke="#3d8bfd" strokeWidth={1.5 * px} />))}
          {ed.guides.x !== null && <line x1={ed.guides.x} y1={frame.y} x2={ed.guides.x} y2={frame.y + frame.h} stroke="#ff4fd8" strokeWidth={px} strokeDasharray={`${3 * px} ${3 * px}`} />}
          {ed.guides.y !== null && <line x1={frame.x} y1={ed.guides.y} x2={frame.x + frame.w} y2={ed.guides.y} stroke="#ff4fd8" strokeWidth={px} strokeDasharray={`${3 * px} ${3 * px}`} />}
          {ed.band && <rect x={ed.band.x} y={ed.band.y} width={ed.band.w} height={ed.band.h} fill="rgb(61 139 253 / 0.12)" stroke="#3d8bfd" strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} />}
        </g>
      </svg>
      {ed.menu && <StageMenu ed={ed} at={[ed.menu.x, ed.menu.y]} />}
    </div>
  )
}

/** The right-click menu on a mark. */
function StageMenu({ ed, at }: { ed: MarkupEditorState; at: Pt }) {
  const locked = ed.selected.length > 0 && ed.selected.every((m) => m.locked)
  const item = (label: string, keys: string, run: () => void) => (
    <button type="button" role="menuitem" onClick={() => {
      ed.setMenu(null)
      run()
    }}>
      <span>{label}</span>
      <kbd>{keys}</kbd>
    </button>
  )
  return (
    <div className="markup-menu" role="menu" style={{ left: at[0], top: at[1] }} onPointerDown={(e) => e.stopPropagation()}>
      {item('Duplicate', 'Ctrl+D', ed.actions.duplicate)}
      {item('Bring forward', ']', () => ed.actions.order('forward'))}
      {item('Send back', '[', () => ed.actions.order('back'))}
      {item('Bring to front', 'Shift+]', () => ed.actions.order('front'))}
      {item('Send to back', 'Shift+[', () => ed.actions.order('backmost'))}
      {item(locked ? 'Unlock' : 'Lock', 'Ctrl+L', ed.actions.lock)}
      {item('Delete', 'Del', ed.actions.remove)}
    </div>
  )
}
