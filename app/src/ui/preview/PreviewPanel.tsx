// The drawing preview beside the step forms: the drawing as CAD will draw it (orientation, layers,
// photos), updated as you edit. Click an item to go to its row; the selected row's item is highlighted;
// items with errors or warnings are marked in the check colors. Collapsible, with a full-size view.

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { LAYER_GROUPS, PREVIEW_DIFFERENCES, buildDrawing, type DrawingItem, type ItemSource, type LayerGroup } from '../../engine/drawing.ts'
import { STEP_OF_LIST } from '../../state/steps.ts'
import { useApp } from '../appContext.ts'
import { useJobChecks } from '../checksContext.ts'
import { useJobFolders } from '../foldersContext.ts'
import { jumpTo } from '../placeIds.ts'
import { itemKey, useSelection } from '../selectionContext.ts'
import { DrawingView, type DrawingViewHandle, type Highlight } from './DrawingView.tsx'
import { buildRenderModel } from './renderModel.ts'
import { SheetsView } from './SheetsView.tsx'
import { PreviewSplitter } from './PreviewSplitter.tsx'
import { activeSectionPlan, sectionPlanItems } from '../../engine/sections.ts'
import { usePhotoThumbs } from './usePhotoThumbs.ts'
import { setPreviewPrefs, usePreviewPrefs, type PreviewPrefs } from './previewPrefs.ts'
import { useMoveLabels } from './MoveLabels.tsx'
import { useMutAreas } from './MutAreas.tsx'
import { hasMutAreas } from '../../engine/mutAreas.ts'
import { useAreaTool } from '../areaToolContext.ts'

