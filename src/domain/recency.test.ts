import { describe, expect, it } from 'vitest'

import {
  describeLastRun,
  describeRecency,
  lastRunByRoutine,
  muscleRecency,
  RECENCY_WINDOW_DAYS,
  type RecencySet,
} from './recency'
import type { MuscleGroup } from './types'

const NOW = Date.UTC(2026, 10, 8)
const DAY = 86_400_000

const PRIMARY = new Map<string, MuscleGroup>([
  ['bench', 'chest'],
  ['fly', 'chest'],
  ['row', 'back'],
  ['squat', 'quads'],
  ['curl', 'biceps'],
])

/** One working set of an exercise, `daysAgo` old. */
function set(exerciseId: string, daysAgo: number, overrides: Partial<RecencySet> = {}): RecencySet {
  return {
    exerciseId,
    completedAt: NOW - daysAgo * DAY,
    type: 'normal',
    reps: 8,
    ...overrides,
  }
}

describe('muscleRecency', () => {
  it('orders the longest rested first, which is the whole recommendation', () => {
    const entries = muscleRecency(
      [set('squat', 9), set('bench', 2), set('row', 5)],
      PRIMARY,
      [],
      NOW,
    )

    expect(entries.map((entry) => entry.muscle)).toEqual(['quads', 'back', 'chest'])
    expect(entries.map((entry) => entry.daysSince)).toEqual([9, 5, 2])
  })

  it('takes the most recent set for a muscle, across exercises', () => {
    const entries = muscleRecency([set('bench', 6), set('fly', 1)], PRIMARY, [], NOW)

    expect(entries).toHaveLength(1)
    expect(entries[0]?.muscle).toBe('chest')
    expect(entries[0]?.daysSince).toBe(1)
  })

  it('does not count a warm-up as training the muscle', () => {
    const entries = muscleRecency(
      [set('bench', 7), set('bench', 0, { type: 'warmup' })],
      PRIMARY,
      [],
      NOW,
    )

    expect(entries[0]?.daysSince).toBe(7)
  })

  it('does not count a set with no reps', () => {
    const entries = muscleRecency(
      [set('bench', 7), set('bench', 0, { reps: undefined })],
      PRIMARY,
      [],
      NOW,
    )

    expect(entries[0]?.daysSince).toBe(7)
  })

  it('counts a dropset and a set taken to failure — they are working sets', () => {
    const entries = muscleRecency(
      [set('bench', 7), set('bench', 3, { type: 'dropset' }), set('row', 2, { type: 'failure' })],
      PRIMARY,
      [],
      NOW,
    )

    expect(entries.find((entry) => entry.muscle === 'chest')?.daysSince).toBe(3)
    expect(entries.find((entry) => entry.muscle === 'back')?.daysSince).toBe(2)
  })

  it('lists a muscle trained before the window, with no date rather than a guess', () => {
    const entries = muscleRecency([set('bench', 3)], PRIMARY, ['squat'], NOW)

    // And first: half a year is the longest rest on the list by definition.
    expect(entries.map((entry) => entry.muscle)).toEqual(['quads', 'chest'])
    expect(entries[0]?.lastTrainedAt).toBeNull()
    expect(entries[0]?.daysSince).toBeNull()
  })

  it('says nothing about a muscle with no history at all', () => {
    const entries = muscleRecency([set('bench', 1)], PRIMARY, ['bench'], NOW)

    expect(entries.map((entry) => entry.muscle)).toEqual(['chest'])
  })

  it('is empty on a fresh install', () => {
    expect(muscleRecency([], PRIMARY, [], NOW)).toEqual([])
  })

  it('breaks ties in anatomical order, so the list does not twitch', () => {
    const entries = muscleRecency([set('bench', 4), set('row', 4), set('curl', 4)], PRIMARY, [], NOW)

    expect(entries.map((entry) => entry.muscle)).toEqual(['chest', 'back', 'biceps'])
  })

  it('clamps a set logged in the future rather than reporting negative days', () => {
    const entries = muscleRecency([set('bench', -2)], PRIMARY, [], NOW)

    expect(entries[0]?.daysSince).toBe(0)
  })

  it('ignores an exercise whose muscle is unknown', () => {
    expect(muscleRecency([set('mystery', 1)], PRIMARY, ['mystery'], NOW)).toEqual([])
  })
})

describe('describeRecency', () => {
  const entry = (daysAgo: number | null) => ({
    muscle: 'chest' as const,
    lastTrainedAt: daysAgo == null ? null : NOW - daysAgo * DAY,
    daysSince: daysAgo,
  })

  it('names today and yesterday, then counts', () => {
    expect(describeRecency(entry(0), NOW)).toBe('today')
    expect(describeRecency(entry(1), NOW)).toBe('yesterday')
    expect(describeRecency(entry(6), NOW)).toBe('6d')
  })

  it('loses precision as it gets older, because the decision does too', () => {
    expect(describeRecency(entry(21), NOW)).toBe('3w')
    expect(describeRecency(entry(90), NOW)).toBe('3mo')
  })

  it('reports beyond the window as a bound, not a number', () => {
    expect(describeRecency(entry(null), NOW)).toBe('6mo+')
    // The copy and the query cutoff come from the same constant.
    expect(RECENCY_WINDOW_DAYS).toBe(180)
  })
})

describe('lastRunByRoutine', () => {
  it('takes the most recent finished run of each routine', () => {
    const runs = lastRunByRoutine([
      { routineId: 'push', startedAt: NOW - 9 * DAY, endedAt: NOW - 9 * DAY },
      { routineId: 'push', startedAt: NOW - 2 * DAY, endedAt: NOW - 2 * DAY },
      { routineId: 'pull', startedAt: NOW - 5 * DAY, endedAt: NOW - 5 * DAY },
    ])

    expect(runs.get('push')).toBe(NOW - 2 * DAY)
    expect(runs.get('pull')).toBe(NOW - 5 * DAY)
  })

  it('ignores a session still in progress — that is not a workout you did', () => {
    const runs = lastRunByRoutine([
      { routineId: 'push', startedAt: NOW - 9 * DAY, endedAt: NOW - 9 * DAY },
      { routineId: 'push', startedAt: NOW },
    ])

    expect(runs.get('push')).toBe(NOW - 9 * DAY)
  })

  it('ignores a freestyle session, which belongs to no routine', () => {
    expect(lastRunByRoutine([{ startedAt: NOW, endedAt: NOW }]).size).toBe(0)
  })
})

describe('describeLastRun', () => {
  it('adds "ago" only where it reads as English', () => {
    expect(describeLastRun(NOW, NOW)).toBe('today')
    expect(describeLastRun(NOW - DAY, NOW)).toBe('yesterday')
    expect(describeLastRun(NOW - 5 * DAY, NOW)).toBe('5d ago')
  })

  it('says nothing about a routine that has never been run', () => {
    expect(describeLastRun(undefined, NOW)).toBeNull()
  })
})
