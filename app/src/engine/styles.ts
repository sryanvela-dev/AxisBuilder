// Text sizes and layer colors from the Drawing step settings, as rules per CAD layer, plus the layers the
// app adds and the legend and title block scales. The preview and the .lsp use the same rules, so they show
// the same sizes and colors. Settings at their defaults give no size rule, color change or scale.

import type { Project } from '../data/schema.ts'
import { LINE_LAYERS, SETTINGS, TEXT_TYPES } from '../data/settings.ts'

export type TextSizeRule = { mode: 'SCALE'; value: number } | { mode: 'HEIGHT'; value: number; base: number | null }

type Settings = Project['settings']
const setting = (s: Settings, key: string) => (s as Record<string, unknown>)[key]
const defaultOf = (key: string) => (SETTINGS as Record<string, { default: unknown }>)[key].default

/** Size rules of the text layers that are not Automatic. */
export function textSizeRules(s: Settings): Map<string, TextSizeRule> {
  const out = new Map<string, TextSizeRule>()
  for (const t of TEXT_TYPES) {
    const mode = setting(s, `${t.key}Size`)
    if (mode === 'Scale') out.set(t.layer, { mode: 'SCALE', value: setting(s, `${t.key}Scale`) as number })
    else if (mode === 'Fixed height') out.set(t.layer, { mode: 'HEIGHT', value: setting(s, `${t.key}Height`) as number, base: t.base })
  }
  return out
}

/** The height a text on this layer gets (SL_TextHeight in the .lsp does the same). */
export function sizedHeight(rules: ReadonlyMap<string, TextSizeRule>, layer: string, h: number): number {
  const r = rules.get(layer)
  if (!r) return h
  if (r.mode === 'SCALE') return h * r.value
  return r.base === null ? r.value : h * (r.value / r.base)
}

/**
 * The layers the app's drawing sets up after SL_SetupLayers, in a fixed order: every layer the app adds
 * (with its color), then v5.0's layers whose color the settings change.
 */
export function appLayerSetup(s: Settings): [string, number][] {
  const all = [...LINE_LAYERS, ...TEXT_TYPES] as readonly { key: string; layer: string; appLayer?: boolean }[]
  const color = (key: string) => setting(s, `${key}Color`) as number
  return [
    ...all.filter((l) => l.appLayer).map((l): [string, number] => [l.layer, color(l.key)]),
    ...all.filter((l) => !l.appLayer && color(l.key) !== defaultOf(`${l.key}Color`)).map((l): [string, number] => [l.layer, color(l.key)]),
  ]
}

/**
 * How much bigger the legend and the title block are drawn: their main text's size over the automatic
 * one (legend lines 2 in, title block lines 1.8 in). The whole block scales, as TEXTRESIZE does in CAD,
 * and the right panel moves the head views and title block up to make room.
 */
export function panelScales(s: Settings): { legend: number; title: number } {
  const rules = textSizeRules(s)
  // Rounded as the .lsp writes them (LispNum), so the preview and CAD place everything the same.
  const r3 = (n: number) => Math.round(n * 1000) / 1000
  return { legend: r3(sizedHeight(rules, 'LEGEND_TEXT', 2) / 2), title: r3(sizedHeight(rules, 'TITLE_BLOCK_TEXT', 1.8) / 1.8) }
}
