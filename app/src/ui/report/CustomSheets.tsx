// Custom sheets on the Photos and pages step (design 4.6, 6.10): add, remove and reorder sheets; each has a title, where
// it prints ("print after" a section, or in its own Custom Sheets section), a layout (1 large / 2 side by side / 2 + side
// panel / 4 grid) and blocks that fill the layout's slots in order: a picture with its caption, an AxisBuilder view (the
// main drawing, a section sheet, a head view or a part of the main drawing picked by dragging a box on it), C-scan
// boxes, text, a small table. The pages panel beside the step shows the result.

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { IMAGE_EXTENSIONS } from '../../data/imageMatch.ts'
import type { Project } from '../../data/schema.ts'
import { buildDrawing } from '../../engine/drawing.ts'
import { activeSectionPlan } from '../../engine/sections.ts'
import { mainSheet } from '../../engine/sheetModel.ts'
import type { ReportPage } from '../../report/pageModel.ts'
import {
  BLOCK_KINDS,
  BLOCK_NAMES,
  LAYOUT_SLOTS,
  addBlock,
  addCustomSheet,
  moveBlock,
  moveCustomSheet,
  newBlock,
  removeBlock,
  removeCustomSheet,
  setBlock,
  setCustomSheet,
  tableFromText,
  tableToText,
  type BlockKind,
} from '../../report/pagesEdits.ts'
import { SHEET_LAYOUTS, type Block, type CustomSheet } from '../../report/schema.ts'
import { templateOf } from '../../report/templates/registry.ts'
import { pickImageFile, rememberFile } from '../../state/files.ts'
import { useApp } from '../appContext.ts'
import { previewPrefs } from '../preview/previewPrefs.ts'
import { ReportBox, ReportSelect } from './boxes.tsx'
import { PageSvg } from './PageSvg.tsx'
import { placeOptions, placeValue } from './placeOptions.ts'
import { CropButton, PictureWindow } from './PictureWindow.tsx'
import { photoSlot } from './reportFiles.ts'
import { useReport } from './reportContext.ts'

const STEP = 'pages' as const
const isImage = (name: string) => (IMAGE_EXTENSIONS as readonly string[]).includes(name.split('.').pop()?.toLowerCase() ?? '')

const SLOT_NAMES: Record<CustomSheet['layout'], string[]> = {
  '1 large': ['The page'],
  '2 side by side': ['Left', 'Right'],
  '2 + side panel': ['Left', 'Middle', 'Side panel'],
  '4 grid': ['Top left', 'Top right', 'Bottom left', 'Bottom right'],
}

export function CustomSheets() {
  const app = useApp()
  const report = app.state.job!.history.present.report!
  const sheets = report.customSheets
  const add = () => app.edit('Add a custom sheet', (p) => addCustomSheet(p).project)
  return (
    <>
      {sheets.length === 0 ? (
        <p className="muted">No custom sheets. A sheet is a page of your own: pictures, drawing views, C-scan boxes, text or a small table.</p>
      ) : (
        sheets.map((s, i) => <SheetCard key={s.id} sheet={s} index={i} count={sheets.length} />)
      )}
      <button type="button" className="btn" onClick={add}>
        Add a custom sheet
      </button>
    </>
  )
}

