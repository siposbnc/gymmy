import { useEffect, useState } from 'react'

import { platform, type InstallState } from '~/lib/platform'

/**
 * Whether Gymmy is installed, installable, or neither.
 *
 * In its own file so InstallCard.tsx exports only components, which is what
 * keeps Fast Refresh working for it.
 */
export function useInstallState(): InstallState {
  const [state, setState] = useState<InstallState>(() => platform.install.getState())
  useEffect(() => platform.install.subscribe(setState), [])
  return state
}
