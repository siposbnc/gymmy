import { describe, expect, it } from 'vitest'

import {
  computeStreak,
  exerciseSeries,
  monthGrid,
  startOfDay,
  startOfWeek,
  trainingDays,
  weeklyVolume,
  type HistorySession,
  type HistorySet,
} from './history'
import type { MuscleGroup } from './types'

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY

/** A Monday, so week-start maths is easy to reason about. */
const MONDAY = new Date(2026, 9, 26, 10, 0, 0).getTime()

function set(
  sessionId: string,
  exerciseId: string,
  completedAt: number,
  weightKg: number,
  reps: number,
  type: HistorySet['type'] = 'normal',
): HistorySet {
  return { sessionId, exerciseId, completedAt, weightKg, reps, type }
}

const session = (id: string, startedAt: number, finished = true): HistorySession =>
  finished ? { id, startedAt, endedAt: startedAt + 3600_000 } : { id, startedAt }

describe('exerciseSeries', () => {
  it('gives one point per session, oldest first', () => {
    const sets = [
      set('s2', 'ex_squat', MONDAY, 140, 3),
      set('s1', 'ex_squat', MONDAY - WEEK, 135, 3),
    ]
    const sessions = [session('s1', MONDAY - WEEK), session('s2', MONDAY)]

    const points = exerciseSeries('ex_squat', sets, sessions)
    expect(points.map((point) => point.sessionId)).toEqual(['s1', 's2'])
    expect(points[1]?.topSetKg).toBe(140)
  })

  it('reports the heaviest set of the session as the top set', () => {
    const sets = [
      set('s1', 'ex_squat', MONDAY, 100, 8),
      set('s1', 'ex_squat', MONDAY + 1000, 140, 3),
      set('s1', 'ex_squat', MONDAY + 2000, 120, 5),
    ]
    const points = exerciseSeries('ex_squat', sets, [session('s1', MONDAY)])

    expect(points[0]?.topSetKg).toBe(140)
    expect(points[0]?.topSetReps).toBe(3)
  })

  it('leaves a gap rather than a flat line when no set qualifies for an estimate', () => {
    const sets = [set('s1', 'ex_squat', MONDAY, 60, 25)]
    const points = exerciseSeries('ex_squat', sets, [session('s1', MONDAY)])

    // 25 reps is past the cap, so there is simply no estimate for that session.
    expect(points[0]?.estimatedOneRepMax).toBeNull()
  })

  it('takes the best estimate across the session', () => {
    const sets = [
      set('s1', 'ex_squat', MONDAY, 100, 5), // 116.7
      set('s1', 'ex_squat', MONDAY + 1000, 140, 3), // 154
    ]
    const points = exerciseSeries('ex_squat', sets, [session('s1', MONDAY)])
    expect(points[0]?.estimatedOneRepMax).toBeCloseTo(154, 0)
  })

  it('excludes warm-ups from every figure', () => {
    const sets = [
      set('s1', 'ex_squat', MONDAY, 200, 1, 'warmup'),
      set('s1', 'ex_squat', MONDAY + 1000, 100, 5),
    ]
    const points = exerciseSeries('ex_squat', sets, [session('s1', MONDAY)])

    expect(points[0]?.topSetKg).toBe(100)
    expect(points[0]?.volumeKg).toBe(500)
  })

  it('ignores other exercises', () => {
    const sets = [
      set('s1', 'ex_squat', MONDAY, 140, 3),
      set('s1', 'ex_bench-press', MONDAY, 100, 5),
    ]
    const points = exerciseSeries('ex_squat', sets, [session('s1', MONDAY)])
    expect(points).toHaveLength(1)
    expect(points[0]?.volumeKg).toBe(420)
  })

  it('is empty for an exercise never trained', () => {
    expect(exerciseSeries('ex_squat', [], [])).toEqual([])
  })
})

describe('weeklyVolume', () => {
  const muscles = new Map<string, MuscleGroup>([
    ['ex_squat', 'quads'],
    ['ex_bench-press', 'chest'],
  ])

  it('buckets by week and splits by primary muscle', () => {
    const sets = [
      set('s1', 'ex_squat', MONDAY, 100, 5), // 500 quads
      set('s1', 'ex_bench-press', MONDAY, 80, 5), // 400 chest
      set('s2', 'ex_squat', MONDAY + 2 * DAY, 100, 5), // 500 quads, same week
      set('s3', 'ex_squat', MONDAY + WEEK, 110, 5), // 550 quads, next week
    ]

    const weeks = weeklyVolume(sets, muscles, 1)
    expect(weeks).toHaveLength(2)

    expect(weeks[0]?.totalKg).toBe(1400)
    expect(weeks[0]?.byMuscle.quads).toBe(1000)
    expect(weeks[0]?.byMuscle.chest).toBe(400)
    expect([...(weeks[0]?.sessionIds ?? [])].sort()).toEqual(['s1', 's2'])

    expect(weeks[1]?.totalKg).toBe(550)
  })

  it('credits the primary mover in full rather than inventing a split', () => {
    const weeks = weeklyVolume([set('s1', 'ex_bench-press', MONDAY, 100, 10)], muscles, 1)
    // 1000 kg of bench is 1000 kg of chest — not 600 chest / 300 triceps / 100
    // shoulders, which would look rigorous while being made up.
    expect(weeks[0]?.byMuscle.chest).toBe(1000)
    expect(Object.keys(weeks[0]!.byMuscle)).toEqual(['chest'])
  })

  it('excludes warm-ups', () => {
    const weeks = weeklyVolume(
      [set('s1', 'ex_squat', MONDAY, 60, 10, 'warmup'), set('s1', 'ex_squat', MONDAY, 100, 5)],
      muscles,
      1,
    )
    expect(weeks[0]?.totalKg).toBe(500)
  })

  it('handles an exercise with no known muscle without losing the total', () => {
    const weeks = weeklyVolume([set('s1', 'ex_mystery', MONDAY, 50, 10)], muscles, 1)
    expect(weeks[0]?.totalKg).toBe(500)
    expect(weeks[0]?.byMuscle).toEqual({})
  })
})

