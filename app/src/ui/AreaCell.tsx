// The "Area" column of the shell and head MUT tables (Phase 5c): the area's size (or that the row has none) and the
// buttons that draw it in the preview (Draw area, Pick inside) or delete it (the row stays).

import { deleteArea } from '../data/mutAreaEdits.ts'
import type { HeadMut, ShellMut } from '../data/schema.ts'
import { drawableArea, formatAreaSize, mutAreaSize, targetOf, type MutList } from '../engine/mutAreas.ts'
import { useApp } from './appContext.ts'
import { useAreaTool } from './areaToolContext.ts'
import { startArea } from './preview/MutAreas.tsx'
import { useSelection } from './selectionContext.ts'

export function AreaCell({ list, index, item }: { list: MutList; index: number; item: ShellMut | HeadMut }) {
  const app = useApp()
  const api = useAreaTool()
  const { select } = useSelection()
  const project = app.state.job!.history.present
  const size = mutAreaSize(project, list, item)
  const row = { list, index }
  const go = (mode: 'draw' | 'pick') => startArea(api, select, mode, row, targetOf(list, item))
  return (
    <span className="area-cell">
      {size ? (
        <span title={list === 'headMut' ? 'Measured on a flat circle of the shell diameter; a dished head is a little larger.' : undefined}>
          {size.approx ? 'about ' : ''}
          {formatAreaSize(size.sqIn)}
        </span>
      ) : item.area ? (
        <span className="moved-chip" title="Fewer than 3 corners: draw it again">Not drawn</span>
      ) : (
        <span className="muted">No area</span>
      )}
      <button type="button" className="btn btn-small" onClick={() => go('draw')} title="Click its corners in the drawing preview">
        {drawableArea(item) ? 'Draw again' : 'Draw area'}
      </button>
      <button type="button" className="btn btn-small" onClick={() => go('pick')} title="Click inside a closed space in the drawing preview">
        Pick inside
      </button>
      {item.area && (
        <button type="button" className="icon-btn" aria-label={`Delete the area of ${item.id}`} title="Delete the area (the row stays; Ctrl+Z brings it back)"
          onClick={() => app.edit(`Delete the MUT area of ${item.id}`, (p) => deleteArea(p, list, index))}>
          ✕
        </button>
      )}
    </span>
  )
}
