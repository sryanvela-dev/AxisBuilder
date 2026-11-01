// Switches for work that is built but not yet released to everyone. Each is decided when the app is built
// (vite.config.ts `define`), so a switched-off feature is not even reachable in the production build of `main`.
//
// REPORT_ENABLED (AUT report, report design section 10): on for `npm run dev`, for the tests and for Cloudflare Pages
// preview builds (any branch but `main`); off for the production build of `main`. `VITE_REPORT=1` / `0` overrides it.
// Every report screen, button and switch checks it; the report data in the project file is read and kept either way.
//
// MARKUP_ENABLED (the report pictures' markup editor, R5): the same rule; `VITE_MARKUP=1` / `0` overrides it. Every way
// into the editor checks it; marks already in a job file print either way (drawing them is R3's).

declare const __REPORT_ENABLED__: boolean | undefined
declare const __MARKUP_ENABLED__: boolean | undefined

export interface FlagBuild {
  /** Vite's command: 'serve' (dev server) or 'build'. */
  command: 'serve' | 'build'
  /** Running under Vitest. */
  test: boolean
  /** CF_PAGES_BRANCH: set by Cloudflare Pages to the branch being built. */
  pagesBranch?: string
  /** VITE_REPORT / VITE_MARKUP: '1' / '0' (also 'true' / 'false', 'on' / 'off') turns it on or off whatever the rest says. */
  override?: string
}

/** Whether a switched feature is on in a build (see the file comment). */
function flagEnabledFor(b: FlagBuild): boolean {
  const o = b.override?.trim().toLowerCase()
  if (o === '1' || o === 'true' || o === 'on') return true
  if (o === '0' || o === 'false' || o === 'off') return false
  if (b.test || b.command === 'serve') return true
  return b.pagesBranch !== undefined && b.pagesBranch !== '' && b.pagesBranch !== 'main'
}

/** Whether the report is on in a build (override = VITE_REPORT). */
export const reportEnabledFor = (b: FlagBuild): boolean => flagEnabledFor(b)
/** Whether the markup editor is on in a build (override = VITE_MARKUP). */
export const markupEnabledFor = (b: FlagBuild): boolean => flagEnabledFor(b)

/** The AUT report screens are shown (decided when the app was built). */
export const REPORT_ENABLED: boolean = typeof __REPORT_ENABLED__ === 'boolean' ? __REPORT_ENABLED__ : true

/** The markup editor can be opened (decided when the app was built). */
export const MARKUP_ENABLED: boolean = typeof __MARKUP_ENABLED__ === 'boolean' ? __MARKUP_ENABLED__ : true
