import type { ThemePreference } from '~/domain/types'

export const THEME_STORAGE_KEY = 'gymmy.theme'

export type ResolvedTheme = 'light' | 'dark'

/**
 * Resolve a preference against the OS setting.
 *
 * The inline script in index.html duplicates this logic so the theme is applied
 * before first paint — anything later gives a white flash in a dark gym, the
 * single most jarring bug a dark-first app can ship. If you change the rule
 * here, change it there.
 */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved

  // Keep the browser/OS chrome in step with the app surface.
  const themeColor = resolved === 'dark' ? '#14110F' : '#F6F3EE'
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', themeColor)
  }
}

export function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Private mode or storage disabled — fall through to the OS preference.
  }
  return 'system'
}

export function storePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Non-fatal: the preference simply will not survive a reload.
  }
}
