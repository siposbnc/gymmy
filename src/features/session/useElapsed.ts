import { useEffect, useState } from 'react'

export { formatDuration } from '~/lib/time'

/**
 * Elapsed time since `startedAt`, ticking once a second.
 *
 * Derived from the timestamp on every tick rather than incremented, so a phone
 * that slept for twenty minutes shows the truth the moment it wakes. The rest
 * timer uses the same principle for the same reason — a counter that can drift
 * is a counter that will.
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
