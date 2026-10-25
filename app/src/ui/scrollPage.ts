/**
 * Scrolls the step page (and only it) so the element is at its top. scrollIntoView also scrolls every scrollable ancestor,
 * so on a step whose window is taller than the screen (the Drawing step with its preview) the whole screen moved too.
 */
export function scrollPageTo(el: HTMLElement | null) {
  const page = document.querySelector<HTMLElement>('main.page')
  if (!el || !page) return
  const top = el.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop - 8
  page.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}
