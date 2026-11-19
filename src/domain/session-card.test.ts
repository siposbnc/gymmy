import { describe, expect, it } from 'vitest'

import { buildSessionCard, CARD_LINE_LIMIT, type SessionCardInput } from './session-card'
import type { SetEntry, SetType } from './types'

const START = Date.UTC(2026, 10, 11, 18, 0)

let counter = 0
function set(weightKg: number | undefined, reps: number, type: SetType = 'normal'): SetEntry {
  counter += 1
  return {
    id: `set_${counter}`,
    sessionExerciseId: 'sex_1',
    setIndex: counter,
    ...(weightKg == null ? {} : { weightKg }),
    reps,
    type,
    completedAt: START,
  }
}

function build(
  exercises: SessionCardInput['exercises'],
  recordExerciseIds: readonly string[] = [],
) {
  return buildSessionCard({
    session: { name: 'Push A', startedAt: START, endedAt: START + 3_600_000 },
    exercises,
    recordExerciseIds,
  })
}

describe('buildSessionCard', () => {
  it('counts a dropset as one set but keeps every drop in the volume', () => {
    const card = build([
      {
        exerciseId: 'ex_bench',
        name: 'Bench Press',
        sets: [set(60, 8), set(60, 8), set(45, 6, 'dropset'), set(30, 9, 'dropset')],
      },
    ])

    expect(card.workingSets).toBe(2)
    expect(card.volumeKg).toBe(480 + 480 + 270 + 270)
    // The top set, so the drops cannot become the number on the card.
    expect(card.lines[0]).toMatchObject({ weightKg: 60, reps: 8 })
  })

  it('shows the top set of each exercise, not the last one', () => {
    const card = build([
      {
        exerciseId: 'ex_bench',
        name: 'Bench Press',
        // A back-off set after the heavy one is the usual shape, and it is not
        // the number you would tell anyone about.
        sets: [set(80, 8), set(82.5, 6), set(60, 12)],
      },
    ])

    expect(card.lines).toEqual([
      { name: 'Bench Press', weightKg: 82.5, reps: 6, isRecord: false },
    ])
  })

  it('breaks a tie on weight with the better set', () => {
    const card = build([
      { exerciseId: 'ex_bench', name: 'Bench Press', sets: [set(80, 6), set(80, 9)] },
    ])

    expect(card.lines[0]?.reps).toBe(9)
  })

  it('leaves warm-ups out, as volume and records do', () => {
    const card = build([
      {
        exerciseId: 'ex_squat',
        name: 'Squat',
        sets: [set(140, 3, 'warmup'), set(100, 5)],
      },
    ])

    expect(card.lines[0]?.weightKg).toBe(100)
    expect(card.workingSets).toBe(1)
  })

  it('gives an exercise with nothing but warm-ups no row at all', () => {
    const card = build([
      { exerciseId: 'ex_squat', name: 'Squat', sets: [set(60, 10, 'warmup')] },
      { exerciseId: 'ex_bench', name: 'Bench Press', sets: [set(80, 8)] },
    ])

    expect(card.lines.map((line) => line.name)).toEqual(['Bench Press'])
  })

  it('carries bodyweight work with no weight rather than a zero', () => {
    const card = build([{ exerciseId: 'ex_pullup', name: 'Pull-up', sets: [set(undefined, 12)] }])

    expect(card.lines[0]).not.toHaveProperty('weightKg')
    expect(card.lines[0]?.reps).toBe(12)
  })

  it('keeps the order the workout was done in', () => {
    const card = build([
      { exerciseId: 'ex_bench', name: 'Bench Press', sets: [set(80, 8)] },
      { exerciseId: 'ex_fly', name: 'Cable Fly', sets: [set(20, 12)] },
      { exerciseId: 'ex_squat', name: 'Squat', sets: [set(140, 5)] },
    ])

    // Not sorted by weight: that would turn the card into a leaderboard of
    // your own session and lose the shape of the workout.
    expect(card.lines.map((line) => line.name)).toEqual(['Bench Press', 'Cable Fly', 'Squat'])
  })

  it('caps the rows and counts what did not fit', () => {
    const card = build(
      Array.from({ length: 8 }, (_unused, index) => ({
        exerciseId: `ex_${index}`,
        name: `Exercise ${index}`,
        sets: [set(50, 10)],
      })),
    )

    expect(card.lines).toHaveLength(CARD_LINE_LIMIT)
    expect(card.hiddenExercises).toBe(3)
  })

  it('says nothing about hidden exercises when the card is complete', () => {
    const card = build([{ exerciseId: 'ex_bench', name: 'Bench Press', sets: [set(80, 8)] }])

    expect(card.hiddenExercises).toBe(0)
  })

  it('marks the exercises that earned a record', () => {
    const card = build(
      [
        { exerciseId: 'ex_bench', name: 'Bench Press', sets: [set(82.5, 8)] },
        { exerciseId: 'ex_fly', name: 'Cable Fly', sets: [set(20, 12)] },
      ],
      ['ex_bench'],
    )

    expect(card.lines.map((line) => line.isRecord)).toEqual([true, false])
    expect(card.recordCount).toBe(1)
  })

  it('totals the session the same way the summary screen does', () => {
    const card = build([
      { exerciseId: 'ex_bench', name: 'Bench Press', sets: [set(80, 8), set(80, 7)] },
      { exerciseId: 'ex_squat', name: 'Squat', sets: [set(100, 5), set(60, 10, 'warmup')] },
    ])

    expect(card.workingSets).toBe(3)
    expect(card.volumeKg).toBe(80 * 8 + 80 * 7 + 100 * 5)
    expect(card.durationSeconds).toBe(3600)
  })

  it('reports no duration for a session that never finished', () => {
    const card = buildSessionCard({
      session: { name: 'Push A', startedAt: START },
      exercises: [],
      recordExerciseIds: [],
    })

    expect(card.durationSeconds).toBeNull()
    expect(card.lines).toEqual([])
  })
})
