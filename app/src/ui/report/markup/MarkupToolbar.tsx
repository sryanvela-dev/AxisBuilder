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
  applyPrefToMark, COLOR_PRESETS, copyTargets, HIGHLIGHT_WIDTHS, prefsOfMark, SHAPE_MODES, TEXT_SIZES, TOOLS, WIDTH_PRESETS, type ToolId, type ToolPrefs,
} from '../../../report/markTools.ts'
import { setPictureEdits } from '../../../report/pagesEdits.ts'
import { addRecord, type SavedRecord } from '../../../report/savedLists.ts'
import type { Mark } from '../../../report/schema.ts'
import { useApp } from '../../appContext.ts'
import { useReport } from '../reportContext.ts'
import type { MarkupEditorState } from './useMarkupEditor.ts'

const SHAPE_NAMES = { outline: 'Outline', filled: 'Filled', highlighted: 'Highlighted', highlightedPlain: 'Highlighted, no outline' } as const
const SHAPE_TIPS = { outline: 'Edge only', filled: 'Solid fill', highlighted: 'See-through fill with a solid edge', highlightedPlain: 'See-through fill, no edge' } as const
const CALLOUTS = [['rounded', 'Rounded box'], ['square', 'Square box'], ['pill', 'Pill'], ['plain', 'No box (text only)']] as const
/** A filled label box: solid, or see-through (the picture shows through). */
const SOLID = 0.9
const SEE_THROUGH = 0.6
const LEADER_ENDS = [['arrow', 'Leader: arrow'], ['dot', 'Leader: dot'], ['none', 'Leader: no end']] as const
const HEADS = [['closed', 'Closed'], ['open', 'Open'], ['dot', 'Dot'], ['none', 'None']] as const

