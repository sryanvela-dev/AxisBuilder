// Text sizes and layer colors from the Drawing step settings, as rules per CAD layer. The preview and the
// .lsp use the same rules, so they show the same sizes and colors. Every setting at its default gives no
// rule at all, so the drawing is exactly what it always was.

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

/** Layer colors the settings change from the drawing's own (SL_SetupLayers) colors, in a fixed order. */
export function changedLayerColors(s: Settings): [string, number][] {
  const out: [string, number][] = []
  for (const l of LINE_LAYERS) {
    const v = setting(s, `${l.key}Color`) as number
    if (v !== defaultOf(`${l.key}Color`)) out.push([l.layer, v])
  }
  for (const t of TEXT_TYPES) {
    const v = setting(s, `${t.key}Color`) as number
    if (v !== defaultOf(`${t.key}Color`)) out.push([t.layer, v])
  }
  return out
}
