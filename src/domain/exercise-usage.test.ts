import { describe, expect, it } from 'vitest'

import {
  describeUsage,
  rankExerciseUsage,
  USAGE_HALF_LIFE_DAYS,
  type ExerciseAppearance,
} from './exercise-usage'

const NOW = Date.UTC(2026, 9, 28)
const DAY = 86_400_000

/** `count` sessions of one exercise, the most recent `daysAgo` old, a week apart. */
function weekly(exerciseId: string, count: number, daysAgo = 0): ExerciseAppearance[] {
  return Array.from({ length: count }, (_, index) => ({
    exerciseId,
    at: NOW - (daysAgo + index * 7) * DAY,
  }))
}

describe('rankExerciseUsage', () => {
  it('ranks what you train most, first', () => {
    const ranked = rankExerciseUsage(
      [...weekly('squat', 3), ...weekly('bench', 8), ...weekly('curl', 1)],
      NOW,
    )

    expect(ranked.map((usage) => usage.exerciseId)).toEqual(['bench', 'squat', 'curl'])
  })

  it('counts sessions plainly even though it ranks by a weighted score', () => {
    const [bench] = rankExerciseUsage(weekly('bench', 5, 2), NOW)

    // What the user is shown is the honest count, not the ranking number.
    expect(bench?.sessions).toBe(5)
    expect(bench?.lastUsedAt).toBe(NOW - 2 * DAY)
    expect(bench?.score).toBeLessThan(5)
  })

  it('halves an appearance over the half-life', () => {
    const fresh = rankExerciseUsage([{ exerciseId: 'a', at: NOW }], NOW)
    const old = rankExerciseUsage(
      [{ exerciseId: 'a', at: NOW - USAGE_HALF_LIFE_DAYS * DAY }],
      NOW,
    )

    expect(fresh[0]?.score).toBeCloseTo(1, 6)
    expect(old[0]?.score).toBeCloseTo(0.5, 6)
  })

  it('puts the programme you run now above the one you abandoned', () => {
    // Twenty sessions of deadlift, but none since the spring; six of hack
    // squat, all of them recent. A raw count would get this backwards.
    const ranked = rankExerciseUsage(
      [...weekly('deadlift', 20, 200), ...weekly('hack-squat', 6, 3)],
      NOW,
    )

    expect(ranked[0]?.exerciseId).toBe('hack-squat')
    expect(ranked[0]?.sessions).toBe(6)
  })

  it('does not let one curious attempt outrank a year of work', () => {
    // The opposite failure: ordering purely by recency would float this to
    // the top of the list on the strength of a single session.
    const ranked = rankExerciseUsage(
      [...weekly('bench', 40), { exerciseId: 'sled-push', at: NOW }],
      NOW,
    )

    expect(ranked[0]?.exerciseId).toBe('bench')
  })

  it('breaks ties on the most recent session, then on id', () => {
    const ranked = rankExerciseUsage(
      [
        { exerciseId: 'b', at: NOW - 3 * DAY },
        { exerciseId: 'a', at: NOW - DAY },
      ],
      NOW,
    )

    expect(ranked.map((usage) => usage.exerciseId)).toEqual(['a', 'b'])
  })

  it('clamps a session dated in the future to full weight', () => {
    // A wrong clock or an import from another timezone must not score above
    // anything genuinely trained today.
    const ranked = rankExerciseUsage(
      [
        { exerciseId: 'future', at: NOW + 30 * DAY },
        { exerciseId: 'today', at: NOW },
      ],
      NOW,
    )

    expect(ranked[0]?.score).toBeCloseTo(1, 6)
    expect(ranked[1]?.score).toBeCloseTo(1, 6)
  })

  it('has nothing to say about an exercise never trained', () => {
    expect(rankExerciseUsage([], NOW)).toEqual([])
  })
})

describe('describeUsage', () => {
  const usage = (sessions: number, daysAgo: number) =>
    rankExerciseUsage(weekly('x', sessions, daysAgo), NOW)[0]!

  it('reads as a count and an age', () => {
    expect(describeUsage(usage(12, 3), NOW)).toBe('12 sessions · 3d')
  })

  it('says one session, not 1 sessions', () => {
    expect(describeUsage(usage(1, 0), NOW)).toBe('1 session · today')
  })

  it('names yesterday rather than counting it', () => {
    expect(describeUsage(usage(2, 1), NOW)).toBe('2 sessions · yesterday')
  })

  it('coarsens as it gets older, because the precision stops mattering', () => {
    expect(describeUsage(usage(1, 20), NOW)).toBe('1 session · 3w')
    expect(describeUsage(usage(1, 90), NOW)).toBe('1 session · 3mo')
  })
})