function SheetCard({ sheet, index, count }: { sheet: CustomSheet; index: number; count: number }) {
  const app = useApp()
  const report = app.state.job!.history.present.report!
  const own = templateOf(report.templateId).sections.find((d) => d.pageType === 'custom')
  const slots = LAYOUT_SLOTS[sheet.layout]
  const name = `custom sheet "${sheet.title.trim() || 'Untitled'}"`
  const remove = async () => {
    if (sheet.blocks.length > 0) {
      const a = await app.ask({ title: 'Remove the sheet?', message: <p>{`The ${name} and its ${sheet.blocks.length} block${sheet.blocks.length === 1 ? '' : 's'} go (Undo brings them back).`}</p>,
        buttons: [{ id: 'keep', label: 'Keep it' }, { id: 'remove', label: 'Remove', primary: true }], cancelId: 'keep' })
      if (a !== 'remove') return
    }
    app.edit('Remove a custom sheet', (p) => removeCustomSheet(p, sheet.id))
  }
  return (
    <section className="sheet-card" id={`report-sheet-${sheet.id}`}>
      <div className="sheet-card-head">
        <div className="field-grid">
          <ReportBox label="Title" value={sheet.title} placeholder="e.g. Boot" set={(q, v: string) => setCustomSheet(q, sheet.id, { title: v })}
            boxKey={`report.sheet.${sheet.id}.title`} step={STEP} help="Printed in the page header and the contents." />
          <ReportSelect label="Prints" value={placeValue(sheet.after, own)} options={placeOptions(report, own)}
            set={(q, v: string) => setCustomSheet(q, sheet.id, { after: v })} boxKey={`report.sheet.${sheet.id}.after`} step={STEP} />
          <ReportSelect label="Layout" value={sheet.layout} options={SHEET_LAYOUTS.map((l) => ({ value: l, label: `${l} (${LAYOUT_SLOTS[l]} block${LAYOUT_SLOTS[l] === 1 ? '' : 's'})` }))}
            set={(q, v: string) => setCustomSheet(q, sheet.id, { layout: v as CustomSheet['layout'] })} boxKey={`report.sheet.${sheet.id}.layout`} step={STEP} />
        </div>
        <span className="button-row row-buttons">
          <button type="button" className="icon-btn" disabled={index === 0} onClick={() => app.edit('Move a custom sheet', (p) => moveCustomSheet(p, index, index - 1))} aria-label={`Move the ${name} up`} title="Move up">↑</button>
          <button type="button" className="icon-btn" disabled={index === count - 1} onClick={() => app.edit('Move a custom sheet', (p) => moveCustomSheet(p, index, index + 1))} aria-label={`Move the ${name} down`} title="Move down">↓</button>
          <button type="button" className="icon-btn icon-danger" onClick={() => void remove()} aria-label={`Remove the ${name}`} title="Remove the sheet">✕</button>
        </span>
      </div>
      <ol className="block-list">
        {sheet.blocks.map((b, i) => (
          <li key={i} className={i >= slots ? 'block-left-out' : undefined}>
            <BlockEditor sheet={sheet} index={i} block={b} slotName={i < slots ? SLOT_NAMES[sheet.layout][i] : 'Left out: the layout is full'} />
          </li>
        ))}
      </ol>
      <AddBlock sheet={sheet} />
    </section>
  )
}

/** Picks a picture: from the report photo folder, or a file (remembered for this job). Returns the file name. */
function usePicturePick() {
  const app = useApp()
  const { photos: folder, pages } = useReport()
  const jobId = app.state.job!.history.present.jobId
  const folderPictures = useMemo(() => (folder.files ?? []).filter(isImage), [folder.files])
  const chooseFile = async (): Promise<string | null> => {
    const h = await pickImageFile('axisbuilder-sheet-picture')
    if (!h) return null
    await rememberFile(app.browserStore, jobId, photoSlot(h.name), h).catch(() => {})
    pages.retry()
    return h.name
  }
  return { folderPictures, chooseFile, canChoose: typeof window !== 'undefined' && 'showOpenFilePicker' in window }
}

