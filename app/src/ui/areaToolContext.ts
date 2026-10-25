// The drawing preview's tool (Move labels or MUT areas) and what the MUT areas tool is doing (Phase 5c). It lives in
// the job screen, so "Draw area" / "Pick inside" on a MUT row of the Field data table can open the preview on that
// row's area directly.

import { createContext, useContext } from 'react'
import type { AreaTarget, MutList } from '../engine/mutAreas.ts'

export type PreviewTool = 'labels' | 'areas' | null

export interface AreaRow {
  list: MutList
  index: number
}

export type AreaPhase =
  | { kind: 'idle' }
  /** row null = a new MUT row, made when the shape closes (on the shell, or on a head if the first corner is in one). */
  | { kind: 'draw'; row: AreaRow | null; target: AreaTarget | null; pts: [number, number][] }
  | { kind: 'pick'; row: AreaRow | null }

export interface AreaToolApi {
  tool: PreviewTool
  setTool: (t: PreviewTool) => void
  phase: AreaPhase
  setPhase: (ph: AreaPhase) => void
}

export const IDLE: AreaPhase = { kind: 'idle' }

export const AreaToolContext = createContext<AreaToolApi>({ tool: null, setTool: () => {}, phase: IDLE, setPhase: () => {} })

export function useAreaTool(): AreaToolApi {
  return useContext(AreaToolContext)
}
