// When a new version of the app is installed while a page is open, the page can still ask for a
// code file from the old version, which no longer exists. Reloading loads the new version.
// Reloads at most once a minute so a real network problem can't cause a reload loop.

const KEY = 'axisbuilder:reloadedForUpdate'

/** True if the error means a code file from an older app version could not be loaded. */
export function isStaleCodeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg)
}

/** Reloads the page unless it already did so in the last minute. Returns true if a reload started. */
export function reloadAfterUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // Storage blocked: still reload once; the page will show the error if it happens again.
  }
  window.location.reload()
  return true
}