function AddBlock({ sheet }: { sheet: CustomSheet }) {
  const app = useApp()
  const pick = usePicturePick()
  const [kind, setKind] = useState<BlockKind | ''>('')
  const add = (b: Block) => {
    app.edit(`Add a block (${BLOCK_NAMES[b.kind]})`, (p) => addBlock(p, sheet.id, b))
    setKind('')
  }
  const choose = async (k: BlockKind) => {
    if (k !== 'image') return add(newBlock(k))
    if (pick.canChoose) {
      const f = await pick.chooseFile()
      if (f) add(newBlock('image', f))
      return
    }
    setKind('image')
  }
  return (
    <div className="button-row add-block">
      <span className="muted">Add:</span>
      {BLOCK_KINDS.map((k) => (
        <button key={k} type="button" className="btn btn-small" onClick={() => void choose(k)}>
          {BLOCK_NAMES[k]}{k === 'image' ? '…' : ''}
        </button>
      ))}
      {kind === 'image' && (
        <label className="check-inline">
          Picture from the report photo folder:
          <select value="" onChange={(e) => e.target.value && add(newBlock('image', e.target.value))}>
            <option value="">Choose...</option>
            {pick.folderPictures.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

function BlockEditor({ sheet, index, block, slotName }: { sheet: CustomSheet; index: number; block: Block; slotName: string }) {
  const app = useApp()
  const key = `report.sheet.${sheet.id}.${index}`
  const set = (change: Partial<Block>) => (q: Project) => setBlock(q, sheet.id, index, change)
  const label = `block ${index + 1} of the sheet "${sheet.title.trim() || 'Untitled'}"`
  return (
    <div className="block-editor">
      <div className="block-head">
        <strong>{index + 1}. {BLOCK_NAMES[block.kind]}</strong> <span className="muted">({slotName})</span>
        <span className="button-row row-buttons">
          <button type="button" className="icon-btn" disabled={index === 0} onClick={() => app.edit('Move a block', (p) => moveBlock(p, sheet.id, index, index - 1))} aria-label={`Move ${label} up`} title="Move up (an earlier slot)">↑</button>
          <button type="button" className="icon-btn" disabled={index === sheet.blocks.length - 1} onClick={() => app.edit('Move a block', (p) => moveBlock(p, sheet.id, index, index + 1))} aria-label={`Move ${label} down`} title="Move down (a later slot)">↓</button>
          <button type="button" className="icon-btn icon-danger" onClick={() => app.edit('Remove a block', (p) => removeBlock(p, sheet.id, index))} aria-label={`Remove ${label}`} title="Remove the block">✕</button>
        </span>
      </div>
      {block.kind === 'image' && <ImageBlock sheet={sheet} index={index} block={block} />}
      {block.kind === 'view' && <ViewBlock sheet={sheet} index={index} block={block} />}
      {block.kind === 'cscanBoxes' && (
        <div className="field-grid">
          <ReportSelect label="Scan" value={block.scanId ?? ''} options={[{ value: '', label: '(none: type the boxes)' }, ...app.state.job!.history.present.scans.map((s) => ({ value: s.id, label: s.id }))]}
            set={(q, v: string) => set({ scanId: v || null })(q)} boxKey={`${key}.scanId`} step={STEP} help="The scan's comment and statistics fill the boxes unless you type them." />
          <ReportBox label="Comment" multiline value={block.comment} set={(q, v: string) => set({ comment: v })(q)} boxKey={`${key}.comment`} step={STEP} placeholder="Blank = the scan's comment" />
          <ReportBox label="Statistics" multiline value={tableToText(block.stats.map((s) => [s.label, s.value]))}
            set={(q, v: string) => set({ stats: tableFromText(v).map((r) => ({ label: r[0] ?? '', value: r[1] ?? '' })) })(q)}
            boxKey={`${key}.stats`} step={STEP} help={'One per line: "Minimum | 0.716". Blank = the scan’s own.'} />
        </div>
      )}
      {block.kind === 'text' && (
        <div className="field-grid">
          <ReportBox label="Heading" value={block.title} set={(q, v: string) => set({ title: v })(q)} boxKey={`${key}.title`} step={STEP} />
          <ReportBox label="Text" multiline wide value={block.body} set={(q, v: string) => set({ body: v })(q)} boxKey={`${key}.body`} step={STEP} />
        </div>
      )}
      {block.kind === 'table' && (
        <div className="field-grid">
          <ReportBox label="Heading" value={block.title} set={(q, v: string) => set({ title: v })(q)} boxKey={`${key}.title`} step={STEP} />
          <ReportBox label="Rows" multiline wide value={tableToText(block.rows)} set={(q, v: string) => set({ rows: tableFromText(v) })(q)} boxKey={`${key}.rows`} step={STEP}
            help="One row per line, cells split by | (or paste cells from Excel). The first row is the header." />
        </div>
      )}
    </div>
  )
}

function ImageBlock({ sheet, index, block }: { sheet: CustomSheet; index: number; block: Extract<Block, { kind: 'image' }> }) {
  const app = useApp()
  const pick = usePicturePick()
  const { pages } = useReport()
  const pic = pages.pictures.get(`photos|${block.file}`)
  const change = (file: string) => app.edit('Change a picture', (p) => setBlock(p, sheet.id, index, { file }))
  return (
    <div className="field-grid">
      <div className="field">
        <span className="field-label">Picture</span>
        <span className="photo-cell">
          {pic ? <img className="photo-thumb" src={pic.thumb} alt="" /> : <span className="photo-thumb thumb-empty" title={pic === null ? 'Not found' : 'Reading...'} />}
          <span className="muted">{block.file}{pic === null ? ' (not found)' : ''}</span>
        </span>
        <span className="button-row">
          {pick.canChoose && (
            <button type="button" className="btn btn-small" onClick={() => void pick.chooseFile().then((f) => f && change(f))}>
              Choose file…
            </button>
          )}
          {pick.folderPictures.length > 0 && (
            <select aria-label="Picture from the report photo folder" value="" onChange={(e) => e.target.value && change(e.target.value)}>
              <option value="">From the photo folder...</option>
              {pick.folderPictures.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
          <CropButton at={{ kind: 'sheetImage', sheetId: sheet.id, block: index }} picture={{ source: 'photos', file: block.file }} name={block.file} />
        </span>
      </div>
      <ReportBox label="Caption" value={block.caption} set={(q, v: string) => setBlock(q, sheet.id, index, { caption: v })} boxKey={`report.sheet.${sheet.id}.${index}.caption`} step={STEP} />
    </div>
  )
}

function ViewBlock({ sheet, index, block }: { sheet: CustomSheet; index: number; block: Extract<Block, { kind: 'view' }> }) {
  const app = useApp()
  const p = app.state.job!.history.present
  const [picking, setPicking] = useState(false)
  const plan = useMemo(() => activeSectionPlan(p), [p])
  const mode = p.settings.headViewMode
  const options = [
    { value: 'main', label: 'Main drawing (the whole sheet)' },
    ...(mode === 'HEAD 1' || mode === 'BOTH' ? [{ value: 'head1', label: `Head 1 view (${p.settings.head1Label || 'HEAD 1'})` }] : []),
    ...(mode === 'HEAD 2' || mode === 'BOTH' ? [{ value: 'head2', label: `Head 2 view (${p.settings.head2Label || 'HEAD 2'})` }] : []),
    ...(plan?.sections ?? []).map((s) => ({ value: `section:${s.n}`, label: `Section sheet ${s.n}` })),
    { value: 'crop', label: 'A part of the main drawing…' },
  ]
  const value = typeof block.view === 'object' ? 'crop' : block.view
  if (typeof block.view === 'string' && !options.some((o) => o.value === block.view)) options.unshift({ value: block.view, label: `${block.view} (not in the drawing now)` })
  return (
    <div className="field-grid">
      <ReportSelect label="View" value={value} options={options} boxKey={`report.sheet.${sheet.id}.${index}.view`} step={STEP}
        set={(q, v: string) => (v === 'crop' ? q : setBlock(q, sheet.id, index, { view: v as 'main' }))} />
      {(value === 'crop' || picking) && (
        <div className="field">
          <span className="field-label">Part of the main drawing</span>
          <button type="button" className="btn btn-small" onClick={() => setPicking(true)}>
            {typeof block.view === 'object' ? 'Change the part…' : 'Pick the part…'}
          </button>
        </div>
      )}
      {value !== 'crop' && !picking && (
        <div className="field">
          <span className="field-label">Or</span>
          <button type="button" className="btn btn-small" onClick={() => setPicking(true)}>
            Pick a part of the main drawing…
          </button>
        </div>
      )}
      {picking && <ViewCropDialog current={typeof block.view === 'object' ? block.view.crop : null} onCancel={() => setPicking(false)} onOk={(crop) => {
        app.edit('Pick a part of the drawing', (q) => setBlock(q, sheet.id, index, { view: { crop } }))
        setPicking(false)
      }} />}
    </div>
  )
}

type PaperBox = { x0: number; y0: number; x1: number; y1: number }

/** The main sheet as it prints; drag a box on it to pick the part a custom sheet shows (paper inches, y up). */
function ViewCropDialog(props: { current: PaperBox | null; onOk: (b: PaperBox) => void; onCancel: () => void }) {
  const app = useApp()
  const p = app.state.job!.history.present
  const model = useMemo(() => mainSheet(p, buildDrawing(p), { hidden: new Set(previewPrefs().hidden) }), [p])
  const { w: W, h: H } = model.paper
  // The box in page inches, y down (as the SVG draws).
  const toDown = (b: PaperBox) => ({ x: Math.min(b.x0, b.x1), y: H - Math.max(b.y0, b.y1), w: Math.abs(b.x1 - b.x0), h: Math.abs(b.y1 - b.y0) })
  const [box, setBox] = useState(props.current ? toDown(props.current) : null)
  const svg = useRef<SVGSVGElement>(null)
  const start = useRef<[number, number] | null>(null)
  const page: ReportPage = useMemo(() => ({
    size: { w: W, h: H }, sectionId: 'custom', step: 'pages', label: 'Main drawing', footer: 'none',
    items: [{ t: 'sheet', model, region: { x: 0, y: 0, w: W, h: H }, box: { x: 0, y: 0, w: W, h: H } }],
  }), [model, W, H])
  const at = (e: ReactPointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect()
    const k = Math.min(r.width / W, r.height / H)
    const ox = (r.width - W * k) / 2
    const oy = (r.height - H * k) / 2
    return [Math.min(W, Math.max(0, (e.clientX - r.left - ox) / k)), Math.min(H, Math.max(0, (e.clientY - r.top - oy) / k))]
  }
  const ok = () => {
    if (!box || box.w < 0.2 || box.h < 0.2) return
    props.onOk({ x0: box.x, x1: box.x + box.w, y0: H - box.y - box.h, y1: H - box.y })
  }
  return (
    <PictureWindow title="Pick a part of the main drawing" onOk={ok} onCancel={props.onCancel}>
      <p className="muted">Drag a box around the part to show. It prints as large as the slot allows, its shape kept.</p>
      <div className="view-crop-stage">
        <PageSvg page={page} pictures={new Map()} sheetThumbs={new Map()} minW={0.01} svgRef={svg}
          onPointerDown={(e) => {
            ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
            start.current = at(e)
            setBox({ x: start.current[0], y: start.current[1], w: 0, h: 0 })
          }}
          onPointerMove={(e) => {
            if (!start.current) return
            const [x, y] = at(e)
            const [sx, sy] = start.current
            setBox({ x: Math.min(x, sx), y: Math.min(y, sy), w: Math.abs(x - sx), h: Math.abs(y - sy) })
          }}
          onPointerUp={() => {
            start.current = null
          }} />
        {box && box.w > 0 && (
          <svg className="view-crop-overlay" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <path className="crop-shade" fillRule="evenodd" d={`M0 0H${W}V${H}H0Z M${box.x} ${box.y}h${box.w}v${box.h}h${-box.w}Z`} />
            <rect className="crop-box" x={box.x} y={box.y} width={box.w} height={box.h} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>
      {box && (box.w < 0.2 || box.h < 0.2) && <p className="msg msg-warning">Drag a larger box (at least 0.2 in each way on the sheet).</p>}
    </PictureWindow>
  )
}
