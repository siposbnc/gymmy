import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '../schema'
import { bootstrapDatabase } from '../seed'
import {
  addExerciseToRoutine,
  createRoutine,
  setRoutineSetPlan,
  startSessionFromRoutine,
  updateRoutineExercise,
} from './routines'
import {
  addExerciseToSession,
  deleteSet,
  discardSession,
  finishSession,
  getActiveSession,
  getPreviousSets,
  isStale,
  listSets,
  logSet,
  moveSetToExercise,
  removeSessionExercise,
  setExerciseMachineWeight,
  listSessionExercises,
  startEmptySession,
  STALE_SESSION_MS,
  swapSessionExercise,
  toggleWarmup,
  updateSet,
} from './sessions'

describe('sessions', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrapDatabase()
  })

  describe('the active session', () => {
    it('starts one and finds it again — the recovery path', async () => {
      const id = await startEmptySession('Push A')
      const active = await getActiveSession()
      expect(active?.id).toBe(id)
      expect(active?.status).toBe('active')
    })

    it('never creates a second active session', async () => {
      const first = await startEmptySession()
      const second = await startEmptySession()
      expect(second).toBe(first)
      expect(await db.sessions.count()).toBe(1)
    })

    it('stops being active once finished', async () => {
      const id = await startEmptySession()
      await finishSession(id)
      expect(await getActiveSession()).toBeUndefined()
      expect((await db.sessions.get(id))?.endedAt).toBeGreaterThan(0)
    })

    it('flags a session the user probably abandoned', () => {
      const fresh = { id: 'a', name: 'x', startedAt: Date.now(), status: 'active' } as const
      expect(isStale(fresh)).toBe(false)
      expect(isStale({ ...fresh, startedAt: Date.now() - STALE_SESSION_MS - 1000 })).toBe(true)
    })

    it('discarding removes the session and everything under it', async () => {
      const sessionId = await startEmptySession()
      const sexId = await addExerciseToSession(sessionId, 'ex_squat')
      await logSet(sexId, { weightKg: 100, reps: 5 })

      await discardSession(sessionId)

      expect(await db.sessions.count()).toBe(0)
      expect(await db.sessionExercises.count()).toBe(0)
      expect(await db.sets.count()).toBe(0)
    })
  })

  describe('set indexing', () => {
    it('numbers warm-ups and working sets in separate runs', async () => {
      const sessionId = await startEmptySession()
      const sexId = await addExerciseToSession(sessionId, 'ex_bench-press')

      await logSet(sexId, { weightKg: 20, reps: 12, type: 'warmup' })
      await logSet(sexId, { weightKg: 60, reps: 5, type: 'warmup' })
      await logSet(sexId, { weightKg: 80, reps: 8 })
      await logSet(sexId, { weightKg: 80, reps: 8 })

      const sets = await listSets(sexId)
      // Reads as W, W, 1, 2 — which is how lifters actually count them.
      expect(sets.map((s) => [s.type, s.setIndex])).toEqual([
        ['warmup', 1],
        ['warmup', 2],
        ['normal', 1],
        ['normal', 2],
      ])
    })

    it('renumbers after a delete so indices stay contiguous', async () => {
      const sessionId = await startEmptySession()
      const sexId = await addExerciseToSession(sessionId, 'ex_squat')
      await logSet(sexId, { weightKg: 100, reps: 5 })
      const middle = await logSet(sexId, { weightKg: 100, reps: 5 })
      await logSet(sexId, { weightKg: 100, reps: 4 })

      await deleteSet(middle)

      const sets = await listSets(sexId)
      expect(sets.map((s) => s.setIndex)).toEqual([1, 2])
      expect(sets.map((s) => s.reps)).toEqual([5, 4])
    })

    it('renumbers both runs when a set is flipped to a warm-up', async () => {
      const sessionId = await startEmptySession()
      const sexId = await addExerciseToSession(sessionId, 'ex_squat')
      const first = await logSet(sexId, { weightKg: 60, reps: 5 })
      await logSet(sexId, { weightKg: 100, reps: 5 })
      await logSet(sexId, { weightKg: 100, reps: 5 })

      // That 60 kg opener was really a warm-up.
      await toggleWarmup(first)

      const sets = await listSets(sexId)
      expect(sets.map((s) => [s.type, s.setIndex])).toEqual([
        ['warmup', 1],
        ['normal', 1],
        ['normal', 2],
      ])
    })

    it('edits a set in place without touching its siblings', async () => {
      const sessionId = await startEmptySession()
      const sexId = await addExerciseToSession(sessionId, 'ex_squat')
      const id = await logSet(sexId, { weightKg: 100, reps: 5 })
      await logSet(sexId, { weightKg: 100, reps: 5 })

      await updateSet(id, { weightKg: 102.5, rpe: 9 })

      const sets = await listSets(sexId)
      expect(sets[0]?.weightKg).toBe(102.5)
      expect(sets[0]?.rpe).toBe(9)
      expect(sets[1]?.weightKg).toBe(100)
    })

    it('moves a set logged against the wrong exercise', async () => {
      const sessionId = await startEmptySession()
      const squat = await addExerciseToSession(sessionId, 'ex_squat')
      const bench = await addExerciseToSession(sessionId, 'ex_bench-press')

      await logSet(squat, { weightKg: 100, reps: 5 })
      const misplaced = await logSet(squat, { weightKg: 80, reps: 8 })
      await logSet(squat, { weightKg: 100, reps: 5 })
      await logSet(bench, { weightKg: 80, reps: 8 })

      await moveSetToExercise(misplaced, bench)

      const squatSets = await listSets(squat)
      const benchSets = await listSets(bench)

      // The source renumbers so there is no gap where the set was.
      expect(squatSets).toHaveLength(2)
      expect(squatSets.map((set) => set.setIndex)).toEqual([1, 2])
      expect(squatSets.every((set) => set.weightKg === 100)).toBe(true)

      // And it lands at the end of its new home.
      expect(benchSets).toHaveLength(2)
      expect(benchSets.map((set) => set.setIndex)).toEqual([1, 2])
      expect(benchSets[1]?.id).toBe(misplaced)
    })

    it('keeps a moved warm-up numbered among warm-ups', async () => {
      const sessionId = await startEmptySession()
      const squat = await addExerciseToSession(sessionId, 'ex_squat')
      const bench = await addExerciseToSession(sessionId, 'ex_bench-press')

      await logSet(bench, { weightKg: 20, reps: 12, type: 'warmup' })
      const warm = await logSet(squat, { weightKg: 20, reps: 10, type: 'warmup' })

      await moveSetToExercise(warm, bench)

      const benchSets = await listSets(bench)
      expect(benchSets.map((set) => [set.type, set.setIndex])).toEqual([
        ['warmup', 1],
        ['warmup', 2],
      ])
    })

    it('moving a set to where it already is does nothing', async () => {
      const sessionId = await startEmptySession()
      const squat = await addExerciseToSession(sessionId, 'ex_squat')
      const id = await logSet(squat, { weightKg: 100, reps: 5 })

      await moveSetToExercise(id, squat)

      expect(await listSets(squat)).toHaveLength(1)
    })

    it('removing an exercise takes its sets with it', async () => {
      const sessionId = await startEmptySession()
      const sexId = await addExerciseToSession(sessionId, 'ex_squat')
      await logSet(sexId, { weightKg: 100, reps: 5 })

      await removeSessionExercise(sexId)

      expect(await db.sets.count()).toBe(0)
    })
  })

  describe('getPreviousSets — what prefill reads', () => {
    it('returns the sets of the last completed session for that exercise', async () => {
      const older = await startEmptySession('Week 1')
      const olderSex = await addExerciseToSession(older, 'ex_bench-press')
      await logSet(olderSex, { weightKg: 75, reps: 8 })
      await finishSession(older)

      const newer = await startEmptySession('Week 2')
      const newerSex = await addExerciseToSession(newer, 'ex_bench-press')
      await logSet(newerSex, { weightKg: 77.5, reps: 8 })
      await finishSession(newer)

      const previous = await getPreviousSets('ex_bench-press')
      expect(previous.map((s) => s.weightKg)).toEqual([77.5])
    })

    it('excludes the session currently in progress', async () => {
      const done = await startEmptySession('Last week')
      const doneSex = await addExerciseToSession(done, 'ex_squat')
      await logSet(doneSex, { weightKg: 130, reps: 3 })
      await finishSession(done)

      const current = await startEmptySession('Today')
      const currentSex = await addExerciseToSession(current, 'ex_squat')
      await logSet(currentSex, { weightKg: 140, reps: 3 })

      // Must look past today, or "last time" would show what you just lifted.
      const previous = await getPreviousSets('ex_squat', current)
      expect(previous.map((s) => s.weightKg)).toEqual([130])
    })

    it('ignores sessions that were never finished', async () => {
      const abandoned = await startEmptySession('Abandoned')
      const abandonedSex = await addExerciseToSession(abandoned, 'ex_deadlift')
      await logSet(abandonedSex, { weightKg: 200, reps: 1 })

      const other = await startEmptySession('Other')
      expect(await getPreviousSets('ex_deadlift', other)).toEqual([])
    })

    it('is empty for an exercise never trained', async () => {
      expect(await getPreviousSets('ex_leg-press')).toEqual([])
    })
  })

  describe('swapping an exercise mid-workout', () => {
    /** A two-exercise routine, started: bench with targets, then a row. */
    async function startPlannedSession() {
      const routineId = await createRoutine('Push A')
      const bench = await addExerciseToRoutine(routineId, 'ex_bench-press')
      await addExerciseToRoutine(routineId, 'ex_barbell-row')
      await updateRoutineExercise(bench, { targetSets: 4, targetRepsMin: 8, isAmrap: true })
      await updateRoutineExercise(bench, { targetWeight: { kind: 'absolute', kg: 80 } })

      const sessionId = await startSessionFromRoutine(routineId)
      const rows = await listSessionExercises(sessionId)
      return { sessionId, benchRow: rows[0]!, rowRow: rows[1]! }
    }

    it('replaces the exercise in place when nothing is logged yet', async () => {
      const { benchRow } = await startPlannedSession()

      const result = await swapSessionExercise(benchRow.id, 'ex_dumbbell-bench-press')

      expect(result).toEqual({ sessionExerciseId: benchRow.id, inserted: false })
      const swapped = await db.sessionExercises.get(benchRow.id)
      expect(swapped?.exerciseId).toBe('ex_dumbbell-bench-press')
      // Its place in the session is the thing delete-and-re-add costs you.
      expect(swapped?.order).toBe(benchRow.order)
      expect(await db.sessionExercises.count()).toBe(2)
    })

    it('carries the rep targets and leaves the weight behind', async () => {
      const { benchRow } = await startPlannedSession()

      await swapSessionExercise(benchRow.id, 'ex_dumbbell-bench-press')

      const swapped = await db.sessionExercises.get(benchRow.id)
      expect(swapped?.targetSets).toBe(4)
      expect(swapped?.targetRepsMin).toBe(8)
      expect(swapped?.isAmrap).toBe(true)
      // 80 kg of bench press is not 80 kg of dumbbell press, and prefill's
      // plan tier would offer it as today's opening set.
      expect(swapped).not.toHaveProperty('targetWeight')
    })

    it('takes the rest default of the exercise arriving', async () => {
      const { benchRow } = await startPlannedSession()
      await db.exercises.update('ex_dumbbell-bench-press', { defaultRestSeconds: 90 })

      await swapSessionExercise(benchRow.id, 'ex_dumbbell-bench-press')

      expect((await db.sessionExercises.get(benchRow.id))?.restSeconds).toBe(90)
    })

    it('strips a ladder of its loads, keeping the rungs it describes', async () => {
      const routineId = await createRoutine('Push A')
      const bench = await addExerciseToRoutine(routineId, 'ex_bench-press')
      await setRoutineSetPlan(bench, [
        { reps: 10, weight: { kind: 'absolute', kg: 60 } },
        { reps: 8, weight: { kind: 'absolute', kg: 70 } },
        { reps: 6, weight: { kind: 'absolute', kg: 80 }, isAmrap: true },
      ])
      const sessionId = await startSessionFromRoutine(routineId)
      const row = (await listSessionExercises(sessionId))[0]!

      await swapSessionExercise(row.id, 'ex_dumbbell-bench-press')

      const swapped = await db.sessionExercises.get(row.id)
      expect(swapped?.setPlan).toEqual([{ reps: 10 }, { reps: 8 }, { reps: 6, isAmrap: true }])
      // The summary a ladder always travels with, rewritten from the rungs.
      expect(swapped?.targetSets).toBe(3)
      expect(swapped?.targetRepsMin).toBe(6)
      expect(swapped?.targetRepsMax).toBe(10)
      expect(swapped?.isAmrap).toBe(true)
    })

    it('does not store a ladder that stripping made uniform', async () => {
      const routineId = await createRoutine('Push A')
      const bench = await addExerciseToRoutine(routineId, 'ex_bench-press')
      // A climb in weight at a fixed rep count — straight sets once the
      // weights come off, and straight sets are not stored as a ladder.
      await setRoutineSetPlan(bench, [
        { reps: 8, weight: { kind: 'absolute', kg: 60 } },
        { reps: 8, weight: { kind: 'absolute', kg: 70 } },
      ])
      const sessionId = await startSessionFromRoutine(routineId)
      const row = (await listSessionExercises(sessionId))[0]!

      await swapSessionExercise(row.id, 'ex_dumbbell-bench-press')

      const swapped = await db.sessionExercises.get(row.id)
      expect(swapped).not.toHaveProperty('setPlan')
      expect(swapped?.targetSets).toBe(2)
      expect(swapped?.targetRepsMin).toBe(8)
    })

    it('clears a machine weight the new exercise does not have', async () => {
      await db.exercises.update('ex_leg-press', { machineWeightKg: 25 })
      const sessionId = await startEmptySession('Legs')
      const sexId = await addExerciseToSession(sessionId, 'ex_leg-press')

      await swapSessionExercise(sexId, 'ex_squat')

      // Absent, not stale: a 25 kg carriage would otherwise be subtracted from
      // every barbell squat logged here.
      expect(await db.sessionExercises.get(sexId)).not.toHaveProperty('machineWeightKg')
    })

    it('keeps the logged sets on the exercise they were performed on', async () => {
      const { benchRow } = await startPlannedSession()
      await logSet(benchRow.id, { weightKg: 80, reps: 8 })
      await logSet(benchRow.id, { weightKg: 80, reps: 7 })

      const result = await swapSessionExercise(benchRow.id, 'ex_dumbbell-bench-press')

      expect(result?.inserted).toBe(true)
      // A set logged under Bench Press is a bench press. Relabelling it would
      // falsify history, the volume split and the records path.
      const original = await db.sessionExercises.get(benchRow.id)
      expect(original?.exerciseId).toBe('ex_bench-press')
      expect(await listSets(benchRow.id)).toHaveLength(2)
      expect(await listSets(result!.sessionExerciseId)).toHaveLength(0)
    })

    it('inserts the replacement directly below and shifts what follows', async () => {
      const { sessionId, benchRow } = await startPlannedSession()
      await logSet(benchRow.id, { weightKg: 80, reps: 8 })

      const result = await swapSessionExercise(benchRow.id, 'ex_dumbbell-bench-press')

      const rows = await listSessionExercises(sessionId)
      expect(rows.map((row) => row.exerciseId)).toEqual([
        'ex_bench-press',
        'ex_dumbbell-bench-press',
        'ex_barbell-row',
      ])
      expect(rows.map((row) => row.order)).toEqual([0, 1, 2])
      expect(rows[1]?.id).toBe(result?.sessionExerciseId)
    })

    it('splits the target sets between the two, so the session still asks for four', async () => {
      const { benchRow } = await startPlannedSession()
      await logSet(benchRow.id, { weightKg: 80, reps: 8 })
      await logSet(benchRow.id, { weightKg: 80, reps: 8 })

      const result = await swapSessionExercise(benchRow.id, 'ex_dumbbell-bench-press')

      const original = await db.sessionExercises.get(benchRow.id)
      const inserted = await db.sessionExercises.get(result!.sessionExerciseId)
      // "2 of 2" rather than "2 of 4" on an exercise you have finished with.
      expect(original?.targetSets).toBe(2)
      expect(inserted?.targetSets).toBe(2)
      // The set to be taken to failure is in the remainder now.
      expect(original?.isAmrap).toBe(false)
      expect(inserted?.isAmrap).toBe(true)
    })

    it('hands the replacement the rungs that are left of a ladder', async () => {
      const routineId = await createRoutine('Push A')
      const bench = await addExerciseToRoutine(routineId, 'ex_bench-press')
      await setRoutineSetPlan(bench, [
        { reps: 10, weight: { kind: 'absolute', kg: 60 } },
        { reps: 8, weight: { kind: 'absolute', kg: 70 } },
        { reps: 6, weight: { kind: 'absolute', kg: 80 } },
      ])
      const sessionId = await startSessionFromRoutine(routineId)
      const row = (await listSessionExercises(sessionId))[0]!
      await logSet(row.id, { weightKg: 60, reps: 10 })

      const result = await swapSessionExercise(row.id, 'ex_dumbbell-bench-press')

      const inserted = await db.sessionExercises.get(result!.sessionExerciseId)
      expect(inserted?.setPlan).toEqual([{ reps: 8 }, { reps: 6 }])
      const original = await db.sessionExercises.get(row.id)
      // The rung that was done keeps its weight: that is a record of what was
      // planned and performed here, not a prescription being handed on.
      expect(original?.targetSets).toBe(1)
      expect(original?.setPlan).toBeUndefined()
      expect(original?.targetRepsMin).toBe(10)
    })

    it('leaves the whole plan with the replacement when only warm-ups were done', async () => {
      const { benchRow } = await startPlannedSession()
      await logSet(benchRow.id, { weightKg: 40, reps: 10, type: 'warmup' })

      const result = await swapSessionExercise(benchRow.id, 'ex_dumbbell-bench-press')

      const original = await db.sessionExercises.get(benchRow.id)
      const inserted = await db.sessionExercises.get(result!.sessionExerciseId)
      // The warm-ups stay where they were performed; no plan survives on a row
      // that accounted for none of the working sets.
      expect(await listSets(benchRow.id)).toHaveLength(1)
      expect(original).not.toHaveProperty('targetSets')
      expect(inserted?.targetSets).toBe(4)
    })

    it('gives the replacement no targets once the plan is already complete', async () => {
      const { benchRow } = await startPlannedSession()
      for (let index = 0; index < 4; index += 1) {
        await logSet(benchRow.id, { weightKg: 80, reps: 8 })
      }

      const result = await swapSessionExercise(benchRow.id, 'ex_dumbbell-bench-press')

      const inserted = await db.sessionExercises.get(result!.sessionExerciseId)
      expect(inserted).not.toHaveProperty('targetSets')
      expect((await db.sessionExercises.get(benchRow.id))?.targetSets).toBe(4)
    })

    it('does nothing when the exercise picked is the one already there', async () => {
      const { benchRow } = await startPlannedSession()
      await logSet(benchRow.id, { weightKg: 80, reps: 8 })

      const result = await swapSessionExercise(benchRow.id, 'ex_bench-press')

      expect(result).toEqual({ sessionExerciseId: benchRow.id, inserted: false })
      expect(await db.sessionExercises.count()).toBe(2)
    })

    it('reports a row that is no longer there rather than writing one', async () => {
      expect(await swapSessionExercise('sex_gone', 'ex_bench-press')).toBeNull()
      expect(await db.sessionExercises.count()).toBe(0)
    })

    it('keeps a superset grouping, which is the other thing re-adding loses', async () => {
      const sessionId = await startEmptySession('Push A')
      const sexId = await addExerciseToSession(sessionId, 'ex_bench-press')
      await db.sessionExercises.update(sexId, { supersetGroup: 1 })

      await swapSessionExercise(sexId, 'ex_dumbbell-bench-press')

      expect((await db.sessionExercises.get(sexId))?.supersetGroup).toBe(1)
    })
  })

  describe('machine weight', () => {
    it('is snapshotted when the exercise joins the session', async () => {
      await db.exercises.update('ex_leg-press', { machineWeightKg: 25 })

      const sessionId = await startEmptySession('Legs')
      const sexId = await addExerciseToSession(sessionId, 'ex_leg-press')

      expect((await db.sessionExercises.get(sexId))?.machineWeightKg).toBe(25)
    })

    it('is absent for an exercise that has none, rather than zero', async () => {
      const sessionId = await startEmptySession('Legs')
      const sexId = await addExerciseToSession(sessionId, 'ex_leg-press')

      // Absent is the value every row written before this feature carries, so
      // it has to be the value a row written now carries too.
      expect(await db.sessionExercises.get(sexId)).not.toHaveProperty('machineWeightKg')
    })

    it('does not follow a later re-measurement into a finished session', async () => {
      await db.exercises.update('ex_leg-press', { machineWeightKg: 25 })

      const sessionId = await startEmptySession('Legs')
      const sexId = await addExerciseToSession(sessionId, 'ex_leg-press')
      await logSet(sexId, { weightKg: 165, reps: 10 })
      await finishSession(sessionId)

      // Someone finally weighs the carriage properly.
      await db.exercises.update('ex_leg-press', { machineWeightKg: 30 })

      const snapshot = await db.sessionExercises.get(sexId)
      expect(snapshot?.machineWeightKg).toBe(25)
      // And the set keeps the total it was logged with either way: 165 kg is
      // what moved, whatever the split turns out to have been.
      const sets = await listSets(sexId)
      expect(sets[0]?.weightKg).toBe(165)
    })

    it('correcting it mid-workout moves this session and every future one', async () => {
      await db.exercises.update('ex_leg-press', { machineWeightKg: 25 })

      const sessionId = await startEmptySession('Legs')
      const sexId = await addExerciseToSession(sessionId, 'ex_leg-press')

      await setExerciseMachineWeight(sexId, 'ex_leg-press', 30)

      // Both, because the snapshot is deliberately immune to edits made
      // elsewhere — this is the only place a wrong value can be fixed while
      // you are standing in front of the machine.
      expect((await db.sessionExercises.get(sexId))?.machineWeightKg).toBe(30)
      expect((await db.exercises.get('ex_leg-press'))?.machineWeightKg).toBe(30)
    })
  })
})
