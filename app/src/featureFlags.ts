// Switches for work that is built but not yet released to everyone. Each is decided when the app is built
// (vite.config.ts `define`), so a switched-off feature is not even reachable in the production build of `main`.
//
// REPORT_ENABLED (AUT report, report design section 10): on for `npm run dev`, for the tests and for Cloudflare Pages
// preview builds (any branch but `main`); off for the production build of `main`. `VITE_REPORT=1` / `0` overrides it.
// Every report screen, button and switch checks it; the report data in the project file is read and kept either way.

declare const __REPORT_ENABLED__: boolean | undefined

export interface FlagBuild {
  /** Vite's command: 'serve' (dev server) or 'build'. */
  command: 'serve' | 'build'
  /** Running under Vitest. */
  test: boolean
  /** CF_PAGES_BRANCH: set by Cloudflare Pages to the branch being built. */
  pagesBranch?: string
  /** VITE_REPORT: '1' / '0' (also 'true' / 'false', 'on' / 'off') turns the report on or off whatever the rest says. */
  override?: string
}

/** Whether the report is on in a build (see the file comment). */
export function reportEnabledFor(b: FlagBuild): boolean {
  const o = b.override?.trim().toLowerCase()
  if (o === '1' || o === 'true' || o === 'on') return true
  if (o === '0' || o === 'false' || o === 'off') return false
  if (b.test || b.command === 'serve') return true
  return b.pagesBranch !== undefined && b.pagesBranch !== '' && b.pagesBranch !== 'main'
}

/** The AUT report screens are shown (decided when the app was built). */
export const REPORT_ENABLED: boolean = typeof __REPORT_ENABLED__ === 'boolean' ? __REPORT_ENABLED__ : true
