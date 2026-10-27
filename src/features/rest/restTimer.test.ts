import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useRestTimer } from './restTimer'

/**
 * The rest timer's single most important property: it is driven by an absolute
 * end timestamp, never a countdown. These tests simulate a phone sleeping by
 * jumping the clock forward without ever letting a timer callback run — which
 * is exactly what a frozen browser tab does.
 */
describe('rest timer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-27T10:00:00Z'))
    useRestTimer.setState({ endsAt: null, totalSeconds: 0, label: null, signalled: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const now = () => Date.now()

  it('stores an absolute end time, not a duration', () => {
    useRestTimer.getState().start(120, 'Bench Press')

    const { endsAt, totalSeconds, label } = useRestTimer.getState()
    expect(endsAt).toBe(now() + 120_000)
    expect(totalSeconds).toBe(120)
    expect(label).toBe('Bench Press')
  })

  it('is still correct after the phone sleeps through most of the rest', () => {
    useRestTimer.getState().start(180, 'Squat')
    const { endsAt } = useRestTimer.getState()

    // 150 seconds pass with the tab frozen — no interval fires.
    vi.setSystemTime(now() + 150_000)

    // Remaining is derived, so it reflects reality rather than wherever a
    // counter happened to stop.
    expect(Math.ceil((endsAt! - now()) / 1000)).toBe(30)
  })

  it('reports a negative remainder when rest overran', () => {
    useRestTimer.getState().start(60, 'Cable Fly')
    const { endsAt } = useRestTimer.getState()

    vi.setSystemTime(now() + 90_000)

    expect(Math.ceil((endsAt! - now()) / 1000)).toBe(-30)
  })

  it('extends from now, not from the past, once rest has run out', () => {
    useRestTimer.getState().start(60, 'Deadlift')
    vi.setSystemTime(now() + 100_000) // 40 seconds overdue

    useRestTimer.getState().extend(30)

    // Pressing +30s on an expired timer must give you 30 more seconds, not
    // land 10 seconds in the past.
    const { endsAt } = useRestTimer.getState()
    expect(endsAt).toBe(now() + 30_000)
  })

  it('extends from the end when rest is still running', () => {
    useRestTimer.getState().start(120, 'Row')
    const original = useRestTimer.getState().endsAt!

    vi.setSystemTime(now() + 30_000)
    useRestTimer.getState().extend(30)

    expect(useRestTimer.getState().endsAt).toBe(original + 30_000)
    expect(useRestTimer.getState().totalSeconds).toBe(150)
  })

  it('clears the signalled flag on extend so the chime fires again', () => {
    useRestTimer.getState().start(60, 'Press')
    useRestTimer.getState().markSignalled()
    expect(useRestTimer.getState().signalled).toBe(true)

    useRestTimer.getState().extend(30)
    expect(useRestTimer.getState().signalled).toBe(false)
  })

  it('skipping clears everything', () => {
    useRestTimer.getState().start(120, 'Curl')
    useRestTimer.getState().skip()

    expect(useRestTimer.getState()).toMatchObject({
      endsAt: null,
      totalSeconds: 0,
      label: null,
      signalled: false,
    })
  })

  it('extend does nothing when no timer is running', () => {
    useRestTimer.getState().extend(30)
    expect(useRestTimer.getState().endsAt).toBeNull()
  })

  it('starting again replaces the previous rest rather than stacking', () => {
    useRestTimer.getState().start(180, 'Squat')
    vi.setSystemTime(now() + 10_000)
    useRestTimer.getState().start(60, 'Leg Extension')

    expect(useRestTimer.getState().endsAt).toBe(now() + 60_000)
    expect(useRestTimer.getState().totalSeconds).toBe(60)
    expect(useRestTimer.getState().label).toBe('Leg Extension')
  })
})
