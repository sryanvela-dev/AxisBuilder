// The markup editor's toolbar (design 14 "Tools" and "Labels"): tools (icon + name, the shortcut in the tooltip), the
// settings of the tool or of the selected marks (colours with their meaning, widths, box style, highlighter, arrow
// heads, label look, redaction), what to do with the selection (duplicate, order, lock, delete), a label's text or live
// data link, a badge's key text, label styles (built in and saved per computer), auto brightness / contrast with a
// before / after, copy markup to other photos, undo and redo.

import { useEffect, useRef, useState } from 'react'
import { pictureName } from '../../../report/checks.ts'
import { defaultTemplate, liveText, LIVE_FIELDS } from '../../../report/liveLabels.ts'
import { applyLabelStyle, copyMarkupTo, labelStyleChoices, labelStyleOf, setFields, type LabelStyle } from '../../../report/markEdits.ts'
import {
  applyPrefToMark, COLOR_PRESETS, copyTargets, HIGHLIGHT_WIDTHS, SHAPE_MODES, TEXT_SIZES, TOOLS, WIDTH_PRESETS, type ToolId, type ToolPrefs,
} from '../../../report/markTools.ts'
import { setPictureEdits } from '../../../report/pagesEdits.ts'
import { addRecord, type SavedRecord } from '../../../report/savedLists.ts'
import type { Mark } from '../../../report/schema.ts'
import { useApp } from '../../appContext.ts'
import { useReport } from '../reportContext.ts'
import type { MarkupEditorState } from './useMarkupEditor.ts'

const SHAPE_NAMES = { outline: 'Outline', filled: 'Filled', highlighted: 'Highlighted' } as const
const CALLOUTS = [['rounded', 'Rounded box'], ['square', 'Square box'], ['pill', 'Pill'], ['plain', 'Text with halo']] as const
const LEADER_ENDS = [['arrow', 'Arrow'], ['dot', 'Dot'], ['none', 'No end']] as const
const HEADS = [['closed', 'Closed'], ['open', 'Open'], ['dot', 'Dot'], ['none', 'None']] as const

/** Which settings a tool or a mark kind shows. */
function settingsFor(kinds: ReadonlySet<string>) {
  const has = (...k: string[]) => k.some((x) => kinds.has(x))
  return {
    color: has('rect', 'ellipse', 'highlight', 'highlightLine', 'pen', 'line', 'arrow', 'label', 'badge'),
    width: has('rect', 'ellipse', 'pen', 'line', 'arrow'),
    shape: has('rect', 'ellipse'),
    highlight: has('highlight', 'highlightLine'),
    head: has('arrow'),
    text: has('label', 'badge'),
    label: has('label'),
    redact: has('redaction'),
  }
}

