import { describe, expect, it } from 'vitest'

import { keyboardInsetFrom } from './keyboard'

/** iPhone 15 Pro Max, which is where this bug was reported. */
const LAYOUT = 932

describe('keyboardInsetFrom', () => {
  it('is zero with no keyboard open', () => {
    expect(
      keyboardInsetFrom({ layoutHeight: LAYOUT, viewportHeight: LAYOUT, offsetTop: 0 }),
    ).toBe(0)
  })

  it('reports the covered height when the keyboard opens', () => {
    // A typical iOS keyboard leaves roughly 600px of visible viewport.
    expect(
      keyboardInsetFrom({ layoutHeight: LAYOUT, viewportHeight: 596, offsetTop: 0 }),
    ).toBe(336)
  })

  it('accounts for the visual viewport being scrolled', () => {
    // Same keyboard, but the page has been panned within the visual viewport.
    expect(
      keyboardInsetFrom({ layoutHeight: LAYOUT, viewportHeight: 596, offsetTop: 100 }),
    ).toBe(236)
  })

  it('ignores small differences that are not a keyboard', () => {
    // A browser chrome bar, or rubber-band scrolling. Reacting to these would
    // make every sheet twitch as the page moved.
    for (const viewportHeight of [LAYOUT - 1, LAYOUT - 40, LAYOUT - 80]) {
      expect(keyboardInsetFrom({ layoutHeight: LAYOUT, viewportHeight, offsetTop: 0 })).toBe(0)
    }
  })

  it('never returns a negative inset', () => {
    // Can happen transiently mid-rotation, and a negative would push the sheet
    // down off the screen.
    expect(
      keyboardInsetFrom({ layoutHeight: 400, viewportHeight: 932, offsetTop: 0 }),
    ).toBe(0)
  })

  it('rounds to whole pixels', () => {
    expect(
      keyboardInsetFrom({ layoutHeight: LAYOUT, viewportHeight: 596.4, offsetTop: 0.3 }),
    ).toBe(335)
  })
})
