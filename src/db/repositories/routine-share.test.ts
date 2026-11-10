import { beforeEach, describe, expect, it } from 'vitest'

import { ShareCodeError } from '~/domain/routine-share'

import { db } from '../schema'
import { bootstrapDatabase } from '../seed'
import { createCustomExercise } from './exercises'
import {
  buildRoutineShareCode,
  importRoutinePlan,
  planRoutineImport,
} from './routine-share'
import {
  addExerciseToRoutine,
  createRoutine,
  listRoutineExercises,
  setRoutineVolumeGoal,
  toggleSupersetWithPrevious,
  updateRoutineExercise,
} from './routines'

describe('routine share codes', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrapDatabase()
  })

  async function buildPushA() {
    const id = await createRoutine('Push A')
    const bench = await addExerciseToRoutine(id, 'ex_bench-press')
    const fly = await addExerciseToRoutine(id, 'ex_cable-fly')
    await updateRoutineExercise(bench, {
      targetSets: 4,
      targetRepsMin: 5,
      targetRepsMax: 8,
      isAmrap: true,
      targetWeight: { kind: 'absolute', kg: 100 },
      restSeconds: 210,
      notes: 'Pause on the chest',
    })
    return { id, bench, fly }
  }

  /**
   * The recipient's device: everything the sender has is gone, but the seeded
   * library is there — which is what a second phone actually looks like.
   */
  async function wipeUserData() {
    await db.routines.clear()
    await db.routineExercises.clear()
    await customExercises().delete()
  }

  /**
   * Filtered in JS rather than through the `isCustom` index: IndexedDB cannot
   * key on a boolean, so that index never matches anything.
   */
  const customExercises = () => db.exercises.filter((exercise) => exercise.isCustom)

  it('round-trips a routine onto a device that has never seen it', async () => {
    const { id } = await buildPushA()
    await setRoutineVolumeGoal(id, { kind: 'beat_last' })
    const code = await buildRoutineShareCode(id)

    await wipeUserData()
    expect(await db.routines.count()).toBe(0)

    const { routineId } = await importRoutinePlan(await planRoutineImport(code))
    const routine = await db.routines.get(routineId)
    const entries = await listRoutineExercises(routineId)

    expect(routine?.name).toBe('Push A')
    expect(routine?.volumeGoal).toEqual({ kind: 'beat_last' })
    expect(entries.map((entry) => entry.exerciseId)).toEqual(['ex_bench-press', 'ex_cable-fly'])
    expect(entries[0]).toMatchObject({
      order: 0,
      targetSets: 4,
      targetRepsMin: 5,
      targetRepsMax: 8,
      isAmrap: true,
      targetWeight: { kind: 'absolute', kg: 100 },
      restSeconds: 210,
      notes: 'Pause on the chest',
    })
  })

  it('carries superset grouping', async () => {
    const { id, fly } = await buildPushA()
    await toggleSupersetWithPrevious(fly)
    const code = await buildRoutineShareCode(id)

    await wipeUserData()
    const { routineId } = await importRoutinePlan(await planRoutineImport(code))

    const entries = await listRoutineExercises(routineId)
    expect(entries[0]?.supersetGroup).toBeDefined()
    expect(entries[1]?.supersetGroup).toBe(entries[0]?.supersetGroup)
  })

  it('produces a code short enough to paste into a message', async () => {
    const id = await createRoutine('Full body A')
    for (const slug of [
      'ex_squat',
      'ex_bench-press',
      'ex_barbell-row',
      'ex_overhead-press',
      'ex_romanian-deadlift',
      'ex_cable-fly',
    ]) {
      await addExerciseToRoutine(id, slug)
    }

    const code = await buildRoutineShareCode(id)
    // Six exercises, each with the definition needed to rebuild it. That is
    // 1772 characters of JSON; this is the reason deflate is in the pipeline
    // and the reason seeded descriptions are not in the payload.
    expect(code.length).toBeLessThan(700)
    expect(code).toMatch(/^GYMMY-R1\.[A-Za-z0-9_-]+$/)
  })

  describe('an exercise the recipient does not have', () => {
    async function shareARoutineWithACustomExercise() {
      const exerciseId = await createCustomExercise({
        name: 'Landmine Press',
        muscleGroups: ['shoulders', 'triceps'],
        equipment: 'barbell',
        movementType: 'compound',
        trackingType: 'weight_reps',
        defaultRestSeconds: 120,
        barId: 'bar_default',
        machineWeightKg: 25,
        notes: 'Left shoulder prefers this to overhead',
      })

      const id = await createRoutine('Shoulder day')
      await addExerciseToRoutine(id, exerciseId)
      return { code: await buildRoutineShareCode(id), exerciseId }
    }

    it('is created from the definition the code carried', async () => {
      const { code, exerciseId } = await shareARoutineWithACustomExercise()
      await wipeUserData()
      expect(await db.exercises.get(exerciseId)).toBeUndefined()

      const plan = await planRoutineImport(code)
      expect(plan.entries[0]?.create?.name).toBe('Landmine Press')

      const { created, routineId } = await importRoutinePlan(plan)
      expect(created).toBe(1)

      const exercise = await db.exercises.get(exerciseId)
      expect(exercise).toMatchObject({
        name: 'Landmine Press',
        muscleGroups: ['shoulders', 'triceps'],
        equipment: 'barbell',
        isCustom: true,
      })
      // The sender's bar, their machine, and their private notes are not
      // theirs to share — all three describe a gym, not a plan.
      expect(exercise).not.toHaveProperty('barId')
      expect(exercise).not.toHaveProperty('machineWeightKg')
      expect(exercise).not.toHaveProperty('notes')

      const entries = await listRoutineExercises(routineId)
      expect(entries[0]?.exerciseId).toBe(exerciseId)
    })

    it('is not duplicated when the same code is imported twice', async () => {
      const { code } = await shareARoutineWithACustomExercise()
      await wipeUserData()

      await importRoutinePlan(await planRoutineImport(code))
      const second = await importRoutinePlan(await planRoutineImport(code))

      // A second routine, deliberately — but no second exercise.
      expect(second.created).toBe(0)
      expect(await db.exercises.where('name').equals('Landmine Press').count()).toBe(1)
      expect(await db.routines.count()).toBe(2)
    })

    it('is matched by name rather than duplicated when you already built it yourself', async () => {
      const { code } = await shareARoutineWithACustomExercise()
      await wipeUserData()

      const mine = await createCustomExercise({
        name: 'landmine press',
        muscleGroups: ['shoulders'],
        equipment: 'barbell',
        movementType: 'compound',
        trackingType: 'weight_reps',
        defaultRestSeconds: 90,
      })

      const plan = await planRoutineImport(code)
      const { created, routineId } = await importRoutinePlan(plan)

      expect(created).toBe(0)
      expect(await customExercises().count()).toBe(1)
      const entries = await listRoutineExercises(routineId)
      expect(entries[0]?.exerciseId).toBe(mine)
    })
  })

  it('imports a routine whose built-in exercise this build has never heard of', async () => {
    // The sender is on a newer app with an exercise this seed library lacks.
    // The carried definition is what keeps the routine from arriving broken.
    const exerciseId = await createCustomExercise({
      name: 'Jefferson Curl',
      muscleGroups: ['hamstrings', 'core'],
      equipment: 'barbell',
      movementType: 'compound',
      trackingType: 'weight_reps',
      defaultRestSeconds: 90,
    })
    const id = await createRoutine('Mobility')
    await addExerciseToRoutine(id, exerciseId)
    const code = await buildRoutineShareCode(id)

    await wipeUserData()
    const { routineId } = await importRoutinePlan(await planRoutineImport(code))

    const entries = await listRoutineExercises(routineId)
    const exercise = await db.exercises.get(entries[0]!.exerciseId)
    expect(exercise?.name).toBe('Jefferson Curl')
  })

  it('writes nothing until the plan is committed', async () => {
    const { code } = await (async () => {
      const exerciseId = await createCustomExercise({
        name: 'Zercher Squat',
        muscleGroups: ['quads'],
        equipment: 'barbell',
        movementType: 'compound',
        trackingType: 'weight_reps',
        defaultRestSeconds: 180,
      })
      const id = await createRoutine('Legs')
      await addExerciseToRoutine(id, exerciseId)
      return { code: await buildRoutineShareCode(id) }
    })()

    await wipeUserData()
    await planRoutineImport(code)

    // Previewing is a read. Nothing lands in the library until you say yes.
    expect(await db.routines.count()).toBe(0)
    expect(await customExercises().count()).toBe(0)
  })

  describe('bad input', () => {
    it('refuses to share an empty routine', async () => {
      const id = await createRoutine('Nothing yet')
      await expect(buildRoutineShareCode(id)).rejects.toThrow(/add an exercise/i)
    })

    it('explains a paste that is not a code', async () => {
      await expect(planRoutineImport('hey can you send me your push day')).rejects.toThrow(
        ShareCodeError,
      )
    })

    it('explains a code that arrived truncated', async () => {
      const { id } = await buildPushA()
      const code = await buildRoutineShareCode(id)

      await expect(planRoutineImport(code.slice(0, code.length - 12))).rejects.toThrow(
        /incomplete/i,
      )
    })

    it('explains a code that is valid base64 but not a deflate stream', async () => {
      await expect(planRoutineImport('GYMMY-R1.aaaaaaaaaaaaaaaa')).rejects.toThrow(ShareCodeError)
    })
  })
})
