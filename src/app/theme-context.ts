import { createContext, use } from 'react'

import type { ThemePreference } from '~/domain/types'

import type { ResolvedTheme } from './theme'

export interface ThemeContextValue {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

/**
 * Kept out of ThemeProvider.tsx so that file exports only a component — which
 * is what keeps Fast Refresh working for it.
 */
export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>')
  return context
}
