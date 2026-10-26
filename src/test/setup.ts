import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// jsdom has no matchMedia, and ThemeProvider reads it on mount.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}