export function MarkupToolbar({ ed, showCrop, onCrop, part = 'all' }: {
  ed: MarkupEditorState
  /** The crop tool (window host only). */
  showCrop?: boolean
  onCrop?: () => void
  /** Both rows (in place), or only the tools as a vertical rail / only the settings row (the full-screen window). */
  part?: 'all' | 'tools' | 'settings'
}) {
  const { savedLists, changeLists } = useReport()
  const { tool, prefs, selected } = ed
  const kinds = new Set<string>(selected.length ? selected.map((m) => m.kind) : [tool])
  const show = settingsFor(kinds)
  const styles = labelStyleChoices(savedLists.records.labelStyles as SavedRecord<'labelStyles'>[])
  const one = selected.length === 1 ? selected[0] : null

  /** A setting: kept for new marks, and applied to the selected marks (one undo step). */
  const pref = (change: Partial<ToolPrefs>, label = 'Change marks') => {
    ed.setPrefs(change)
    if (selected.length) ed.actions.change(label, (marks) => setFields(marks, ed.selection, (m) => applyPrefToMark(m, change)))
  }
  const pickStyle = (name: string) => {
    const s = styles.find((x) => x.name === name)
    if (!s) return
    if (selected.some((m) => m.kind === 'label' || m.kind === 'badge')) ed.actions.change(`Apply the ${s.name} style`, (marks) => setFields(marks, ed.selection, (m) => applyLabelStyle(m, s)))
    else {
      ed.setNewStyle(s)
      ed.setTool(s.kind === 'badge' ? 'badge' : 'label')
    }
  }

  const rail = part === 'tools'
  return (
    <div className={rail ? 'markup-rail' : 'markup-toolbar'} role="toolbar" aria-label={part === 'settings' ? 'Tool settings' : 'Markup tools'} aria-orientation={rail ? 'vertical' : undefined}>
      {part !== 'settings' && <div className={rail ? 'markup-rail-tools' : 'markup-row markup-tools'}>
        {TOOLS.filter((t) => t.id !== 'redaction' || ed.allowRedaction).map((t) => (
          <button key={t.id} type="button" className={`markup-tool${tool === t.id ? ' on' : ''}`} aria-pressed={tool === t.id} title={`${t.hint} (${t.key})`} onClick={() => ed.setTool(t.id as ToolId)}>
            <span className="markup-icon" aria-hidden="true">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
        {showCrop && (
          <button type="button" className="markup-tool" title="Crop or turn the picture (C)" onClick={onCrop}>
            <span className="markup-icon" aria-hidden="true">✂</span>
            <span>Crop</span>
          </button>
        )}
        {!ed.allowRedaction && (rail
          ? (
            <button type="button" className="markup-tool" disabled aria-label="Redact (pictures only)"
              title="Redaction is for pictures only: a PDF page or a drawing is copied into the report as vectors, so there are no pixels to remove">
              <span className="markup-icon" aria-hidden="true">▇</span>
              <span>Redact</span>
            </button>
          )
          : <span className="muted markup-note" title="A PDF page is copied into the report as it is, so its pixels can't be removed">Redaction: pictures only (not PDF pages or drawings)</span>)}
      </div>}

      {part !== 'tools' && <div className="markup-row markup-settings">
        {show.color && (
          <span className="markup-group" role="group" aria-label="Colour">
            {COLOR_PRESETS.map((c) => (
              <button key={c.color} type="button" className={`markup-swatch${prefs.color === c.color ? ' on' : ''}`} style={{ background: c.color }}
                title={c.name} aria-label={c.name} aria-pressed={prefs.color === c.color} onClick={() => pref({ color: c.color }, 'Change colour')} />
            ))}
            <input type="color" value={prefs.color} title="Another colour" aria-label="Another colour" onChange={(e) => pref({ color: e.target.value }, 'Change colour')} />
          </span>
        )}
        {show.width && (
          <span className="markup-group" role="group" aria-label="Line width">
            {WIDTH_PRESETS.map((w) => (
              <button key={w.w} type="button" className={`btn btn-small${prefs.width === w.w ? ' on' : ''}`} aria-pressed={prefs.width === w.w} title={`${w.name} line (${w.w} pt at print size)`} onClick={() => pref({ width: w.w }, 'Change line width')}>{w.name}</button>
            ))}
          </span>
        )}
        {show.shape && (
          <span className="markup-group" role="group" aria-label="Box style">
            {SHAPE_MODES.map((s) => (
              <button key={s} type="button" className={`btn btn-small${prefs.shape === s ? ' on' : ''}`} aria-pressed={prefs.shape === s}
                title={s === 'highlighted' ? 'See-through fill with a solid edge' : s === 'filled' ? 'Solid fill' : 'Edge only'} onClick={() => pref({ shape: s }, 'Change box style')}>{SHAPE_NAMES[s]}</button>
            ))}
          </span>
        )}
        {show.highlight && (
          <span className="markup-group" role="group" aria-label="Highlighter width">
            {HIGHLIGHT_WIDTHS.map((w) => (
              <button key={w.w} type="button" className={`btn btn-small${prefs.hlWidth === w.w ? ' on' : ''}`} aria-pressed={prefs.hlWidth === w.w} title={`${w.name} (${w.w} pt)`} onClick={() => pref({ hlWidth: w.w }, 'Change highlighter width')}>{w.name}</button>
            ))}
            <input type="range" min={2} max={48} step={1} value={prefs.hlWidth} aria-label="Highlighter width in points" title={`${prefs.hlWidth} pt`}
              onChange={(e) => ed.setPrefs({ hlWidth: Number(e.target.value) })} onPointerUp={(e) => pref({ hlWidth: Number((e.target as HTMLInputElement).value) }, 'Change highlighter width')} />
            <select value={prefs.hlEnds} aria-label="Highlighter ends" title="Flat (marker) or round ends" onChange={(e) => pref({ hlEnds: e.target.value as ToolPrefs['hlEnds'] }, 'Change highlighter ends')}>
              <option value="flat">Flat ends</option>
              <option value="round">Round ends</option>
            </select>
          </span>
        )}
        {show.head && (
          <label className="markup-group">
            <span className="muted">Head</span>
            <select value={prefs.head} onChange={(e) => pref({ head: e.target.value as ToolPrefs['head'] }, 'Change arrow head')}>
              {HEADS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </label>
        )}
        {show.text && (
          <span className="markup-group" role="group" aria-label="Label look">
            <select value={prefs.textSize} aria-label="Text size in points at print size" title="Text size in points, as printed" onChange={(e) => pref({ textSize: Number(e.target.value) }, 'Change text size')}>
              {TEXT_SIZES.map((s) => <option key={s} value={s}>{s} pt</option>)}
            </select>
            {show.label && (
              <>
                <button type="button" className={`btn btn-small${prefs.bold ? ' on' : ''}`} aria-pressed={prefs.bold} title="Bold" aria-label="Bold" onClick={() => pref({ bold: !prefs.bold }, 'Change bold')}><b>B</b></button>
                <select value={prefs.font} aria-label="Font" onChange={(e) => pref({ font: e.target.value as ToolPrefs['font'] }, 'Change font')}>
                  <option value="roboto">Roboto</option>
                  <option value="montserrat">Montserrat (headings)</option>
                </select>
                <select value={prefs.callout} aria-label="Callout style" onChange={(e) => pref({ callout: e.target.value as ToolPrefs['callout'] }, 'Change callout')}>
                  {CALLOUTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
                <select value={prefs.leaderEnd} aria-label="Leader end" title="End of the leader (drag from the target to place a label with a leader)" onChange={(e) => pref({ leaderEnd: e.target.value as ToolPrefs['leaderEnd'] }, 'Change leader end')}>
                  {LEADER_ENDS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </>
            )}
            <label className="check-inline" title="A thin contrasting outline (a halo on plain text), so it reads on any photo">
              <input type="checkbox" checked={prefs.halo} onChange={(e) => pref({ halo: e.target.checked }, 'Change outline')} />
              Outline
            </label>
            <label className="check-inline" title="How solid the box behind the text is">
              <span className="muted">Box</span>
              <input type="range" min={0.4} max={1} step={0.05} value={prefs.bgOpacity} aria-label="Box background opacity"
                onChange={(e) => ed.setPrefs({ bgOpacity: Number(e.target.value) })} onPointerUp={(e) => pref({ bgOpacity: Number((e.target as HTMLInputElement).value) }, 'Change box background')} />
            </label>
          </span>
        )}
        {show.redact && (
          <span className="markup-group" role="group" aria-label="Redaction">
            {(['black', 'blur'] as const).map((r) => (
              <button key={r} type="button" className={`btn btn-small${prefs.redact === r ? ' on' : ''}`} aria-pressed={prefs.redact === r} onClick={() => pref({ redact: r }, 'Change redaction')}>
                {r === 'black' ? 'Black box' : 'Blurred'}
              </button>
            ))}
            <span className="muted">The PDF holds the picture with these pixels removed.</span>
          </span>
        )}
        {(show.text || tool === 'label' || tool === 'badge') && (
          <span className="markup-group">
            <select value="" aria-label="Label styles" title="Apply a label style (to the selected labels, or to the next one you place)" onChange={(e) => pickStyle(e.target.value)}>
              <option value="">{ed.newStyle && !selected.length ? `Style: ${ed.newStyle.name}` : 'Apply a style…'}</option>
              {styles.map((s) => <option key={`${s.name}-${s.kind}`} value={s.name}>{s.name}{s.kind === 'badge' ? ' (badge)' : ''}</option>)}
            </select>
            {one && (one.kind === 'label' || one.kind === 'badge') && <SaveStyle mark={one} onSave={(s) => changeLists((l) => addRecord(l, 'labelStyles', s))} />}
          </span>
        )}
      </div>}

    </div>
  )
}

/** Under the picture: what to do with the selection, a label's text or live link, a badge's key, the picture's auto
 * brightness / contrast, copy markup and undo / redo (below the picture, so it never moves when these appear). */
/** Undo and redo (the app's own history, so Ctrl+Z / Ctrl+Y work too). */
export function UndoRedo() {
  const app = useApp()
  return (
    <span className="markup-group">
      <button type="button" className="icon-btn" disabled={!app.canUndo} onClick={app.undo} title={app.undoLabel ? `Undo: ${app.undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)'} aria-label="Undo">↶</button>
      <button type="button" className="icon-btn" disabled={!app.canRedo} onClick={app.redo} title={app.redoLabel ? `Redo: ${app.redoLabel} (Ctrl+Y)` : 'Redo (Ctrl+Y)'} aria-label="Redo">↷</button>
    </span>
  )
}

/**
 * `compact` (the full-screen window): everything on one bottom line that wraps only when it must, the tool hint while
 * nothing is selected, no undo / redo (they sit at the top), `extra` (print size and zoom) at the right end.
 */
export function MarkupPanel({ ed, original, setOriginal, compact = false, hint = '', extra }: {
  ed: MarkupEditorState
  original: boolean
  setOriginal: (on: boolean) => void
  compact?: boolean
  hint?: string
  extra?: React.ReactNode
}) {
  const app = useApp()
  const project = app.state.job!.history.present
  const { selected } = ed
  const one = selected.length === 1 ? selected[0] : null
  const autoLevels = ed.item?.edits.adjust.autoLevels ?? false
  const [copying, setCopying] = useState(false)
  return (
    <div className={compact ? 'markup-footer' : 'markup-toolbar markup-panel'}>
      {compact && selected.length === 0 && <span className="muted markup-hint">{hint}</span>}
      {selected.length > 0 && (
        <div className="markup-row">
          <span className="muted">{selected.length === 1 ? kindName(selected[0]) : `${selected.length} marks`}{selected.some((m) => m.locked) ? ' (locked)' : ''}</span>
          <button type="button" className="btn btn-small" title="Duplicate (Ctrl+D)" onClick={ed.actions.duplicate}>Duplicate</button>
          <button type="button" className="btn btn-small" title="Bring forward (]); Shift+] to the front" onClick={() => ed.actions.order('forward')}>Forward</button>
          <button type="button" className="btn btn-small" title="Send back ([); Shift+[ to the back" onClick={() => ed.actions.order('back')}>Back</button>
          <button type="button" className="btn btn-small" title="Lock or unlock: a locked mark can't be moved or deleted (Ctrl+L)" onClick={ed.actions.lock}>{selected.every((m) => m.locked) ? 'Unlock' : 'Lock'}</button>
          <button type="button" className="btn btn-small btn-danger" title="Delete (Del)" onClick={ed.actions.remove}>Delete</button>
        </div>
      )}
      {one?.kind === 'label' && <LabelText ed={ed} mark={one} project={project} />}
      {one?.kind === 'badge' && <BadgeText ed={ed} mark={one} />}

      <div className="markup-row">
        {compact && <span className="markup-spacer" />}
        {ed.allowRedaction && (
          <label className="check-inline" title="Stretch dim or flat field photos to full brightness and contrast (on screen and in the PDF)">
            <input type="checkbox" checked={autoLevels} onChange={(e) => app.edit(e.target.checked ? 'Auto brightness / contrast on' : 'Auto brightness / contrast off',
              (p) => setPictureEdits(p, ed.at, { adjust: { ...(ed.item?.edits.adjust ?? { autoLevels: false, darken: 0 }), autoLevels: e.target.checked } }))} />
            Auto brightness / contrast
          </label>
          )}
        {autoLevels && ed.allowRedaction && (
          <button type="button" className={`btn btn-small${original ? ' on' : ''}`} title="Hold to see the picture before the adjustment"
            onPointerDown={() => setOriginal(true)} onPointerUp={() => setOriginal(false)} onPointerLeave={() => setOriginal(false)}
            onKeyDown={(e) => e.key === ' ' && setOriginal(true)} onKeyUp={() => setOriginal(false)}>
            Hold: before
          </button>
        )}
        <button type="button" className="btn btn-small" disabled={ed.stored.length === 0} title="Copy these marks (or the selected ones) to other pictures" onClick={() => setCopying(true)}>Copy markup to…</button>
        {!compact && <span className="markup-spacer" />}
        {!compact && <UndoRedo />}
        {extra}
      </div>
      {copying && <CopyMarkupDialog ed={ed} onClose={() => setCopying(false)} />}
    </div>
  )
}

function kindName(m: Mark): string {
  switch (m.kind) {
    case 'rect': return 'Box'
    case 'ellipse': return 'Ellipse'
    case 'highlight': return m.straight ? 'Straight highlight' : 'Highlight'
    case 'pen': return 'Pen stroke'
    case 'line': return 'Line'
    case 'arrow': return 'Arrow'
    case 'label': return m.link && m.template ? 'Live data label' : 'Label'
    case 'badge': return `Badge ${m.n}`
    case 'redaction': return m.mode === 'black' ? 'Redaction (black)' : 'Redaction (blurred)'
  }
}

/** "Save style": name it, then it is kept in this computer's saved lists. */
function SaveStyle({ mark, onSave }: { mark: Mark; onSave: (s: LabelStyle) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  if (!open) return <button type="button" className="btn btn-small" title="Keep this label's look as a style on this computer" onClick={() => setOpen(true)}>Save style…</button>
  const save = () => {
    const s = labelStyleOf(mark, name.trim())
    if (s && name.trim()) onSave(s)
    setOpen(false)
    setName('')
  }
  return (
    <span className="markup-group">
      <input type="text" value={name} placeholder="Style name" aria-label="Style name" autoFocus onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') {
            e.stopPropagation()
            setOpen(false)
          }
        }} />
      <button type="button" className="btn btn-small" disabled={!name.trim()} onClick={save}>Save</button>
    </span>
  )
}

/** A text box that stores its value when you leave it (or Ctrl+Enter): one undo step per edit. Esc puts it back. */
function useTextDraft(value: string, focus: number, onCommit: (v: string) => void) {
  const [draft, setDraft] = useState(value)
  const [base, setBase] = useState(value)
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  // The stored value changed (undo, another mark selected): the box shows it.
  if (base !== value) {
    setBase(value)
    setDraft(value)
  }
  useEffect(() => {
    if (focus > 0) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [focus])
  return {
    ref, value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: () => draft !== value && onCommit(draft),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.target as HTMLElement).blur()
      if (e.key === 'Escape') {
        e.stopPropagation()
        setDraft(value)
        setTimeout(() => ref.current?.blur())
      }
    },
  }
}

const linkValue = (l: Mark['link']) => (l ? `${l.list}|${l.occurrence}|${l.id}` : '')

/** A label's text, or its live data link and template. */
function LabelText({ ed, mark, project }: { ed: MarkupEditorState; mark: Extract<Mark, { kind: 'label' }>; project: import('../../../data/schema.ts').Project }) {
  const live = mark.link !== null && mark.template.trim() !== ''
  const text = useTextDraft(mark.text, live ? 0 : ed.textFocus, (v) => ed.actions.change('Edit label text', (ms) => setFields(ms, new Set([mark.id]), (m) => (m.kind === 'label' ? { ...m, text: v } : m))))
  const template = useTextDraft(mark.template, live ? ed.textFocus : 0, (v) => ed.actions.change('Edit live label', (ms) => setFields(ms, new Set([mark.id]), (m) => {
    if (m.kind !== 'label') return m
    const next = { ...m, template: v }
    return { ...next, text: liveText(project, next) ?? m.text }
  })))
  const setLink = (v: string) => ed.actions.change(v ? 'Link the label' : 'Unlink the label', (ms) => setFields(ms, new Set([mark.id]), (m) => {
    if (m.kind !== 'label') return m
    if (!v) return { ...m, link: null, template: '' }
    const [list, occ, ...rest] = v.split('|')
    const link = { list: list as 'scans' | 'shellMut' | 'headMut', occurrence: Number(occ), id: rest.join('|') }
    const next = { ...m, link, template: m.template.trim() || defaultTemplate(link.list) }
    return { ...next, text: liveText(project, next) ?? m.text }
  }))
  const occ = (rows: readonly { id: string }[], i: number) => rows.slice(0, i).filter((r) => r.id.trim().toLowerCase() === rows[i].id.trim().toLowerCase()).length
  const fields = mark.link ? LIVE_FIELDS[mark.link.list === 'scans' ? 'scans' : 'mut'] : []
  const insert = (key: string) => {
    const el = template.ref.current
    const v = template.value
    const at = el?.selectionStart ?? v.length
    const next = `${v.slice(0, at)}{${key}}${v.slice(el?.selectionEnd ?? at)}`
    template.onChange({ target: { value: next } })
    setTimeout(() => el?.focus())
  }
  return (
    <div className="markup-row markup-text">
      <label className="markup-group">
        <span className="muted">Live data</span>
        <select value={linkValue(mark.link)} onChange={(e) => setLink(e.target.value)} title="Fill the label from a scan or MUT row; it follows renames and new results">
          <option value="">None (typed text)</option>
          <optgroup label="Scans">
            {project.scans.map((s, i) => <option key={`s${i}`} value={`scans|${occ(project.scans, i)}|${s.id}`}>{s.id}</option>)}
          </optgroup>
          <optgroup label="Shell MUT">
            {project.shellMut.map((s, i) => <option key={`m${i}`} value={`shellMut|${occ(project.shellMut, i)}|${s.id}`}>{s.id}</option>)}
          </optgroup>
          <optgroup label="Head MUT">
            {project.headMut.map((s, i) => <option key={`h${i}`} value={`headMut|${occ(project.headMut, i)}|${s.id}`}>{s.id}</option>)}
          </optgroup>
        </select>
      </label>
      {live || mark.link ? (
        <>
          <label className="markup-group markup-grow">
            <span className="muted">Template</span>
            <input type="text" {...template} aria-label="Live label template" />
          </label>
          <span className="markup-group" role="group" aria-label="Fields">
            {fields.map((f) => <button key={f.key} type="button" className="btn btn-small" title={f.name} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(f.key)}>{`{${f.key}}`}</button>)}
          </span>
          <span className="muted markup-grow">Prints: {mark.text || '(blank)'}</span>
        </>
      ) : (
        <label className="markup-group markup-grow">
          <span className="muted">Text</span>
          <textarea rows={2} {...text} aria-label="Label text" placeholder="Label text (Ctrl+Enter to finish)" />
        </label>
      )}
    </div>
  )
}

/** A badge's key text (printed under the picture). */
function BadgeText({ ed, mark }: { ed: MarkupEditorState; mark: Extract<Mark, { kind: 'badge' }> }) {
  const text = useTextDraft(mark.text, ed.textFocus, (v) => ed.actions.change('Edit badge key', (ms) => setFields(ms, new Set([mark.id]), (m) => (m.kind === 'badge' ? { ...m, text: v } : m))))
  return (
    <div className="markup-row markup-text">
      <label className="markup-group markup-grow">
        <span className="muted">Key for badge {mark.n}</span>
        <input type="text" {...text} aria-label={`Key text for badge ${mark.n}`} placeholder="Printed under the picture, e.g. Pitting at 6 o'clock" />
      </label>
    </div>
  )
}

/** Copy markup to other pictures: tick them; one undo step. */
function CopyMarkupDialog({ ed, onClose }: { ed: MarkupEditorState; onClose: () => void }) {
  const app = useApp()
  const report = app.state.job!.history.present.report!
  const targets = copyTargets(report, ed.at)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [onlySel, setOnlySel] = useState(ed.selected.length > 0)
  const n = onlySel ? ed.selected.length : ed.stored.length
  const copy = () => {
    const at = targets.filter((_, i) => picked.has(i)).map((t) => t.at)
    app.edit(`Copy markup to ${at.length} picture${at.length === 1 ? '' : 's'}`, (p) => copyMarkupTo(p, ed.at, onlySel ? ed.selection : null, at))
    ed.setStatus(`${n} mark${n === 1 ? '' : 's'} copied to ${at.length} picture${at.length === 1 ? '' : 's'}.`)
    onClose()
  }
  return (
    <div className="markup-popover" role="dialog" aria-label="Copy markup to other pictures" onKeyDown={(e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }}>
      <h3>Copy markup to other pictures</h3>
      {ed.selected.length > 0 && (
        <label className="check-inline">
          <input type="checkbox" checked={onlySel} onChange={(e) => setOnlySel(e.target.checked)} />
          Only the {ed.selected.length} selected mark{ed.selected.length === 1 ? '' : 's'}
        </label>
      )}
      {targets.length === 0 ? <p className="muted">There are no other pictures in the report yet.</p> : (
        <ul className="markup-targets">
          {targets.map((t, i) => (
            <li key={i}>
              <label className="check-inline">
                <input type="checkbox" checked={picked.has(i)} onChange={(e) => {
                  const next = new Set(picked)
                  if (e.target.checked) next.add(i)
                  else next.delete(i)
                  setPicked(next)
                }} />
                {pictureName(report, t.at, t.file)}
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">Marks keep their place on the picture (0-1 of its width and height); badges are numbered after the picture's own.</p>
      <div className="dialog-buttons">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={picked.size === 0 || n === 0} onClick={copy}>Copy {n} mark{n === 1 ? '' : 's'}</button>
      </div>
    </div>
  )
}
