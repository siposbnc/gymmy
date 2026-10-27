import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { platform } from '~/lib/platform'
import { describeDuration } from '~/lib/time'

const NOTIFICATION_ID = 'gymmy.rest'

export interface RestTimerState {
  /** Absolute epoch-ms the rest ends. Null when no timer is running. */
  endsAt: number | null
  /** The full length, so the progress rail knows what fraction is left. */
  totalSeconds: number
  /** What you are resting from, e.g. "Bench Press". */
  label: string | null
  /** Set once the completion effects have fired, so they fire exactly once. */
  signalled: boolean

  start: (seconds: number, label: string) => void
  extend: (seconds: number) => void
  skip: () => void
  markSignalled: () => void
}

/**
 * The rest timer.
 *
 * Stores an **absolute end timestamp**, never a countdown. A `setInterval` is
 * dead the moment the phone sleeps or the browser freezes the tab, so a timer
 * built on one comes back two minutes stale and silently wrong. Here the
 * remaining time is derived from the timestamp on every render and on every
 * visibility change; the interval only drives the visual tick, and if it stalls
 * nothing is lost.
 *
 * Persisted to localStorage so the timer also survives the app being killed
 * outright — reopen Gymmy ninety seconds later and the rail is already in the
 * right place, with no spinner and no resync.
 *
 * Notification scheduling lives in these actions rather than in a component,
 * so the scheduled alert can never drift out of step with the stored end time.
 */
export const useRestTimer = create<RestTimerState>()(
  persist(
    (set, get) => ({
      endsAt: null,
      totalSeconds: 0,
      label: null,
      signalled: false,

      start(seconds, label) {
        const endsAt = Date.now() + seconds * 1000
        platform.notifications.cancel(NOTIFICATION_ID)
        platform.notifications.scheduleAt({
          id: NOTIFICATION_ID,
          title: 'Rest done',
          body: label,
          at: endsAt,
        })
        set({ endsAt, totalSeconds: seconds, label, signalled: false })
      },

      extend(seconds) {
        const { endsAt, totalSeconds, label } = get()
        if (endsAt === null) return

        // Extend from NOW when the timer has already run out, otherwise the
        // "+30s" you press on an expired timer would land in the past.
        const base = Math.max(endsAt, Date.now())
        const nextEndsAt = base + seconds * 1000

        platform.notifications.cancel(NOTIFICATION_ID)
        platform.notifications.scheduleAt({
          id: NOTIFICATION_ID,
          title: 'Rest done',
          body: label ?? undefined,
          at: nextEndsAt,
        })
        set({
          endsAt: nextEndsAt,
          totalSeconds: totalSeconds + seconds,
          signalled: false,
        })
      },

      skip() {
        platform.notifications.cancel(NOTIFICATION_ID)
        set({ endsAt: null, totalSeconds: 0, label: null, signalled: false })
      },

      markSignalled() {
        set({ signalled: true })
      },
    }),
    {
      name: 'gymmy.rest-timer',
      // `signalled` is intentionally persisted: if the app is killed after the
      // chime has already played, reopening it should not play it again.
      partialize: ({ endsAt, totalSeconds, label, signalled }) => ({
        endsAt,
        totalSeconds,
        label,
        signalled,
      }),
    },
  ),
)

export interface RestProgress {
  /** Seconds left. Negative once the rest has overrun. */
  remaining: number
  /** 0–1 of the rest still to go, for the rail. */
  fraction: number
  isRunning: boolean
  isComplete: boolean
}

/**
 * Remaining time, recomputed rather than counted.
 *
 * Ticks once a second for the display, and recomputes immediately whenever the
 * tab becomes visible again — which is what makes returning from a locked phone
 * show the truth instead of wherever the interval happened to stop.
 */
export function useRestProgress(): RestProgress {
  const endsAt = useRestTimer((state) => state.endsAt)
  const totalSeconds = useRestTimer((state) => state.totalSeconds)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (endsAt === null) return

    const tick = () => setNow(Date.now())
    tick()
    const handle = setInterval(tick, 500)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(handle)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [endsAt])

  if (endsAt === null) {
    return { remaining: 0, fraction: 0, isRunning: false, isComplete: false }
  }

  const remaining = Math.ceil((endsAt - now) / 1000)
  const fraction = totalSeconds > 0 ? Math.max(0, Math.min(1, remaining / totalSeconds)) : 0

  return { remaining, fraction, isRunning: true, isComplete: remaining <= 0 }
}

/**
 * Fire the completion signals exactly once.
 *
 * Three independent signals, because no single one is reliable: the scheduled
 * notification needs an installed PWA on iOS 16.4+, vibration does not exist in
 * Safari at all, and both are useless if the phone is on a bench across the
 * room. The in-app sound and the visible state change always work, which is
 * precisely why the timer never *depends* on the other two.
 */
export function useRestCompletionSignals(options: {
  sound: boolean
  vibrate: boolean
}): void {
  const { isComplete } = useRestProgress()
  const signalled = useRestTimer((state) => state.signalled)
  const markSignalled = useRestTimer((state) => state.markSignalled)

  useEffect(() => {
    if (!isComplete || signalled) return

    if (options.sound) platform.audio.playRestComplete()
    if (options.vibrate) platform.vibration.vibrate([120, 80, 120])
    markSignalled()
  }, [isComplete, signalled, markSignalled, options.sound, options.vibrate])
}

/** Screen-reader announcement for the bar's live region. */
export function describeRest(remaining: number): string {
  return remaining <= 0 ? 'Rest complete' : `${describeDuration(remaining)} of rest remaining`
}
