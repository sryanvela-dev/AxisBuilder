// Text for "Copy error details" and "Report a problem": what broke and where, never the job's data.

declare const __APP_VERSION__: string

export const appVersion = (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown')
const browserName = (): string => (typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent)

let last: string | null = null

/** The details of the last error the app showed (null when none since it was opened). */
export function lastErrorDetails(): string | null {
  return last
}

export function errorDetails(error: unknown, where: string, componentStack?: string | null): string {
  const err = error instanceof Error ? error : new Error(String(error))
  last = [
    'AxisBuilder error report',
    `Time: ${new Date().toISOString()}`,
    `App version: ${appVersion()}`,
    `Screen: ${where}`,
    `Browser: ${browserName()}`,
    '',
    `${err.name}: ${err.message}`,
    err.stack ?? '',
    componentStack ? `\nComponent stack:${componentStack}` : '',
  ]
    .join('\n')
    .trim()
  return last
}

/** "Report a problem" from the Help guide: version, browser and where you are, plus the last error if there was one. */
export function problemDetails(where: string): string {
  return [
    'AxisBuilder problem report',
    `Time: ${new Date().toISOString()}`,
    `App version: ${appVersion()}`,
    `Screen: ${where}`,
    `Browser: ${browserName()}`,
    '',
    last ? `Last error:\n${last}` : 'No error shown since the app was opened.',
  ].join('\n')
}

/** Copies text to the clipboard. Returns false when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.append(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}