export function PreviewPanel() {
  const app = useApp()
  const job = app.state.job!
  const { checks } = useJobChecks()
  const { photos } = useJobFolders()
  const { selected, select } = useSelection()
  const prefs = usePreviewPrefs()
  const [full, setFull] = useState(false)
  /** Back from full size: the step page shows from its top. */
  const closeFull = () => {
    setFull(false)
    document.querySelector('main.page')?.scrollTo(0, 0)
    window.scrollTo(0, 0)
  }
  // Full size fills the window; Escape closes it.
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.dialog-backdrop')) closeFull()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])
  const view = useRef<DrawingViewHandle>(null)
  // Typing stays smooth on big jobs: the drawing catches up right after the keystroke.
  const project = useDeferredValue(job.history.present)
  // The section sheet plan is drawn only while section sheets are on (engine/sections.ts).
  const plan = useMemo(() => activeSectionPlan(project), [project])
  const drawing = useMemo(() => buildDrawing(project), [project])
  // The photo folder can't be opened, or none is chosen and the last one used is offered. (One that only waits for the browser's
  // OK is in the Restore files bar under the top bar.)
  const photosAsk = (photos.status === 'lost' || (photos.status === 'suggest' && job.source !== 'sample')) && project.settings.generateOverlayDrawing
    && project.scanImages.some((l) => l.imageFile)
  const model = useMemo(() => {
    const d = drawing
    return buildRenderModel(plan ? { ...d, items: [...d.items, ...sectionPlanItems(project, plan)] } : d)
  }, [project, plan, drawing])
  // Drawing mode: move labels and leader ends (MoveLabels.tsx), or draw and edit MUT areas (MutAreas.tsx). A MUT row's
  // Draw area button switches the MUT areas tool on from the table, which brings the drawing back from the sheets.
  const { tool: mode, setTool: setMode } = useAreaTool()
  const [sheets, setSheets] = useState(false)
  const showSheets = sheets && mode !== 'areas' && project.vessel.length !== null && project.vessel.height !== null
  const move = useMoveLabels(mode === 'labels' && !showSheets && prefs.open, project, drawing)
  /** Selects a row, opens its step and puts the cursor in it. */
  const goTo = (src: ItemSource) => {
    select({ list: src.list, index: src.index })
    const target = job.step === 'images' && src.list === 'scans' ? 'images' : STEP_OF_LIST[src.list]
    if (job.step !== target) app.goToStep(target)
    setFull(false)
    // After the step page has rendered, put the cursor in the row.
    setTimeout(() => {
      if (target === 'images') jumpTo({ kind: 'photo', index: src.index, scanId: src.id })
      else jumpTo({ kind: 'row', list: src.list, index: src.index })
    }, 60)
  }
  // Clicking a MUT area with the tool on goes to its row too, as clicking any item does with no tool.
  const areas = useMutAreas(mode === 'areas' && !showSheets && prefs.open, project, (row, id) => goTo({ list: row.list, index: row.index, id }))
  const tool = move.tool ?? areas.tool
  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden])
  const thumbs = usePhotoThumbs(project, photos.photoFolder, prefs.open && !hidden.has('images'))

  const highlights = useMemo(() => {
    const out = new Map<string, Highlight>()
    for (const c of checks) {
      const key = c.place.kind === 'row' ? `${c.place.list}:${c.place.index}` : c.place.kind === 'photo' ? `scans:${c.place.index}` : null
      if (!key) continue
      if (c.severity === 'error' || !out.has(key)) out.set(key, c.severity)
    }
    return out
  }, [checks])

  const update = (p: PreviewPrefs) => {
    setPreviewPrefs(p)
  }
  const toggle = (g: LayerGroup) => update({ ...prefs, hidden: hidden.has(g) ? prefs.hidden.filter((x) => x !== g) : [...prefs.hidden, g] })

  function pick(item: DrawingItem) {
    goTo(item.source!)
  }


  if (!prefs.open) {
    return (
      <aside className="preview preview-closed" aria-label="Drawing preview">
        <button type="button" className="btn preview-open-btn" onClick={() => update({ ...prefs, open: true })} title="Show the drawing preview">
          Preview
        </button>
      </aside>
    )
  }

  const selectedKey = selected ? (job.step === 'images' && selected.list === 'scans' ? `image:${selected.index}` : itemKey(selected)) : null
  const vesselMissing = project.vessel.length === null || project.vessel.height === null
  return (
    <aside className={`preview${full ? ' preview-full' : ''}`} aria-label="Drawing preview">
      {!full && <PreviewSplitter />}
      <div className="preview-head">
        <strong>Drawing preview</strong>
        <span className="muted">{project.vessel.orientation}</span>
        <span className="button-row">
          <button type="button" className="icon-btn" onClick={() => view.current?.zoom(1.4)} aria-label="Zoom in" title="Zoom in (or use the mouse wheel)">
            +
          </button>
          <button type="button" className="icon-btn" onClick={() => view.current?.zoom(1 / 1.4)} aria-label="Zoom out" title="Zoom out">
            −
          </button>
          <button type="button" className="btn btn-small" onClick={() => view.current?.fit()} title="Show the whole drawing" disabled={showSheets}>
            Fit
          </button>
          <button type="button" className={`btn btn-small${move.tool ? ' btn-primary' : ''}`} onClick={() => setMode(mode === 'labels' ? null : 'labels')} aria-pressed={!!move.tool}
            disabled={showSheets} title="Move nozzle labels and their leader ends by dragging them">
            Move labels
          </button>
          <button type="button" className={`btn btn-small${areas.tool ? ' btn-primary' : ''}`} onClick={() => setMode(mode === 'areas' ? null : 'areas')} aria-pressed={!!areas.tool}
            disabled={showSheets} title="Draw MUT areas on the shell or the head views, and edit their corners">
            MUT areas
          </button>
          {(
            <button type="button" className={`btn btn-small${showSheets ? ' btn-primary' : ''}`} onClick={() => {
                // The sheets open full size, so they are big enough to read; closing full size keeps them.
                if (!showSheets) {
                  setFull(true)
                  setMode(null)
                }
                setSheets(!showSheets)
              }} aria-pressed={showSheets}
              title="Flip through the sheets as they will print (the PDF)">
              {showSheets ? 'Drawing' : 'Sheets'}
            </button>
          )}
          <button type="button" className="btn btn-small" onClick={() => (full ? closeFull() : setFull(true))}>
            {full ? 'Close full size' : 'Full size'}
          </button>
          {!full && (
            <button type="button" className="btn btn-small" onClick={() => update({ ...prefs, open: false })} title="Hide the preview">
              Hide
            </button>
          )}
        </span>
      </div>
      <div className="layer-toggles" role="group" aria-label="Layers">
        {LAYER_GROUPS.filter((g) => (g.id !== 'sections' || plan) && (g.id !== 'mut' || hasMutAreas(project))).map((g) => (
          <label key={g.id} className={`layer-chip${hidden.has(g.id) ? ' off' : ''}`}>
            <input type="checkbox" checked={!hidden.has(g.id)} onChange={() => toggle(g.id)} />
            {g.id === 'images' ? 'Photos' : g.name}
          </label>
        ))}
      </div>
      {photosAsk && (
        <p className="msg msg-warning preview-photo-folder">
          {photos.status === 'suggest' ? (
            <>
              No photo folder is chosen for this job.{' '}
              <button type="button" className="btn btn-small btn-primary" onClick={() => void photos.useSuggested()}>
                Use {photos.suggested?.name} (used last)
              </button>
            </>
          ) : (
            <>The photo folder {photos.name} can&apos;t be opened any more (moved, renamed or deleted?). Choose it again on the Images step.</>
          )}
        </p>
      )}
      {move.status}
      {areas.status}
      <div className={`preview-canvas${showSheets ? ' sheets' : project.settings.drawingColors === 'Softer for screens' ? '' : ' exact-colors'}`}>
        {showSheets ? (
          <SheetsView drawing={drawing} plan={plan} project={project} hidden={hidden} thumbs={thumbs} />
        ) : (
        <DrawingView
          ref={view}
          model={model}
          hidden={hidden}
          highlights={highlights}
          selectedKey={selectedKey}
          thumbs={thumbs}
          onPick={pick}
          fitKey={`${job.id}|${project.vessel.orientation}|${vesselMissing}`}
          tool={tool}
        />
        )}
        {move.menu}
        {areas.menu}
        {vesselMissing && <p className="preview-note">Enter the shell length and circumference to see the whole drawing.</p>}
      </div>
      <details className="preview-diff" hidden={showSheets}>
        <summary className="muted">
          {tool
            ? 'Drag empty space, middle-drag or Space+drag to move the view, wheel to zoom. Where it can differ from CAD'
            : 'Drag to move, wheel to zoom, click an item to go to its row. Where it can differ from CAD'}
        </summary>
        <ul className="paste-list">
          {PREVIEW_DIFFERENCES.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>
    </aside>
  )
}
