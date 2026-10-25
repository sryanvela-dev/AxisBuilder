/**
 * Scrolls the step page (and only it) so the element is at its top. scrollIntoView also scrolls every scrollable ancestor,
 * so on a step whose window is taller than the screen (the Drawing step with its preview) the whole screen moved too.
 */
export function scrollPageTo(el: HTMLElement | null) {
  const page = document.querySelector<HTMLElement>('main.page')
  if (!el || !page) return
  // The shortcut bar sticks to the top of the page, so the title has to land just below it.
  const nav = page.querySelector<HTMLElement>('.list-nav')
  const covered = nav ? nav.getBoundingClientRect().height : 0
  const top = el.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop - covered - 8
  page.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}
