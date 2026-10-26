// "Report a problem": the details are copied and an email to whoever looks after AxisBuilder is opened with them.

/** Where problem reports go. The one place to change it. */
export const SUPPORT_EMAIL = 'Sean.Vela@integrityepc.com'

/** Longest details put in the email itself (a mail link much longer than this may not open); all of them are copied. */
const BODY_LIMIT = 1500

/** The mailto link for a problem report with these details (cut short if long; the full text is on the clipboard). */
export function problemMailto(details: string): string {
  const cut = details.length > BODY_LIMIT
  const body = [
    'What were you doing when it happened?',
    '',
    '',
    '--- Details (no job data) ---',
    cut ? `${details.slice(0, BODY_LIMIT)}\n... (the full details are on the clipboard: paste them here)` : details,
  ].join('\n')
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('AxisBuilder problem report')}&body=${encodeURIComponent(body)}`
}

/** Opens the email program with a new message (no page change). */
export function openMail(href: string): void {
  const a = document.createElement('a')
  a.href = href
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
}
