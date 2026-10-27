import { describe, expect, it } from 'vitest'

import {
  computeStreak,
  exerciseSeries,
  weeklyVolume,
  type HistorySession,
  type HistorySet,
} from './history'
import { computeRecords, type RecordSet } from './records'
import type { MuscleGroup } from './types'

/**
 * Guards against the aggregations degrading on a real training history.
 *
 * Gymmy reads the whole history to build the progress screen — there is no
 * server to pre-aggregate on, and no incremental cache, because recomputing
 * from scratch is what keeps records correct after an edit. That tradeoff is
 * only acceptable while "the whole history" stays cheap to walk.
 *
 * Five years of serious training is roughly 750 sessions at 25 sets each.
 * These bounds are deliberately loose — they exist to catch an accidental
 * O(n²), not to police milliseconds on a shared CI box.
 */

const DAY = 86_400_000
const SESSIONS = 750
const SETS_PER_SESSION = 25
const EXERCISES = ['ex_squat', 'ex_bench-press', 'ex_deadlift', 'ex_overhead-press', 'ex_barbell-row']

function buildHistory() {
  const sessions: HistorySession[] = []
  const sets: HistorySet[] = []
  const start = Date.now() - SESSIONS * 2 * DAY

  for (let s = 0; s < SESSIONS; s += 1) {
    const startedAt = start + s * 2 * DAY
    const id = `ses_${s}`
    sessions.push({ id, startedAt, endedAt: startedAt + 3_600_000 })

    for (let i = 0; i < SETS_PER_SESSION; i += 1) {
      sets.push({
        sessionId: id,
        exerciseId: EXERCISES[i % EXERCISES.length]!,
        completedAt: startedAt + i * 120_000,
        type: i % 6 === 0 ? 'warmup' : 'normal',
        weightKg: 60 + ((s * 2.5 + i) % 80),
        reps: 3 + (i % 8),
      })
    }
  }

  return { sessions, sets }
}

const { sessions, sets } = buildHistory()
const TOTAL_SETS = SESSIONS * SETS_PER_SESSION

function time(label: string, run: () => unknown): number {
  const started = performance.now()
  run()
  const elapsed = performance.now() - started
  // Surfaced on failure, and useful when tuning.
  if (process.env.PERF_LOG) console.log(`${label}: ${elapsed.toFixed(1)}ms`)
  return elapsed
}

describe(`aggregations over ${TOTAL_SETS.toLocaleString()} sets`, () => {
  it('builds a per-exercise series fast enough to feel instant', () => {
    const elapsed = time('exerciseSeries', () => exerciseSeries('ex_squat', sets, sessions))
    expect(elapsed).toBeLessThan(500)

    const points = exerciseSeries('ex_squat', sets, sessions)
    expect(points.length).toBeGreaterThan(100)
    // Sorted oldest-first, which the chart depends on.
    expect(points.every((point, i) => i === 0 || point.at >= points[i - 1]!.at)).toBe(true)
  })

  it('buckets weekly volume fast enough', () => {
    const muscles = new Map<string, MuscleGroup>(
      EXERCISES.map((id, index) => [
        id,
        (['quads', 'chest', 'back', 'shoulders', 'lats'] as const)[index]!,
      ]),
    )
    const elapsed = time('weeklyVolume', () => weeklyVolume(sets, muscles, 1))
    expect(elapsed).toBeLessThan(500)

    expect(weeklyVolume(sets, muscles, 1).length).toBeGreaterThan(100)
  })

  it('computes a streak without walking every week twice', () => {
    const elapsed = time('computeStreak', () => computeStreak(sessions, 3, 1))
    expect(elapsed).toBeLessThan(250)
  })

  it('recomputes records for one exercise fast enough', () => {
    const recordSets: RecordSet[] = sets
      .filter((set) => set.exerciseId === 'ex_squat')
      .map((set, index) => ({
        id: `set_${index}`,
        sessionId: set.sessionId,
        completedAt: set.completedAt,
        type: set.type,
        weightKg: set.weightKg,
        reps: set.reps,
      }))

    const elapsed = time('computeRecords', () => computeRecords('ex_squat', recordSets))
    expect(elapsed).toBeLessThan(500)

    // And the per-weight rule keeps the record count bounded by distinct
    // weights rather than growing with every session logged.
    const records = computeRecords('ex_squat', recordSets)
    expect(records.length).toBeLessThan(200)
  })

  it('stays linear — ten times the data is not a hundred times the work', () => {
    const tenth = sets.slice(0, Math.floor(sets.length / 10))

    const small = time('series 1/10', () => exerciseSeries('ex_squat', tenth, sessions))
    const full = time('series full', () => exerciseSeries('ex_squat', sets, sessions))

    // A quadratic implementation would blow straight past this. The generous
    // ceiling absorbs timer noise on a small sample.
    expect(full).toBeLessThan(Math.max(small, 1) * 30 + 200)
  })
})