describe('computeStreak', () => {
  const weekly = (weeksAgo: number, count: number): HistorySession[] =>
    Array.from({ length: count }, (_, index) =>
      session(`w${weeksAgo}-${index}`, MONDAY - weeksAgo * WEEK + index * DAY),
    )

  it('counts consecutive weeks that met the goal', () => {
    const sessions = [...weekly(1, 3), ...weekly(2, 3), ...weekly(3, 3)]
    const streak = computeStreak(sessions, 3, 1, MONDAY)
    expect(streak.weeks).toBe(3)
  })

  it('stops at the first week that fell short', () => {
    const sessions = [...weekly(1, 3), ...weekly(2, 1), ...weekly(3, 3)]
    expect(computeStreak(sessions, 3, 1, MONDAY).weeks).toBe(1)
  })

  it('does not let the current week break the streak', () => {
    // Three good weeks behind, and today is Monday with nothing logged yet.
    const sessions = [...weekly(1, 3), ...weekly(2, 3)]
    const streak = computeStreak(sessions, 3, 1, MONDAY)

    expect(streak.weeks).toBe(2)
    expect(streak.thisWeek).toBe(0)
    expect(streak.currentWeekMet).toBe(false)
  })

  it('reports progress through the current week', () => {
    const sessions = [...weekly(0, 2), ...weekly(1, 3)]
    const streak = computeStreak(sessions, 3, 1, MONDAY + 3 * DAY)

    expect(streak.thisWeek).toBe(2)
    expect(streak.currentWeekMet).toBe(false)
    expect(streak.weeks).toBe(1)
  })

  it('ignores sessions that were never finished', () => {
    const unfinished = [session('a', MONDAY - WEEK, false), session('b', MONDAY - WEEK, false)]
    expect(computeStreak([...weekly(1, 1), ...unfinished], 3, 1, MONDAY).weeks).toBe(0)
  })

  it('treats a goal of zero as one', () => {
    expect(computeStreak(weekly(1, 1), 0, 1, MONDAY).goal).toBe(1)
  })

  it('is zero with no history', () => {
    expect(computeStreak([], 3, 1, MONDAY)).toMatchObject({ weeks: 0, thisWeek: 0 })
  })
})

describe('calendar helpers', () => {
  it('finds the start of the week for both week-start conventions', () => {
    const wednesday = new Date(2026, 9, 28, 15, 0, 0).getTime()

    expect(new Date(startOfWeek(wednesday, 1)).getDay()).toBe(1) // Monday
    expect(new Date(startOfWeek(wednesday, 0)).getDay()).toBe(0) // Sunday
    expect(new Date(startOfWeek(wednesday, 1)).getHours()).toBe(0)
  })

  it('marks only the days that have a finished session', () => {
    const days = trainingDays([
      session('a', MONDAY),
      session('b', MONDAY + 2 * DAY),
      session('c', MONDAY + 4 * DAY, false),
    ])

    expect(days.has(startOfDay(MONDAY))).toBe(true)
    expect(days.has(startOfDay(MONDAY + 2 * DAY))).toBe(true)
    expect(days.has(startOfDay(MONDAY + 4 * DAY))).toBe(false)
  })

  it('pads a month to whole weeks', () => {
    const grid = monthGrid(2026, 9, 1) // October 2026
    expect(grid.length % 7).toBe(0)
    expect(new Date(grid[0]!).getDay()).toBe(1)

    // Every day of the month is present exactly once.
    const october = grid.filter((day) => new Date(day).getMonth() === 9)
    expect(october).toHaveLength(31)
    expect(new Set(grid).size).toBe(grid.length)
  })

  it('produces contiguous days across a month boundary', () => {
    const grid = monthGrid(2026, 10, 1) // November 2026
    for (let index = 1; index < grid.length; index += 1) {
      const gap = grid[index]! - grid[index - 1]!
      // Allows for DST shifting a "day" to 23 or 25 hours.
      expect(gap).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000)
      expect(gap).toBeLessThanOrEqual(25 * 60 * 60 * 1000)
    }
  })
})
