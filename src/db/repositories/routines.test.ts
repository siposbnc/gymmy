import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '../schema'
import { bootstrapDatabase } from '../seed'
import {
  addExerciseToRoutine,
  archiveRoutine,
  clearRoutineTargetWeight,
  createRoutine,
  deleteRoutine,
  duplicateRoutine,
  listRoutineExercises,
  listRoutines,
  moveRoutineExercise,
  removeRoutineExercise,
  renameRoutine,
  startSessionFromRoutine,
  toggleSupersetWithPrevious,
  unarchiveRoutine,
  updateRoutineExercise,
} from './routines'
import {
  addExerciseToSession,
  finishSession,
  listSessionExercises,
  startEmptySession,
} from './sessions'

describe('routines', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrapDatabase()
  })

  async function buildPushA() {
    const id = await createRoutine('Push A')
    const bench = await addExerciseToRoutine(id, 'ex_bench-press')
    const incline = await addExerciseToRoutine(id, 'ex_incline-dumbbell-press')
    const fly = await addExerciseToRoutine(id, 'ex_cable-fly')
    await updateRoutineExercise(bench, {
      targetSets: 4,
      targetRepsMin: 5,
      targetWeight: { kind: 'absolute', kg: 100 },
    })
    return { id, bench, incline, fly }
  }

  describe('building a plan', () => {
    it('adds exercises in order with sensible defaults', async () => {
      const { id } = await buildPushA()
      const entries = await listRoutineExercises(id)

      expect(entries.map((entry) => entry.order)).toEqual([0, 1, 2])
      // Cable fly keeps the default 3×8 it was given on add.
      expect(entries[2]).toMatchObject({ targetSets: 3, targetRepsMin: 8, isAmrap: false })
      // Rest comes from the exercise, not a global constant.
      expect(entries[0]?.restSeconds).toBe(180)
      expect(entries[2]?.restSeconds).toBe(60)
    })

    it('reorders without leaving gaps', async () => {
      const { id, fly } = await buildPushA()
      await moveRoutineExercise(fly, -1)

      const entries = await listRoutineExercises(id)
      expect(entries.map((entry) => entry.exerciseId)).toEqual([
        'ex_bench-press',
        'ex_cable-fly',
        'ex_incline-dumbbell-press',
      ])
      expect(entries.map((entry) => entry.order)).toEqual([0, 1, 2])
    })

    it('will not move past either end', async () => {
      const { id, bench } = await buildPushA()
      await moveRoutineExercise(bench, -1)
      const entries = await listRoutineExercises(id)
      expect(entries[0]?.exerciseId).toBe('ex_bench-press')
    })

    it('renumbers after a removal', async () => {
      const { id, incline } = await buildPushA()
      await removeRoutineExercise(incline)

      const entries = await listRoutineExercises(id)
      expect(entries.map((entry) => entry.order)).toEqual([0, 1])
      expect(entries.map((entry) => entry.exerciseId)).toEqual([
        'ex_bench-press',
        'ex_cable-fly',
      ])
    })

    it('clears a target weight rather than storing a zero', async () => {
      const { id, bench } = await buildPushA()
      await clearRoutineTargetWeight(bench)

      const entries = await listRoutineExercises(id)
      expect(entries[0]?.targetWeight).toBeUndefined()
      expect('targetWeight' in entries[0]!).toBe(false)
    })
  })

  describe('supersets', () => {
    it('groups an exercise with the one above it', async () => {
      const { id, incline } = await buildPushA()
      await toggleSupersetWithPrevious(incline)

      const entries = await listRoutineExercises(id)
      expect(entries[0]?.supersetGroup).toBeDefined()
      expect(entries[1]?.supersetGroup).toBe(entries[0]?.supersetGroup)
      expect(entries[2]?.supersetGroup).toBeUndefined()
    })

    it('extends an existing group rather than starting a new one', async () => {
      const { id, incline, fly } = await buildPushA()
      await toggleSupersetWithPrevious(incline)
      await toggleSupersetWithPrevious(fly)

      const entries = await listRoutineExercises(id)
      const groups = new Set(entries.map((entry) => entry.supersetGroup))
      expect(groups.size).toBe(1)
    })

    it('splits an exercise back out', async () => {
      const { id, incline } = await buildPushA()
      await toggleSupersetWithPrevious(incline)
      await toggleSupersetWithPrevious(incline)

      const entries = await listRoutineExercises(id)
      expect(entries[1]?.supersetGroup).toBeUndefined()
    })

    it('does nothing for the first exercise', async () => {
      const { id, bench } = await buildPushA()
      await toggleSupersetWithPrevious(bench)
      const entries = await listRoutineExercises(id)
      expect(entries[0]?.supersetGroup).toBeUndefined()
    })
  })

  describe('duplicate and archive', () => {
    it('copies every exercise and target', async () => {
      const { id } = await buildPushA()
      const copyId = await duplicateRoutine(id)

      const original = await listRoutineExercises(id)
      const copy = await listRoutineExercises(copyId)

      expect(copy).toHaveLength(original.length)
      expect(copy.map((entry) => entry.exerciseId)).toEqual(
        original.map((entry) => entry.exerciseId),
      )
      expect(copy[0]?.targetWeight).toEqual({ kind: 'absolute', kg: 100 })

      // Independent rows — editing the copy must not touch the original.
      expect(copy[0]?.id).not.toBe(original[0]?.id)
      await updateRoutineExercise(copy[0]!.id, { targetSets: 99 })
      expect((await listRoutineExercises(id))[0]?.targetSets).toBe(4)
    })

    it('hides archived routines but keeps them retrievable', async () => {
      const { id } = await buildPushA()
      await archiveRoutine(id)

      expect(await listRoutines()).toHaveLength(0)
      expect(await listRoutines(true)).toHaveLength(1)

      await unarchiveRoutine(id)
      expect(await listRoutines()).toHaveLength(1)
    })

    it('deleting a routine leaves its sessions alone', async () => {
      const { id } = await buildPushA()
      const sessionId = await startSessionFromRoutine(id)
      await finishSession(sessionId)

      await deleteRoutine(id)

      const session = await db.sessions.get(sessionId)
      expect(session).toBeDefined()
      // The name was snapshotted, so history still reads correctly.
      expect(session?.name).toBe('Push A')
      expect(await listSessionExercises(sessionId)).toHaveLength(3)
    })
  })

  describe('starting a session from a routine', () => {
    it('copies the plan into the session', async () => {
      const { id } = await buildPushA()
      const sessionId = await startSessionFromRoutine(id)

      const session = await db.sessions.get(sessionId)
      expect(session?.name).toBe('Push A')
      expect(session?.routineNameSnapshot).toBe('Push A')
      expect(session?.routineId).toBe(id)
      expect(session?.status).toBe('active')

      const planned = await listSessionExercises(sessionId)
      expect(planned.map((entry) => entry.exerciseId)).toEqual([
        'ex_bench-press',
        'ex_incline-dumbbell-press',
        'ex_cable-fly',
      ])
      expect(planned[0]).toMatchObject({
        targetSets: 4,
        targetRepsMin: 5,
        targetWeight: { kind: 'absolute', kg: 100 },
        restSeconds: 180,
      })
    })

    it('snapshots, so editing the routine mid-session changes nothing', async () => {
      const { id, bench } = await buildPushA()
      const sessionId = await startSessionFromRoutine(id)

      // Change the plan while the workout is in progress.
      await renameRoutine(id, 'Push A — v2')
      await updateRoutineExercise(bench, {
        targetSets: 10,
        targetWeight: { kind: 'absolute', kg: 60 },
      })
      await removeRoutineExercise(bench)

      const session = await db.sessions.get(sessionId)
      const planned = await listSessionExercises(sessionId)

      // The session is exactly what it was when it started.
      expect(session?.name).toBe('Push A')
      expect(planned).toHaveLength(3)
      expect(planned[0]).toMatchObject({
        targetSets: 4,
        targetWeight: { kind: 'absolute', kg: 100 },
      })
    })

    it('carries superset groups through', async () => {
      const { id, incline } = await buildPushA()
      await toggleSupersetWithPrevious(incline)

      const sessionId = await startSessionFromRoutine(id)
      const planned = await listSessionExercises(sessionId)

      expect(planned[0]?.supersetGroup).toBeDefined()
      expect(planned[1]?.supersetGroup).toBe(planned[0]?.supersetGroup)
    })

    it('refuses to start a second session on top of a running one', async () => {
      const { id } = await buildPushA()
      const first = await startSessionFromRoutine(id)
      const second = await startSessionFromRoutine(id)

      expect(second).toBe(first)
      expect(await db.sessions.count()).toBe(1)
    })

    it('leaves no targets on a freestyle workout', async () => {
      const sessionId = await startEmptySession('Whatever I feel like')
      const sessionExerciseId = await addExerciseToSession(sessionId, 'ex_bench-press')

      const [planned] = await listSessionExercises(sessionId)
      expect(planned?.id).toBe(sessionExerciseId)

      // No plan means no targets — prefill then falls through to history
      // rather than to a number nobody asked for.
      expect(planned?.targetSets).toBeUndefined()
      expect(planned?.targetRepsMin).toBeUndefined()
      expect(planned?.targetWeight).toBeUndefined()
      expect(planned?.isAmrap).toBeUndefined()
    })
  })
})
