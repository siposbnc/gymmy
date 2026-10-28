import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '../schema'
import { bootstrapDatabase } from '../seed'
import {
  completeSession,
  deleteSession,
  getSessionDetail,
  listCompletedSessions,
  listHeadlineRecords,
  listRecordsForExercise,
  listRecordsFromSession,
  previousRoutineVolume,
  recomputeRecordsForSession,
  sessionVolume,
  setSessionDuration,
} from './history'
import {
  addExerciseToSession,
  deleteSet,
  listSets,
  logSet,
  startEmptySession,
  updateSet,
} from './sessions'

describe('history and records', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrapDatabase()
  })

  /** Log one squat session and finish it. */
  async function squatSession(sets: [number, number][], name = 'Legs') {
    const sessionId = await startEmptySession(name)
    const link = await addExerciseToSession(sessionId, 'ex_squat')
    for (const [weightKg, reps] of sets) {
      await logSet(link, { weightKg, reps })
    }
    const records = await completeSession(sessionId)
    return { sessionId, link, records }
  }

  describe('completing a session', () => {
    it('sets records from the work that was logged', async () => {
      const { sessionId } = await squatSession([
        [100, 5],
        [100, 5],
      ])

      const records = await listRecordsFromSession(sessionId)
      const kinds = records.map((record) => record.kind).sort()

      // No reps record yet — 100 kg has only been trained in one session.
      expect(kinds).toEqual(['max_session_volume', 'max_weight'])
      expect(records.find((record) => record.kind === 'max_weight')?.value).toBe(100)
    })

    it('adds a reps record once a weight is revisited and beaten', async () => {
      await squatSession([[100, 5]], 'Week 1')
      const second = await squatSession([[100, 7]], 'Week 2')

      const records = await listRecordsFromSession(second.sessionId)
      const reps = records.find((record) => record.kind === 'max_reps_at_weight')

      expect(reps?.value).toBe(7)
      expect(reps?.atWeightKg).toBe(100)
    })

    it('returns the records earned, for the summary screen', async () => {
      const { records } = await squatSession([[140, 3]])
      expect(records.length).toBeGreaterThan(0)
      expect(records.every((record) => record.sessionId != null)).toBe(true)
    })

    it('does not award records to a session still in progress', async () => {
      const sessionId = await startEmptySession('Unfinished')
      const link = await addExerciseToSession(sessionId, 'ex_squat')
      await logSet(link, { weightKg: 300, reps: 1 })

      // Nothing is settled until the session is finished.
      await expect(listRecordsForExercise('ex_squat')).resolves.toEqual([])
    })

    it('keeps the earlier session when a later one ties it', async () => {
      const first = await squatSession([[140, 3]], 'Week 1')
      await squatSession([[140, 3]], 'Week 2')

      const records = await listRecordsForExercise('ex_squat')
      const heaviest = records.find((record) => record.kind === 'max_weight')
      expect(heaviest?.sessionId).toBe(first.sessionId)
    })

    it('moves the record when a later session beats it', async () => {
      await squatSession([[140, 3]], 'Week 1')
      const second = await squatSession([[145, 3]], 'Week 2')

      const records = await listRecordsForExercise('ex_squat')
      expect(records.find((record) => record.kind === 'max_weight')).toMatchObject({
        value: 145,
        sessionId: second.sessionId,
      })
    })
  })

  describe('editing a past session', () => {
    it('does not stretch its duration', async () => {
      const { sessionId, link } = await squatSession([[100, 5]])
      const before = await db.sessions.get(sessionId)

      // Pretend the session finished two hours ago, then fix a typo now.
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
      await db.sessions.update(sessionId, {
        startedAt: twoHoursAgo,
        endedAt: twoHoursAgo + 60 * 60 * 1000,
      })

      const [set] = await listSets(link)
      await updateSet(set!.id, { weightKg: 105 })
      await recomputeRecordsForSession(sessionId)

      const after = await db.sessions.get(sessionId)
      // An hour-long session must stay an hour long after an edit.
      expect(after!.endedAt! - after!.startedAt).toBe(60 * 60 * 1000)
      expect(before).toBeDefined()
    })

    it('lets a wrong duration be corrected', async () => {
      const { sessionId } = await squatSession([[100, 5]])
      const started = (await db.sessions.get(sessionId))!.startedAt

      await setSessionDuration(sessionId, 2 * 60 * 60) // two hours

      const session = await db.sessions.get(sessionId)
      expect(session!.endedAt! - session!.startedAt).toBe(2 * 60 * 60 * 1000)
      // The day it happened must not move, or it would jump in the calendar.
      expect(session!.startedAt).toBe(started)
    })

    it('refuses a negative duration', async () => {
      const { sessionId } = await squatSession([[100, 5]])
      await setSessionDuration(sessionId, -500)

      const session = await db.sessions.get(sessionId)
      expect(session!.endedAt).toBe(session!.startedAt)
    })

    it('still updates records', async () => {
      const { sessionId, link } = await squatSession([[100, 5]])

      const [set] = await listSets(link)
      await updateSet(set!.id, { weightKg: 140 })
      await recomputeRecordsForSession(sessionId)

      const records = await listRecordsForExercise('ex_squat')
      expect(records.find((record) => record.kind === 'max_weight')?.value).toBe(140)
    })
  })

  describe('records follow edits', () => {
    it('recomputes after a set is corrected downward', async () => {
      const { link, sessionId } = await squatSession([[200, 3]])

      // That 200 was a typo; it was really 120.
      const [set] = await listSets(link)
      await updateSet(set!.id, { weightKg: 120 })
      await completeSession(sessionId)

      const records = await listRecordsForExercise('ex_squat')
      expect(records.find((record) => record.kind === 'max_weight')?.value).toBe(120)
    })

    it('recomputes after a set is deleted', async () => {
      const sessionId = await startEmptySession('Legs')
      const link = await addExerciseToSession(sessionId, 'ex_squat')
      await logSet(link, { weightKg: 100, reps: 5 })
      const bogus = await logSet(link, { weightKg: 500, reps: 1 })
      await completeSession(sessionId)

      expect(
        (await listRecordsForExercise('ex_squat')).find((r) => r.kind === 'max_weight')?.value,
      ).toBe(500)

      await deleteSet(bogus)
      await completeSession(sessionId)

      // No stale record pointing at a set that no longer exists.
      const records = await listRecordsForExercise('ex_squat')
      expect(records.find((record) => record.kind === 'max_weight')?.value).toBe(100)
    })

    it('clears records when the session holding them is deleted', async () => {
      const { sessionId } = await squatSession([[140, 3]])
      expect(await listRecordsForExercise('ex_squat')).not.toEqual([])

      await deleteSession(sessionId)

      expect(await listRecordsForExercise('ex_squat')).toEqual([])
      expect(await db.sessions.get(sessionId)).toBeUndefined()
      expect(await db.sets.count()).toBe(0)
    })

    it('falls back to the previous best when the record session is deleted', async () => {
      await squatSession([[140, 3]], 'Week 1')
      const second = await squatSession([[150, 3]], 'Week 2')

      await deleteSession(second.sessionId)

      const records = await listRecordsForExercise('ex_squat')
      expect(records.find((record) => record.kind === 'max_weight')?.value).toBe(140)
    })
  })

  describe('reading history', () => {
    it('lists completed sessions newest first', async () => {
      await squatSession([[100, 5]], 'Older')
      await squatSession([[105, 5]], 'Newer')

      const sessions = await listCompletedSessions()
      expect(sessions.map((session) => session.name)).toEqual(['Newer', 'Older'])
    })

    it('excludes a session still in progress', async () => {
      await squatSession([[100, 5]], 'Done')
      await startEmptySession('In progress')

      expect((await listCompletedSessions()).map((s) => s.name)).toEqual(['Done'])
    })

    it('returns a full session detail in order', async () => {
      const sessionId = await startEmptySession('Push A')
      const bench = await addExerciseToSession(sessionId, 'ex_bench-press')
      await addExerciseToSession(sessionId, 'ex_cable-fly')
      await logSet(bench, { weightKg: 20, reps: 12, type: 'warmup' })
      await logSet(bench, { weightKg: 80, reps: 8 })
      await completeSession(sessionId)

      const detail = await getSessionDetail(sessionId)
      expect(detail?.session.name).toBe('Push A')
      expect(detail?.exercises.map((entry) => entry.name)).toEqual(['Bench Press', 'Cable Fly'])
      expect(detail?.exercises[0]?.sets.map((set) => set.type)).toEqual(['warmup', 'normal'])
    })

    it('is null for a session that does not exist', async () => {
      expect(await getSessionDetail('nope')).toBeNull()
    })

    it('totals a session volume excluding warm-ups', async () => {
      const sessionId = await startEmptySession('Push A')
      const bench = await addExerciseToSession(sessionId, 'ex_bench-press')
      await logSet(bench, { weightKg: 20, reps: 10, type: 'warmup' })
      await logSet(bench, { weightKg: 80, reps: 10 })
      await completeSession(sessionId)

      expect(await sessionVolume(sessionId)).toBe(800)
    })

    it('builds a PR board of heaviest lifts across exercises', async () => {
      await squatSession([[140, 3]])

      const benchSession = await startEmptySession('Push')
      const bench = await addExerciseToSession(benchSession, 'ex_bench-press')
      await logSet(bench, { weightKg: 100, reps: 5 })
      await completeSession(benchSession)

      const board = await listHeadlineRecords()
      expect(board).toHaveLength(2)
      expect(board.every((record) => record.kind === 'max_weight')).toBe(true)
      expect(board.map((record) => record.exerciseId).sort()).toEqual([
        'ex_bench-press',
        'ex_squat',
      ])
    })
  })

  describe('the previous run of a routine', () => {
    /** A finished squat session, dated, belonging to a routine. */
    async function routineSession(startedAt: number, sets: [number, number][]) {
      const sessionId = await startEmptySession('Legs')
      await db.sessions.update(sessionId, { routineId: 'rtn_legs', startedAt })
      const link = await addExerciseToSession(sessionId, 'ex_squat')
      for (const [weightKg, reps] of sets) {
        await logSet(link, { weightKg, reps })
      }
      await completeSession(sessionId)
      return sessionId
    }

    const DAY = 24 * 60 * 60 * 1000
    const T = new Date(2026, 9, 26, 10, 0, 0).getTime()

    it('finds the run before the one asked about', async () => {
      await routineSession(T - 7 * DAY, [[100, 5]]) // 500
      await routineSession(T, [[110, 5]]) // 550

      expect(await previousRoutineVolume('rtn_legs', T)).toBe(500)
    })

    it('is undefined the first time a routine is run', async () => {
      expect(await previousRoutineVolume('rtn_legs', T)).toBeUndefined()
    })

    it('looks backwards only, so an old session reads the same forever', async () => {
      // Asked about the middle session, the answer is the first one — not the
      // latest, which did not exist when that session was finished.
      await routineSession(T - 14 * DAY, [[90, 5]]) // 450
      await routineSession(T - 7 * DAY, [[100, 5]]) // 500
      await routineSession(T, [[110, 5]]) // 550

      expect(await previousRoutineVolume('rtn_legs', T - 7 * DAY)).toBe(450)
      expect(await previousRoutineVolume('rtn_legs', T)).toBe(500)
    })

    it('ignores a session still in progress', async () => {
      await routineSession(T - 7 * DAY, [[100, 5]])

      const active = await startEmptySession('Legs')
      await db.sessions.update(active, { routineId: 'rtn_legs', startedAt: T - DAY })
      const link = await addExerciseToSession(active, 'ex_squat')
      await logSet(link, { weightKg: 200, reps: 10 })

      // An unfinished workout is not a session you beat.
      expect(await previousRoutineVolume('rtn_legs', T)).toBe(500)
    })

    it('ignores sessions from a different routine', async () => {
      await routineSession(T - 7 * DAY, [[100, 5]])
      expect(await previousRoutineVolume('rtn_push', T)).toBeUndefined()
    })
  })
})