/** Which settings a tool or a mark kind shows. */
function settingsFor(kinds: ReadonlySet<string>) {
  const has = (...k: string[]) => k.some((x) => kinds.has(x))
  return {
    color: has('rect', 'ellipse', 'highlight', 'highlightLine', 'pen', 'line', 'arrow', 'label', 'badge'),
    width: has('rect', 'ellipse', 'pen', 'line', 'arrow', 'label'),
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
  /** Both rows, or only the tools as a vertical rail / only the settings row (the full-screen window). */
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

  // With one mark selected the settings show its own look; otherwise what the next mark gets.
  const shown = one ? prefsOfMark(one, prefs) : prefs
  const swatches = (value: string, onPick: (c: string) => void, what: string) => (
    <span className="markup-swatches">
      {COLOR_PRESETS.map((c) => (
        <button key={c.color} type="button" className={`markup-swatch${value === c.color ? ' on' : ''}`} style={{ background: c.color }}
          title={c.name} aria-label={`${what}: ${c.name}`} aria-pressed={value === c.color} onClick={() => onPick(c.color)} />
      ))}
      <input type="color" value={value || '#1a1a1a'} title={`Another ${what.toLowerCase()}`} aria-label={`Another ${what.toLowerCase()}`} onChange={(e) => onPick(e.target.value)} />
    </span>
  )
  const tools = TOOLS.filter((t) => t.id !== 'redaction')
  const redaction = TOOLS.find((t) => t.id === 'redaction')!
  return (
    <div className={part === 'tools' ? 'markup-toolbar markup-rail' : 'markup-toolbar'} role="toolbar" aria-label={part === 'settings' ? 'Tool settings' : 'Markup tools'}
      aria-orientation={part === 'tools' ? 'vertical' : undefined}>
      {part !== 'settings' && <div className="markup-tools">
        {tools.map((t) => (
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
        {/* Redact last (user, 2026-11-01); greyed out where there are no pixels to remove. */}
        {ed.allowRedaction ? (
          <button type="button" className={`markup-tool${tool === 'redaction' ? ' on' : ''}`} aria-pressed={tool === 'redaction'} title={`${redaction.hint} (${redaction.key})`} onClick={() => ed.setTool('redaction')}>
            <span className="markup-icon" aria-hidden="true">{redaction.icon}</span>
            <span>{redaction.label}</span>
          </button>
        ) : (
          <button type="button" className="markup-tool" disabled aria-label="Redact (pictures only)"
            title="Redaction is for pictures only: a PDF page or a drawing is copied into the report as vectors, so there are no pixels to remove">
            <span className="markup-icon" aria-hidden="true">{redaction.icon}</span>
            <span>Redact</span>
          </button>
        )}
      </div>}

      {part !== 'tools' && <div className="markup-settings">
        {show.color && (
          <div className="markup-field" role="group" aria-label="Colour">
            <span className="markup-caption">Colour</span>
            {swatches(shown.color, (c) => pref({ color: c }, 'Change colour'), 'Colour')}
          </div>
        )}
        {show.width && (
          <div className="markup-field" role="group" aria-label="Line width">
            <span className="markup-caption">{show.label && !show.shape ? 'Leader and edge width' : 'Line width'}</span>
            <select value={WIDTH_PRESETS.some((w) => w.w === shown.width) ? shown.width : ''} aria-label={show.label && !show.shape ? 'Leader and edge width' : 'Line width'}
              title={show.label && !show.shape ? "Width of the leader and of a clear box's edge, at print size" : 'Line width at print size'} onChange={(e) => pref({ width: Number(e.target.value) }, 'Change line width')}>
              {!WIDTH_PRESETS.some((w) => w.w === shown.width) && <option value="">{shown.width} pt</option>}
              {WIDTH_PRESETS.map((w) => <option key={w.w} value={w.w}>{w.name} {show.label && !show.shape ? 'leader' : 'line'}</option>)}
            </select>
          </div>
        )}
        {show.shape && (
          <div className="markup-field" role="group" aria-label="Box style">
            <span className="markup-caption">Box style</span>
            <span className="markup-buttons">
              {SHAPE_MODES.map((s) => (
                <button key={s} type="button" className={`btn btn-small${shown.shape === s ? ' on' : ''}`} aria-pressed={shown.shape === s}
                  title={SHAPE_TIPS[s]} onClick={() => pref({ shape: s }, 'Change box style')}>{SHAPE_NAMES[s]}</button>
              ))}
            </span>
          </div>
        )}
        {show.highlight && (
          <div className="markup-field" role="group" aria-label="Highlighter width">
            <span className="markup-caption">Highlighter width</span>
            <span className="markup-buttons">
              {HIGHLIGHT_WIDTHS.map((w) => (
                <button key={w.w} type="button" className={`btn btn-small${shown.hlWidth === w.w ? ' on' : ''}`} aria-pressed={shown.hlWidth === w.w} title={`${w.name} (${w.w} pt)`} onClick={() => pref({ hlWidth: w.w }, 'Change highlighter width')}>{w.name}</button>
              ))}
            </span>
            <input type="range" min={2} max={48} step={1} value={shown.hlWidth} aria-label="Highlighter width in points" title={`${shown.hlWidth} pt`}
              onChange={(e) => ed.setPrefs({ hlWidth: Number(e.target.value) })} onPointerUp={(e) => pref({ hlWidth: Number((e.target as HTMLInputElement).value) }, 'Change highlighter width')} />
            <select value={shown.hlEnds} aria-label="Highlighter ends" title="Flat (marker) or round ends" onChange={(e) => pref({ hlEnds: e.target.value as ToolPrefs['hlEnds'] }, 'Change highlighter ends')}>
              <option value="flat">Flat ends</option>
              <option value="round">Round ends</option>
            </select>
          </div>
        )}
        {show.head && (
          <label className="markup-field">
            <span className="markup-caption">Arrow head</span>
            <select value={shown.head} onChange={(e) => pref({ head: e.target.value as ToolPrefs['head'] }, 'Change arrow head')}>
              {HEADS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </label>
        )}
        {show.text && (
          <div className="markup-field" role="group" aria-label="Text">
            <span className="markup-caption">Text</span>
            <span className="markup-buttons">
              <select value={shown.textSize} aria-label="Text size in points at print size" title="Text size in points, as printed" onChange={(e) => pref({ textSize: Number(e.target.value) }, 'Change text size')}>
                {TEXT_SIZES.map((s) => <option key={s} value={s}>{s} pt</option>)}
              </select>
              {show.label && <button type="button" className={`btn btn-small${shown.bold ? ' on' : ''}`} aria-pressed={shown.bold} title="Bold" aria-label="Bold" onClick={() => pref({ bold: !shown.bold }, 'Change bold')}><b>B</b></button>}
            </span>
            {show.label && (
              <select value={shown.font} aria-label="Font" onChange={(e) => pref({ font: e.target.value as ToolPrefs['font'] }, 'Change font')}>
                <option value="roboto">Roboto</option>
                <option value="montserrat">Montserrat</option>
              </select>
            )}
            <span className="markup-swatches" role="group" aria-label="Text colour">
              <button type="button" className={`btn btn-small${shown.textColor === '' ? ' on' : ''}`} aria-pressed={shown.textColor === ''}
                title="Text colour: automatic (stands out on the box, or the label's colour without one)" onClick={() => pref({ textColor: '' }, 'Change text colour')}>Auto text</button>
              <input type="color" value={shown.textColor || '#1a1a1a'} title="Pick the text colour" aria-label="Text colour" onChange={(e) => pref({ textColor: e.target.value }, 'Change text colour')} />
            </span>
          </div>
        )}
        {show.label && (
          <div className="markup-field" role="group" aria-label="Label box">
            <span className="markup-caption">Box</span>
            <select value={shown.callout} aria-label="Box shape" onChange={(e) => pref({ callout: e.target.value as ToolPrefs['callout'] }, 'Change callout')}>
              {CALLOUTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
            {shown.callout !== 'plain' && (
              <select value={shown.labelBox === 'clear' ? 'clear' : shown.bgOpacity < 0.8 ? 'see' : 'filled'} aria-label="Box fill"
                title="Filled with the label's colour, see-through, or clear (only the edge)"
                onChange={(e) => pref(e.target.value === 'clear' ? { labelBox: 'clear' } : { labelBox: 'filled', bgOpacity: e.target.value === 'see' ? SEE_THROUGH : SOLID }, 'Change label box')}>
                <option value="filled">Filled</option>
                <option value="see">Filled, see-through</option>
                <option value="clear">Clear, outline only</option>
              </select>
            )}
            <label className="markup-inline">
              <select value={shown.leaderEnd} aria-label="Leader end" title="End of the leader (drag from the target to place a label with a leader)" onChange={(e) => pref({ leaderEnd: e.target.value as ToolPrefs['leaderEnd'] }, 'Change leader end')}>
                {LEADER_ENDS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </label>
          </div>
        )}
        {show.text && (
          <label className="markup-field check-inline" title="A thin contrasting outline round the box, the leader and its end (a halo on plain text), so it reads on any photo">
            <input type="checkbox" checked={shown.halo} onChange={(e) => pref({ halo: e.target.checked }, 'Change outline')} />
            Outline
          </label>
        )}
        {show.redact && (
          <div className="markup-field" role="group" aria-label="Redaction">
            <span className="markup-caption">Redaction</span>
            <span className="markup-buttons">
              {(['black', 'blur'] as const).map((r) => (
                <button key={r} type="button" className={`btn btn-small${shown.redact === r ? ' on' : ''}`} aria-pressed={shown.redact === r} onClick={() => pref({ redact: r }, 'Change redaction')}>
                  {r === 'black' ? 'Black box' : 'Blurred'}
                </button>
              ))}
            </span>
            <span className="muted">The PDF holds the picture with these pixels removed.</span>
          </div>
        )}
        {(show.text || tool === 'label' || tool === 'badge') && (
          <div className="markup-field" role="group" aria-label="Label styles">
            <span className="markup-caption">Saved styles</span>
            <select value="" aria-label="Label styles" title="Apply a label style (to the selected labels, or to the next one you place)" onChange={(e) => pickStyle(e.target.value)}>
              <option value="">{ed.newStyle && !selected.length ? `Next label: ${ed.newStyle.name}` : 'Styles…'}</option>
              {styles.map((s) => <option key={`${s.name}-${s.kind}`} value={s.name}>{s.name}{s.kind === 'badge' ? ' (badge)' : ''}</option>)}
            </select>
            {one && (one.kind === 'label' || one.kind === 'badge') && <SaveStyle mark={one} onSave={(s) => changeLists((l) => addRecord(l, 'labelStyles', s))} />}
          </div>
        )}
      </div>}
    </div>
  )
}

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
 * The bottom line: the tool hint while nothing is selected, else the selected marks (what they are, duplicate / forward /
 * back / lock / delete as icons, a label's text or live link, a badge's key); then auto brightness / contrast, copy the
 * marks to other pictures and `extra` (name, print size, zoom).
 */
export function MarkupPanel({ ed, original, setOriginal, hint = '', extra }: {
  ed: MarkupEditorState
  original: boolean
  setOriginal: (on: boolean) => void
  hint?: string
  extra?: React.ReactNode
}) {
  const app = useApp()
  const project = app.state.job!.history.present
  const { selected } = ed
  const one = selected.length === 1 ? selected[0] : null
  const autoLevels = ed.item?.edits.adjust.autoLevels ?? false
  const [copying, setCopying] = useState(false)
  const locked = selected.length > 0 && selected.every((m) => m.locked)
  return (
    <div className="markup-footer">
      {selected.length === 0 && <span className="muted markup-hint">{hint}</span>}
      {selected.length > 0 && (
        <span className="markup-buttons">
          <span className="muted">{selected.length === 1 ? kindName(selected[0]) : `${selected.length} marks`}{selected.some((m) => m.locked) ? ' (locked)' : ''}</span>
          <button type="button" className="icon-btn" aria-label="Duplicate" title="Duplicate (Ctrl+D)" onClick={ed.actions.duplicate}>⧉</button>
          <button type="button" className="icon-btn" aria-label="Bring forward" title="Bring forward (]); Shift+] to the front" onClick={() => ed.actions.order('forward')}>↑</button>
          <button type="button" className="icon-btn" aria-label="Send back" title="Send back ([); Shift+[ to the back" onClick={() => ed.actions.order('back')}>↓</button>
          <button type="button" className="icon-btn" aria-label={locked ? 'Unlock' : 'Lock'} title="Lock or unlock: a locked mark can't be moved or deleted (Ctrl+L)" onClick={ed.actions.lock}>{locked ? '🔓' : '🔒'}</button>
          <button type="button" className="icon-btn icon-danger" aria-label="Delete" title="Delete (Del)" onClick={ed.actions.remove}>🗑</button>
        </span>
      )}
      {one?.kind === 'label' && <LabelText ed={ed} mark={one} project={project} />}
      {one?.kind === 'badge' && <BadgeText ed={ed} mark={one} />}
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
      <button type="button" className="btn btn-small" disabled={ed.stored.length === 0}
        title="Put copies of this picture's marks (or only the selected ones) on other pictures of the report, in the same places, e.g. the same arrow on every scan screenshot"
        onClick={() => setCopying(true)}>Copy marks to other pictures…</button>
      {extra}
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
  if (!open) return <button type="button" className="icon-btn" aria-label="Save this look as a style" title="Save this label's look as a style on this computer (it then shows in the styles list)" onClick={() => setOpen(true)}>💾</button>
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

/**
 * A mark's text box. Each keystroke is stored at once, so the label on the picture types out as you type; the whole
 * edit is one undo step (`onCommit` stores under a group, `onEnd` closes it when you leave the box). Enter finishes
 * (`onDone`), Esc puts back the text it had when you came in.
 */
function useTextDraft(value: string, focus: number, onCommit: (v: string) => void, onEnd: () => void, onDone?: () => void) {
  const [draft, setDraft] = useState(value)
  const [base, setBase] = useState(value)
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  const finished = useRef(false)
  /** The text when the box got the cursor (what Esc goes back to). */
  const before = useRef<string | null>(null)
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
    onChange: (e: { target: { value: string } }) => {
      setDraft(e.target.value)
      onCommit(e.target.value)
    },
    onFocus: () => {
      before.current = value
    },
    onBlur: () => {
      if (finished.current) finished.current = false
      else if (draft !== value) onCommit(draft)
      before.current = null
      onEnd()
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      // Enter finishes the text and lets go of the mark (Shift+Enter: a new line); the keys go back to the editor.
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        if (draft !== value) onCommit(draft)
        finished.current = true
        onEnd()
        ;((e.target as HTMLElement).closest('[tabindex="-1"]') as HTMLElement | null)?.focus({ preventScroll: true })
        onDone?.()
      }
      if (e.key === 'Escape') {
        e.stopPropagation()
        const back = before.current ?? value
        setDraft(back)
        if (back !== value) onCommit(back)
        const root = (e.target as HTMLElement).closest('[tabindex="-1"]') as HTMLElement | null
        setTimeout(() => (root ? root.focus({ preventScroll: true }) : ref.current?.blur()))
      }
    },
  }
}

const linkValue = (l: Mark['link']) => (l ? `${l.list}|${l.occurrence}|${l.id}` : '')

/** A label's text, or its live data link and template. */
function LabelText({ ed, mark, project }: { ed: MarkupEditorState; mark: Extract<Mark, { kind: 'label' }>; project: import('../../../data/schema.ts').Project }) {
  const live = mark.link !== null && mark.template.trim() !== ''
  const app = useApp()
  const end = () => app.dispatch({ type: 'endEditGroup' })
  const group = `markup-text:${JSON.stringify(ed.at)}:${mark.id}`
  const text = useTextDraft(mark.text, live ? 0 : ed.textFocus, (v) => ed.actions.change('Edit label text', (ms) => setFields(ms, new Set([mark.id]), (m) => (m.kind === 'label' ? { ...m, text: v } : m)), group), end, () => ed.setSel(new Set()))
  const template = useTextDraft(mark.template, live ? ed.textFocus : 0, (v) => ed.actions.change('Edit live label', (ms) => setFields(ms, new Set([mark.id]), (m) => {
    if (m.kind !== 'label') return m
    const next = { ...m, template: v }
    return { ...next, text: liveText(project, next) ?? m.text }
  }), group), end, () => ed.setSel(new Set()))
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
          <textarea rows={2} {...text} aria-label="Label text" placeholder="Label text (Enter to finish, Shift+Enter for a new line)" />
        </label>
      )}
    </div>
  )
}

/** A badge's key text (printed under the picture). */
function BadgeText({ ed, mark }: { ed: MarkupEditorState; mark: Extract<Mark, { kind: 'badge' }> }) {
  const app = useApp()
  const text = useTextDraft(mark.text, ed.textFocus, (v) => ed.actions.change('Edit badge key', (ms) => setFields(ms, new Set([mark.id]), (m) => (m.kind === 'badge' ? { ...m, text: v } : m)), `markup-text:${JSON.stringify(ed.at)}:${mark.id}`),
    () => app.dispatch({ type: 'endEditGroup' }), () => ed.setSel(new Set()))
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
