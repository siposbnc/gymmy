import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ThemePreference } from '~/domain/types'

import { ThemeContext } from './theme-context'
import {
  applyTheme,
  readStoredPreference,
  resolveTheme,
  storePreference,
  type ResolvedTheme,
} from './theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStoredPreference()))

  // Apply on change, and keep following the OS while the preference is
  // "system" — a user who switches their phone to dark at 6pm expects Gymmy to
  // follow without being reopened.
  useEffect(() => {
    const next = resolveTheme(preference)
    setResolved(next)
    applyTheme(next)

    if (preference !== 'system') return

    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const followed = resolveTheme('system')
      setResolved(followed)
      applyTheme(followed)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    storePreference(next)
  }, [])

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}
