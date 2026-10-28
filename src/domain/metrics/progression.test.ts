import { describe, expect, it } from 'vitest'

import {
  progressionMetric,
  smallestStepKg,
  suggestProgression,
  type ProgressionSet,
} from './progression'

/** `count` working sets, all at the same weight and reps. */
function sets(count: number, weightKg: number, reps: number): ProgressionSet[] {
  return Array.from({ length: count }, () => ({ type: 'normal' as const, weightKg, reps }))
}

const range = { sets: 3, repsMin: 5, repsMax: 8 }

describe('suggestProgression', () => {
  it('adds weight once every set reaches the top of the range', () => {
    const result = suggestProgression({
      previousSessionSets: sets(3, 80, 8),
      target: range,
      stepKg: 2.5,
    })

    expect(result).toEqual({ fromKg: 80, toKg: 82.5, reps: 5, sets: 3, clearedReps: 8 })
  })

  it('drops back to the bottom of the range at the new weight', () => {
    // The other half of double progression: heavier means fewer reps again.
    const result = suggestProgression({
      previousSessionSets: sets(3, 80, 8),
      target: range,
      stepKg: 2.5,
    })

    expect(result?.reps).toBe(5)
  })

  it('says nothing while you are still working up the range', () => {
    expect(
      suggestProgression({ previousSessionSets: sets(3, 80, 7), target: range, stepKg: 2.5 }),
    ).toBeNull()
  })

  it('says nothing when only some sets reached the top', () => {
    const uneven: ProgressionSet[] = [
      { type: 'normal', weightKg: 80, reps: 8 },
      { type: 'normal', weightKg: 80, reps: 8 },
      { type: 'normal', weightKg: 80, reps: 6 },
    ]

    expect(suggestProgression({ previousSessionSets: uneven, target: range, stepKg: 2.5 })).toBeNull()
  })

  it('counts an AMRAP set that overshot the range', () => {
    const amrap: ProgressionSet[] = [
      { type: 'normal', weightKg: 80, reps: 8 },
      { type: 'normal', weightKg: 80, reps: 8 },
      { type: 'normal', weightKg: 80, reps: 12 },
    ]

    expect(suggestProgression({ previousSessionSets: amrap, target: range, stepKg: 2.5 })?.toKg).toBe(
      82.5,
    )
  })

  it('ignores warm-up sets entirely', () => {
    const withWarmup: ProgressionSet[] = [
      { type: 'warmup', weightKg: 40, reps: 10 },
      ...sets(3, 80, 8),
    ]

    expect(
      suggestProgression({ previousSessionSets: withWarmup, target: range, stepKg: 2.5 })?.fromKg,
    ).toBe(80)
  })

  it('treats a single rep target as linear progression', () => {
    // No range given: hitting the number IS clearing it.
    const result = suggestProgression({
      previousSessionSets: sets(3, 100, 5),
      target: { sets: 3, repsMin: 5 },
      stepKg: 5,
    })

    expect(result).toMatchObject({ fromKg: 100, toKg: 105, reps: 5, clearedReps: 5 })
  })

  it('refuses when the exercise has no rep range at all', () => {
    // Freestyle work. Inventing a range would be Gymmy deciding what your
    // training should look like.
    expect(
      suggestProgression({ previousSessionSets: sets(3, 80, 12), stepKg: 2.5 }),
    ).toBeNull()
  })

  it('refuses when last session fell short of the planned sets', () => {
    expect(
      suggestProgression({ previousSessionSets: sets(2, 80, 8), target: range, stepKg: 2.5 }),
    ).toBeNull()
  })

  it('accepts more sets than planned', () => {
    expect(
      suggestProgression({ previousSessionSets: sets(4, 80, 8), target: range, stepKg: 2.5 })?.sets,
    ).toBe(4)
  })

  it('refuses when the sets were at different weights', () => {
    const ramp: ProgressionSet[] = [
      { type: 'normal', weightKg: 60, reps: 8 },
      { type: 'normal', weightKg: 70, reps: 8 },
      { type: 'normal', weightKg: 80, reps: 8 },
    ]

    expect(suggestProgression({ previousSessionSets: ramp, target: range, stepKg: 2.5 })).toBeNull()
  })

  it('refuses for bodyweight work, which has no weight to add', () => {
    const bodyweight: ProgressionSet[] = [
      { type: 'normal', reps: 12 },
      { type: 'normal', reps: 12 },
      { type: 'normal', reps: 12 },
    ]

    expect(
      suggestProgression({ previousSessionSets: bodyweight, target: range, stepKg: 2.5 }),
    ).toBeNull()
  })

  it('refuses with no history and with no usable step', () => {
    expect(suggestProgression({ target: range, stepKg: 2.5 })).toBeNull()
    expect(
      suggestProgression({ previousSessionSets: sets(3, 80, 8), target: range, stepKg: 0 }),
    ).toBeNull()
  })
})

describe('smallestStepKg', () => {
  const inventory = [
    { weightKg: 20, pairs: 2 },
    { weightKg: 5, pairs: 2 },
    { weightKg: 1.25, pairs: 0 },
  ]

  it('is twice the lightest plate pair you own', () => {
    // Plates go on in pairs, so the bar moves in 2 × the smallest plate.
    expect(smallestStepKg(true, inventory, 2.5)).toBe(10)
  })

  it('ignores plates you own none of', () => {
    // 1.25s would give a 2.5 kg step, but there are zero pairs of them.
    expect(smallestStepKg(true, inventory, 2.5)).toBe(10)
  })

  it('falls back to the stepper increment off the bar', () => {
    expect(smallestStepKg(false, inventory, 2.5)).toBe(2.5)
  })

  it('falls back when the rack is empty', () => {
    expect(smallestStepKg(true, [], 2.5)).toBe(2.5)
  })
})

describe('the worked example', () => {
  it('shows the arithmetic behind the suggestion', () => {
    const example = progressionMetric.example({
      previousSessionSets: sets(3, 80, 8),
      target: range,
      stepKg: 2.5,
    })

    expect(example).toEqual({
      given: '3 × 8 at 80 kg',
      substitution: 'every set reached 8 reps → 80 + 2.5',
      result: '82.5 kg × 5',
    })
  })

  it('has nothing to show when nothing is suggested', () => {
    expect(progressionMetric.example({ previousSessionSets: sets(3, 80, 6), target: range, stepKg: 2.5 })).toBeNull()
  })
})
