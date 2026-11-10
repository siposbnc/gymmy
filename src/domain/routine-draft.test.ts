import { describe, expect, it } from 'vitest'

import { deriveRoutineDraft, type DraftSource } from './routine-draft'
import type { SetEntry, SetType } from './types'

let serial = 0
const set = (weightKg: number | undefined, reps: number | undefined, type: SetType = 'normal'): SetEntry => ({
  id: `set_${(serial += 1)}`,
  sessionExerciseId: 'sex_1',
  setIndex: serial,
  type,
  completedAt: 1_700_000_000_000 + serial * 60_000,
  ...(weightKg == null ? {} : { weightKg }),
  ...(reps == null ? {} : { reps }),
})

const source = (overrides: Partial<DraftSource> = {}): DraftSource => ({
  exerciseId: 'bench-press',
  name: 'Bench Press',
  sets: [],
  ...overrides,
})

describe('deriveRoutineDraft', () => {
  it('counts the sets you actually worked, not the ones you planned', () => {
    const draft = deriveRoutineDraft({
      name: 'Push A',
      exercises: [
        source({
          // The plan asked for five; four were logged. Four is the truth.
          targetSets: 5,
          sets: [set(80, 8), set(80, 8), set(80, 7), set(80, 6)],
        }),
      ],
    })

    expect(draft.exercises[0]?.targetSets).toBe(4)
  })

  it('excludes warm-ups from the set count and the rep range', () => {
    const draft = deriveRoutineDraft({
      name: 'Push A',
      exercises: [
        source({
          sets: [set(40, 12, 'warmup'), set(60, 10, 'warmup'), set(80, 8), set(80, 7)],
        }),
      ],
    })

    const entry = draft.exercises[0]
    expect(entry?.targetSets).toBe(2)
    expect(entry?.targetRepsMin).toBe(7)
    expect(entry?.targetRepsMax).toBe(8)
    expect(entry?.targetWeight).toEqual({ kind: 'absolute', kg: 80 })
  })

  it('collapses a single rep count to a minimum with no range', () => {
    const draft = deriveRoutineDraft({
      name: 'Push A',
      exercises: [source({ sets: [set(80, 5), set(80, 5), set(80, 5)] })],
    })

    expect(draft.exercises[0]?.targetRepsMin).toBe(5)
    expect(draft.exercises[0]).not.toHaveProperty('targetRepsMax')
  })

  describe('target weight', () => {
    it('takes the weight when every set used the same one', () => {
      const draft = deriveRoutineDraft({
        name: 'Push A',
        exercises: [source({ sets: [set(80, 8), set(80, 8), set(80, 6)] })],
      })

      expect(draft.exercises[0]?.targetWeight).toEqual({ kind: 'absolute', kg: 80 })
      // Same weight throughout is straight sets; the dropped rep on the last
      // one is fatigue, and the rep range already says so.
      expect(draft.exercises[0]).not.toHaveProperty('setPlan')
    })

    it('keeps a climb as a climb instead of collapsing it to one number', () => {
      const draft = deriveRoutineDraft({
        name: 'Push A',
        exercises: [source({ sets: [set(60, 8), set(70, 6), set(80, 4)] })],
      })

      const entry = draft.exercises[0]
      // Every single answer the old vote could give was wrong here: 60 plans
      // the warm-up end, 80 asks for your top set three times, 70 is a weight
      // you did once. The ladder is just what happened.
      expect(entry).not.toHaveProperty('targetWeight')
      expect(entry?.setPlan).toEqual([
        { reps: 8, weight: { kind: 'absolute', kg: 60 } },
        { reps: 6, weight: { kind: 'absolute', kg: 70 } },
        { reps: 4, weight: { kind: 'absolute', kg: 80 } },
      ])
      // The summary everything else reads still describes it.
      expect(entry?.targetSets).toBe(3)
      expect(entry?.targetRepsMin).toBe(4)
      expect(entry?.targetRepsMax).toBe(8)
    })

    it('keeps a drop set at the end, rather than planning around it', () => {
      const draft = deriveRoutineDraft({
        name: 'Push A',
        exercises: [source({ sets: [set(80, 8), set(80, 8), set(80, 6), set(75, 8)] })],
      })

      expect(draft.exercises[0]?.setPlan).toHaveLength(4)
      expect(draft.exercises[0]?.setPlan?.at(-1)).toEqual({
        reps: 8,
        weight: { kind: 'absolute', kg: 75 },
      })
    })

    it('plans no weight at all rather than a zero', () => {
      const draft = deriveRoutineDraft({
        name: 'Pull A',
        exercises: [
          source({ exerciseId: 'pull-up', name: 'Pull-up', sets: [set(0, 10), set(undefined, 8)] }),
        ],
      })

      expect(draft.exercises[0]).not.toHaveProperty('targetWeight')
      expect(draft.exercises[0]?.targetRepsMin).toBe(8)
    })
  })

  it('carries rest, grouping and the AMRAP flag from the session snapshot', () => {
    const draft = deriveRoutineDraft({
      name: 'Push A',
      exercises: [
        source({ sets: [set(80, 8)], restSeconds: 210, supersetGroup: 1, isAmrap: true }),
        source({
          exerciseId: 'lateral-raise',
          name: 'Lateral Raise',
          sets: [set(10, 15)],
          supersetGroup: 1,
        }),
      ],
    })

    expect(draft.exercises[0]?.restSeconds).toBe(210)
    expect(draft.exercises[0]?.isAmrap).toBe(true)
    expect(draft.exercises.map((entry) => entry.supersetGroup)).toEqual([1, 1])
  })

  describe('exercises with nothing logged', () => {
    it('leaves them out and names them', () => {
      const draft = deriveRoutineDraft({
        name: 'Push A',
        exercises: [
          source({ sets: [set(80, 8)] }),
          source({ exerciseId: 'dip', name: 'Dip', sets: [] }),
          // Added, warmed up for, then abandoned. Still not work.
          source({ exerciseId: 'fly', name: 'Cable Fly', sets: [set(15, 12, 'warmup')] }),
        ],
      })

      expect(draft.exercises).toHaveLength(1)
      expect(draft.skipped).toEqual(['Dip', 'Cable Fly'])
    })

    it('closes the gap they leave in the order', () => {
      const draft = deriveRoutineDraft({
        name: 'Push A',
        exercises: [
          source({ sets: [] }),
          source({ exerciseId: 'dip', name: 'Dip', sets: [set(0, 10)] }),
          source({ exerciseId: 'fly', name: 'Cable Fly', sets: [set(15, 12)] }),
        ],
      })

      expect(draft.exercises.map((entry) => entry.order)).toEqual([0, 1])
    })

    it('does not leave a superset partner grouped on its own', () => {
      const draft = deriveRoutineDraft({
        name: 'Arms',
        exercises: [
          source({ exerciseId: 'curl', name: 'Curl', sets: [set(20, 10)], supersetGroup: 1 }),
          source({ exerciseId: 'skull', name: 'Skullcrusher', sets: [], supersetGroup: 1 }),
        ],
      })

      expect(draft.exercises).toHaveLength(1)
      expect(draft.exercises[0]).not.toHaveProperty('supersetGroup')
    })
  })

  it('never invents a volume goal', () => {
    const draft = deriveRoutineDraft({
      name: 'Push A',
      exercises: [source({ sets: [set(80, 8)] })],
    })

    // The draft carries exercises and a name. A goal is something you set, and
    // a brand-new routine has nothing to beat.
    expect(draft).not.toHaveProperty('volumeGoal')
  })

  it('falls back to a usable name when the session had none', () => {
    const draft = deriveRoutineDraft({ name: '   ', exercises: [source({ sets: [set(80, 8)] })] })
    expect(draft.name).toBe('New routine')
  })
})
