import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '../schema'
import { bootstrapDatabase } from '../seed'
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
  removeSessionExercise,
  startEmptySession,
  STALE_SESSION_MS,
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
})
