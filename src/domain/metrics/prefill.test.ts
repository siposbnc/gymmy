import { describe, expect, it } from 'vitest'

import { lastTimeSummary, resolvePrefill, type PrefillSet } from './prefill'

const working = (setIndex: number, weightKg: number, reps: number): PrefillSet => ({
  setIndex,
  weightKg,
  reps,
  type: 'normal',
})
const warmup = (setIndex: number, weightKg: number, reps: number): PrefillSet => ({
  setIndex,
  weightKg,
  reps,
  type: 'warmup',
})

describe('resolvePrefill — the fallback chain', () => {
  it('carries forward what you just did, over last week and over the plan', () => {
    // Plan says 77.5, last week you did 77.5, but you just bumped to 80.
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [working(1, 80, 8)],
      previousSessionSets: [working(1, 77.5, 8), working(2, 77.5, 8)],
      target: { weight: { kind: 'absolute', kg: 77.5 }, reps: 8 },
    })
    expect(result).toEqual({ weightKg: 80, reps: 8, source: 'carried_forward' })
  })

  it('uses the plan on the first set of a planned exercise', () => {
    const result = resolvePrefill({
      setIndex: 1,
      target: { weight: { kind: 'absolute', kg: 100 }, reps: 5 },
    })
    expect(result).toEqual({ weightKg: 100, reps: 5, source: 'routine_target' })
  })

  it('falls to the same set index from last session', () => {
    const result = resolvePrefill({
      setIndex: 3,
      previousSessionSets: [working(1, 80, 8), working(2, 80, 8), working(3, 80, 6)],
    })
    // Set 3 specifically — last time that set dropped to 6 reps.
    expect(result).toEqual({ weightKg: 80, reps: 6, source: 'same_set_last_time' })
  })

  it('falls to the last set ever when that index did not exist last time', () => {
    // Adding a fourth set to a session that only had three.
    const result = resolvePrefill({
      setIndex: 4,
      previousSessionSets: [working(1, 80, 8), working(2, 80, 8), working(3, 80, 6)],
    })
    expect(result).toEqual({ weightKg: 80, reps: 6, source: 'last_set_ever' })
  })

  it('is empty for an exercise with no history, rather than inventing a zero', () => {
    expect(resolvePrefill({ setIndex: 1 })).toEqual({ source: 'empty' })
    expect(resolvePrefill({ setIndex: 1, previousSessionSets: [] })).toEqual({ source: 'empty' })
  })

  it('never carries forward or copies a warm-up', () => {
    const result = resolvePrefill({
      setIndex: 1,
      currentSessionSets: [warmup(1, 20, 12), warmup(2, 60, 5)],
      previousSessionSets: [warmup(1, 20, 12), working(1, 100, 5)],
    })
    // The warm-ups in this session are ignored, so it reaches last session's
    // working set — not the 60 kg ramp-up the user just did.
    expect(result).toEqual({ weightKg: 100, reps: 5, source: 'same_set_last_time' })
  })

  it('ignores a percent target it cannot resolve without a training max', () => {
    const result = resolvePrefill({
      setIndex: 1,
      target: { weight: { kind: 'percent', pct: 85, basis: 'training_max' } },
      previousSessionSets: [working(1, 120, 3)],
    })
    expect(result.source).toBe('same_set_last_time')
    expect(result.weightKg).toBe(120)
  })

  it('handles reps-only exercises with no weight', () => {
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [{ setIndex: 1, reps: 9, type: 'normal' }],
    })
    expect(result).toEqual({ reps: 9, source: 'carried_forward' })
    expect(result.weightKg).toBeUndefined()
  })
})

describe('lastTimeSummary — the ghost line', () => {
  it('collapses a uniform load to one figure', () => {
    expect(lastTimeSummary([working(1, 77.5, 8), working(2, 77.5, 8), working(3, 77.5, 7)])).toBe(
      '77.5 kg × 8, 8, 7',
    )
  })

  it('spells out each pairing when the load varied', () => {
    expect(lastTimeSummary([working(1, 60, 10), working(2, 80, 8), working(3, 100, 5)])).toBe(
      '60 × 10, 80 × 8, 100 × 5 kg',
    )
  })

  it('says bodyweight rather than showing nothing', () => {
    expect(
      lastTimeSummary([
        { setIndex: 1, reps: 9, type: 'normal' },
        { setIndex: 2, reps: 8, type: 'normal' },
      ]),
    ).toBe('bodyweight × 9, 8')
  })

  it('excludes warm-ups from the summary', () => {
    expect(lastTimeSummary([warmup(1, 20, 12), working(1, 100, 5), working(2, 100, 5)])).toBe(
      '100 kg × 5, 5',
    )
  })

  it('returns null when there is nothing to show', () => {
    expect(lastTimeSummary([])).toBeNull()
    expect(lastTimeSummary([warmup(1, 20, 12)])).toBeNull()
  })
})
