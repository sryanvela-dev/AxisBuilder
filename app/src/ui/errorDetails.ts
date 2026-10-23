// Text for "Copy error details": what broke and where, never the job's data.

declare const __APP_VERSION__: string

export function errorDetails(error: unknown, where: string, componentStack?: string | null): string {
  const err = error instanceof Error ? error : new Error(String(error))
  return [
    'AxisBuilder error report',
    `Time: ${new Date().toISOString()}`,
    `App version: ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown'}`,
    `Screen: ${where}`,
    `Browser: ${typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent}`,
    '',
    `${err.name}: ${err.message}`,
    err.stack ?? '',
    componentStack ? `\nComponent stack:${componentStack}` : '',
  ]
    .join('\n')
    .trim()
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
