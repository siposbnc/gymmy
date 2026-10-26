import type {
  AudioAdapter,
  FilesAdapter,
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

export const webPlatform: Platform = { notifications, vibration, audio, files, storage }
