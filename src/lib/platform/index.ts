import type { Platform } from './types'
import { webPlatform } from './web'

export * from './types'

/**
 * The active platform.
 *
 * Today this is always the web adapter. When Gymmy ships to the app stores via
 * Capacitor, this is the one file that changes — detect the native runtime and
 * return the Capacitor-backed adapters instead. Nothing in `features/` or `ui/`
 * needs to know.
 */
export const platform: Platform = webPlatform
