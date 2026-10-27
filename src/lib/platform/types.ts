/**
 * Platform capability adapters.
 *
 * No component may call a web-only API directly. Notifications, vibration,
 * audio, file export and storage persistence all go through these interfaces.
 *
 * Two reasons, and the second is the one that pays:
 *
 * 1. Testing — the adapters stub trivially, so nothing in the UI needs jsdom
 *    shims for APIs that do not exist there anyway.
 * 2. The app-store path. Gymmy ships to iOS/Android via Capacitor, which reuses
 *    this entire codebase. Swapping a web implementation for a Capacitor plugin
 *    then becomes a one-file change per capability instead of a hunt through
 *    the feature folders. It also fixes the rest timer's weakest point: real
 *    OS-level local notifications instead of PWA notification support.
 */

export interface NotificationAdapter {
  /** Whether notifications can be shown at all on this platform. */
  isSupported(): boolean
  /** Current permission, without prompting. */
  getPermission(): 'granted' | 'denied' | 'default'
  /** Prompts. Call only from a user gesture. */
  requestPermission(): Promise<'granted' | 'denied' | 'default'>
  /**
   * Fire a notification at `at` (epoch ms).
   *
   * Returns a cancel function. Implementations must not rely on a JS timer
   * surviving — the web adapter degrades honestly when the page is frozen,
   * which is exactly why the rest timer never depends on this alone.
   */
  scheduleAt(options: {
    id: string
    title: string
    body?: string | undefined
    at: number
  }): () => void
  cancel(id: string): void
}

export interface VibrationAdapter {
  /** False on iOS Safari, which has no Vibration API at all. */
  isSupported(): boolean
  vibrate(pattern: number | number[]): void
}

export interface AudioAdapter {
  /** Must be called from a user gesture to unlock audio on iOS. */
  unlock(): Promise<void>
  /** The rest-timer chime. Always available, which is why it is the fallback. */
  playRestComplete(): void
}

export interface FilesAdapter {
  save(options: { filename: string; mimeType: string; data: string }): Promise<void>
  /** Opens a picker and resolves with the file's text, or null if cancelled. */
  open(options: { accept: string }): Promise<string | null>
}

export interface StorageAdapter {
  /**
   * Ask the browser not to evict our IndexedDB.
   *
   * iOS Safari evicts storage for sites that are not installed when space runs
   * low — which for Gymmy means losing training history. This is a request,
   * not a guarantee, which is why export ships in M1 rather than at the end.
   */
  requestPersistence(): Promise<boolean>
  isPersisted(): Promise<boolean>
  estimate(): Promise<{ usageBytes: number; quotaBytes: number } | null>
}

export type InstallState =
  /** Already running as an installed app. */
  | 'installed'
  /** The browser has offered an install prompt we can trigger. */
  | 'promptable'
  /** Installable, but only by hand — iOS Safari never fires the event. */
  | 'manual'
  /** This browser cannot install it at all. */
  | 'unsupported'

export interface InstallAdapter {
  getState(): InstallState
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: (state: InstallState) => void): () => void
  /**
   * Show the browser's install prompt. Only meaningful when `promptable`.
   * Resolves true if the user accepted.
   */
  prompt(): Promise<boolean>
  /** True on iOS/iPadOS, where installing is a manual Share-sheet action. */
  isIos(): boolean
}

export interface Platform {
  readonly notifications: NotificationAdapter
  readonly vibration: VibrationAdapter
  readonly audio: AudioAdapter
  readonly files: FilesAdapter
  readonly storage: StorageAdapter
  readonly install: InstallAdapter
}
