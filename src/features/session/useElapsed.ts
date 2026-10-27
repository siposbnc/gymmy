import { useEffect, useState } from 'react'

/**
 * Elapsed time since `startedAt`, ticking once a second.
 *
 * Derived from the timestamp on every tick rather than incremented, so a phone
 * that slept for twenty minutes shows the truth the moment it wakes. Same
 * principle the rest timer will use in M2 — a counter that can drift is a
 * counter that will.
 */
export function useElapsed(startedAt: number): number {
  const [seconds, setSeconds] = useState(() => Math.floor((Date.now() - startedAt) / 1000))

  useEffect(() => {
    const tick = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const handle = setInterval(tick, 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(handle)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [startedAt])

  return seconds
}

/** `42:10`, or `1:04:22` once an hour has passed. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60

  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}
