/**
 * How much of the screen the on-screen keyboard is covering.
 *
 * The problem this solves: a bottom sheet is positioned against the bottom of
 * the LAYOUT viewport, but the keyboard covers the bottom of the VISUAL
 * viewport. iOS does not shrink the layout viewport when the keyboard opens —
 * `100dvh` stays the full screen height — so a sheet anchored to `bottom: 0`
 * has its lower half, which is where the content is, hidden behind the keys.
 *
 * The visual viewport reports the truth. The difference between the two is the
 * keyboard, and publishing it as a CSS variable lets any component lift itself
 * clear without each one re-deriving it.
 *
 * Degrades to zero wherever `visualViewport` is unavailable, which means
 * nothing moves on a desktop browser.
 */

const PROPERTY = '--keyboard-inset'

/**
 * Anything smaller than this is a browser UI bar, a rubber-band scroll, or
 * rounding — not a keyboard. Reacting to those would make sheets twitch every
 * time the page moved. No on-screen keyboard is under 80px.
 */
const KEYBOARD_THRESHOLD_PX = 80

/** The measurement, extracted so it can be tested without a browser. */
export function keyboardInsetFrom(input: {
  layoutHeight: number
  viewportHeight: number
  offsetTop: number
}): number {
  // `offsetTop` matters: when the page is scrolled within the visual viewport,
  // the uncovered region moves as well as shrinks.
  const covered = input.layoutHeight - input.viewportHeight - input.offsetTop
  return covered > KEYBOARD_THRESHOLD_PX ? Math.round(covered) : 0
}

function measure(): number {
  const viewport = window.visualViewport
  if (!viewport) return 0
  return keyboardInsetFrom({
    layoutHeight: window.innerHeight,
    viewportHeight: viewport.height,
    offsetTop: viewport.offsetTop,
  })
}

/**
 * Keep `--keyboard-inset` on the document root in sync.
 *
 * Installed once, at app start. Returns a cleanup function.
 */
export function trackKeyboardInset(): () => void {
  if (typeof window === 'undefined') return () => {}

  const root = document.documentElement
  const apply = () => {
    const inset = measure()
    root.style.setProperty(PROPERTY, `${inset}px`)
    // A data attribute as well as the length, so CSS can react to the keyboard
    // being open at all — the tab bar hides rather than being squeezed against
    // the keys. Doing it in CSS keeps it off the React render path.
    if (inset > 0) root.dataset.keyboard = 'open'
    else delete root.dataset.keyboard
  }

  apply()

  const viewport = window.visualViewport
  if (!viewport) return () => {}

  viewport.addEventListener('resize', apply)
  viewport.addEventListener('scroll', apply)
  // Blur does not always fire a viewport resize on iOS, so settle on focus
  // changes too.
  window.addEventListener('focusin', apply)
  window.addEventListener('focusout', apply)

  return () => {
    viewport.removeEventListener('resize', apply)
    viewport.removeEventListener('scroll', apply)
    window.removeEventListener('focusin', apply)
    window.removeEventListener('focusout', apply)
    root.style.removeProperty(PROPERTY)
  }
}
