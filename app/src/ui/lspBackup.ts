// The Export step's closed "Backup: CAD drawing (.lsp)" section (the .lsp is frozen, 2026-10-31): which settings live in
// it, so "Find a setting" can open it before it highlights one.

import { groupFields } from '../data/settings.ts'

/** True when "Find a setting" is going to a setting shown inside the Backup section (the CAD program). */
export function opensLspBackup(target: { section: string; key: string }): boolean {
  return groupFields('lspBackup').some((f) => f.section === target.section && f.key === target.key)
}
