import type {
  AudioAdapter,
  ClipboardAdapter,
  FilesAdapter,
  InstallAdapter,
  InstallState,
  NotificationAdapter,
  Platform,
  StorageAdapter,
  VibrationAdapter,
} from './types'

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const timers = new Map<string, ReturnType<typeof setTimeout>>()

const notifications: NotificationAdapter = {
  isSupported: () => typeof Notification !== 'undefined',

  getPermission: () => (typeof Notification === 'undefined' ? 'denied' : Notification.permission),

  requestPermission: async () => {
    if (typeof Notification === 'undefined') return 'denied'
    return Notification.requestPermission()
  },

  scheduleAt({ id, title, body, at }) {
    notifications.cancel(id)
    const delay = Math.max(0, at - Date.now())

    // A setTimeout is all the web platform offers without a push server, and it
    // dies when the tab is frozen. That is a known limitation, not an oversight
    // — the rest timer treats this as one of three independent signals and
    // recomputes its own state from the stored end timestamp on resume.
    const handle = setTimeout(() => {
      timers.delete(id)
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      try {
        new Notification(title, body === undefined ? { tag: id } : { body, tag: id })
      } catch {
        // Some browsers require a service worker registration to construct
        // Notification directly. Silence is correct: the in-app fallback has
        // already fired.
      }
    }, delay)

    timers.set(id, handle)
    return () => notifications.cancel(id)
  },

  cancel(id) {
    const handle = timers.get(id)
    if (handle !== undefined) {
      clearTimeout(handle)
      timers.delete(id)
    }
  },
}

// ---------------------------------------------------------------------------
// Vibration — Android only; Safari has no Vibration API
// ---------------------------------------------------------------------------

const vibration: VibrationAdapter = {
  isSupported: () => typeof navigator !== 'undefined' && 'vibrate' in navigator,
  vibrate(pattern) {
    if (!vibration.isSupported()) return
    navigator.vibrate(pattern)
  },
}

// ---------------------------------------------------------------------------
// Audio — the only signal that always works
// ---------------------------------------------------------------------------

let audioContext: AudioContext | null = null

const audio: AudioAdapter = {
  async unlock() {
    if (typeof AudioContext === 'undefined') return
    audioContext ??= new AudioContext()
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
  },

  playRestComplete() {
    if (!audioContext || audioContext.state !== 'running') return

    // Two short rising tones. Synthesised rather than shipped as an asset:
    // no network, no decode, nothing to precache, and it cuts through gym noise
    // better than a soft chime.
    const now = audioContext.currentTime
    for (const [index, frequency] of [880, 1174.66].entries()) {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency

      const start = now + index * 0.18
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.35, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16)

      oscillator.connect(gain).connect(audioContext.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.18)
    }
  },
}

// ---------------------------------------------------------------------------
// Files — the backup story for an app with no account
// ---------------------------------------------------------------------------

const files: FilesAdapter = {
  // Synchronous in the browser, but Promise-returning so the Capacitor
  // implementation (which genuinely is async) can drop straight in.
  save({ filename, mimeType, data }) {
    const blob = new Blob([data], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    // Revoke on the next task so Safari has actually started the download.
    setTimeout(() => URL.revokeObjectURL(url), 0)
    return Promise.resolve()
  },

  open({ accept }) {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = accept

      input.addEventListener('change', () => {
        const file = input.files?.[0]
        if (!file) {
          resolve(null)
          return
        }
        void file.text().then(resolve)
      })

      // There is no reliable cross-browser "cancelled" event, so a cancelled
      // picker simply never resolves. Callers treat this as "nothing happened",
      // which is the correct outcome either way.
      input.click()
    })
  },
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const storage: StorageAdapter = {
  async requestPersistence() {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    return navigator.storage.persist()
  },

  async isPersisted() {
    if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return false
    return navigator.storage.persisted()
  },

  async estimate() {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
    const { usage, quota } = await navigator.storage.estimate()
    return { usageBytes: usage ?? 0, quotaBytes: quota ?? 0 }
  },
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * Installing matters more here than for most web apps.
 *
 * On iOS an uninstalled site can have its IndexedDB evicted under storage
 * pressure — which for Gymmy means losing training history that exists nowhere
 * else. Installing also unlocks notifications (16.4+), without which the rest
 * timer cannot reach you once you switch apps.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const installListeners = new Set<(state: InstallState) => void>()

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // `standalone` is the iOS-only signal; the media query covers everyone else.
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

function detectIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+ reports as Macintosh, so touch support disambiguates it.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

function currentInstallState(): InstallState {
  if (isStandalone()) return 'installed'
  if (deferredPrompt) return 'promptable'
  // Safari never fires beforeinstallprompt but can still install by hand.
  if (detectIos()) return 'manual'
  return 'unsupported'
}

function announceInstallState(): void {
  const state = currentInstallState()
  for (const listener of installListeners) listener(state)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    announceInstallState()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    announceInstallState()
  })
}

const install: InstallAdapter = {
  getState: currentInstallState,

  subscribe(listener) {
    installListeners.add(listener)
    return () => installListeners.delete(listener)
  },

  async prompt() {
    if (!deferredPrompt) return false
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    // The event is single-use; the browser re-fires it if still installable.
    deferredPrompt = null
    announceInstallState()
    return outcome === 'accepted'
  },

  isIos: detectIos,
}

const clipboard: ClipboardAdapter = {
  async writeText(text) {
    try {
      // Requires a secure context, which the app always has — service workers
      // need one too.
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Denied permission, or an insecure origin during local testing.
      return false
    }
  },
}

export const webPlatform: Platform = {
  notifications,
  vibration,
  audio,
  files,
  storage,
  install,
  clipboard,
}
