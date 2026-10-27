import { computeRecords, recordId, type RecordSet } from '~/domain/records'
import type { PersonalRecord, Session, SetEntry } from '~/domain/types'

import { db } from '../schema'
import { listSets } from './sessions'

/**
 * History, and the records derived from it.
 */

export async function listCompletedSessions(limit?: number): Promise<Session[]> {
  const rows = await db.sessions.where('status').equals('completed').toArray()
  const sorted = rows.sort((a, b) => b.startedAt - a.startedAt)
  return limit == null ? sorted : sorted.slice(0, limit)
}

export interface SessionDetail {
  session: Session
  exercises: {
    sessionExerciseId: string
    exerciseId: string
    name: string
    order: number
    supersetGroup?: number | undefined
    sets: SetEntry[]
  }[]
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const session = await db.sessions.get(sessionId)
  if (!session) return null

  const links = await db.sessionExercises.where('sessionId').equals(sessionId).toArray()
  const exercises = await Promise.all(
    links
      .sort((a, b) => a.order - b.order)
      .map(async (link) => {
        const [exercise, sets] = await Promise.all([
          db.exercises.get(link.exerciseId),
          listSets(link.id),
        ])
        return {
          sessionExerciseId: link.id,
          exerciseId: link.exerciseId,
          name: exercise?.name ?? 'Unknown exercise',
          order: link.order,
          supersetGroup: link.supersetGroup,
          sets,
        }
      }),
  )

  return { session, exercises }
}

/** Removes a session and everything under it, then refreshes affected records. */
export async function deleteSession(sessionId: string): Promise<void> {
  const links = await db.sessionExercises.where('sessionId').equals(sessionId).toArray()
  const exerciseIds = [...new Set(links.map((link) => link.exerciseId))]

  await db.transaction('rw', db.sessions, db.sessionExercises, db.sets, async () => {
    await Promise.all(links.map((link) => db.sets.where('sessionExerciseId').equals(link.id).delete()))
    await db.sessionExercises.where('sessionId').equals(sessionId).delete()
    await db.sessions.delete(sessionId)
  })

  // A deleted session may have held records; recompute so none are orphaned.
  await recomputeRecordsFor(exerciseIds)
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** Every working set ever logged for an exercise, as record detection wants it. */
async function recordSetsFor(exerciseId: string): Promise<RecordSet[]> {
  const links = await db.sessionExercises.where('exerciseId').equals(exerciseId).toArray()
  if (links.length === 0) return []

  const sessions = await db.sessions.bulkGet(links.map((link) => link.sessionId))
  // Only completed sessions count. A workout in progress should not be setting
  // records that could vanish when it is discarded.
  const eligible = links.filter((_, index) => sessions[index]?.status === 'completed')

  const perLink = await Promise.all(
    eligible.map(async (link) => {
      const sets = await listSets(link.id)
      return sets.map(
        (set): RecordSet => ({
          id: set.id,
          sessionId: link.sessionId,
          completedAt: set.completedAt,
          type: set.type,
          weightKg: set.weightKg,
          reps: set.reps,
        }),
      )
    }),
  )

  return perLink.flat()
}

/**
 * Rebuild an exercise's records from scratch.
 *
 * Recomputed rather than incrementally updated, so editing or deleting a set
 * months after the fact yields correct records instead of leaving a stale one
 * pointing at work that no longer exists.
 */
export async function recomputeRecordsFor(exerciseIds: readonly string[]): Promise<void> {
  for (const exerciseId of exerciseIds) {
    const sets = await recordSetsFor(exerciseId)
    const drafts = computeRecords(exerciseId, sets)

    await db.transaction('rw', db.records, async () => {
      await db.records.where('exerciseId').equals(exerciseId).delete()
      if (drafts.length > 0) {
        // Deterministic ids: the same history always yields the same rows, so
        // a rebuild after an import or an edit does not churn the table.
        await db.records.bulkAdd(drafts.map((draft) => ({ ...draft, id: recordId(draft) })))
      }
    })
  }
}

/** Refresh records for every exercise a session touched. */
export async function recomputeRecordsForSession(sessionId: string): Promise<void> {
  const links = await db.sessionExercises.where('sessionId').equals(sessionId).toArray()
  await recomputeRecordsFor([...new Set(links.map((link) => link.exerciseId))])
}

export async function listRecordsForExercise(exerciseId: string): Promise<PersonalRecord[]> {
  const rows = await db.records.where('exerciseId').equals(exerciseId).toArray()
  return rows.sort((a, b) => b.achievedAt - a.achievedAt)
}

export async function listRecordsFromSession(sessionId: string): Promise<PersonalRecord[]> {
  const rows = await db.records.where('sessionId').equals(sessionId).toArray()
  return rows.sort((a, b) => b.achievedAt - a.achievedAt)
}

/**
 * The PR board: the heaviest-weight record per exercise, newest first.
 *
 * Filtered in memory rather than through an index — `kind` alone is not one,
 * and the records table is small enough (bounded by exercises × distinct
 * weights) that an index would cost more than it saves.
 */
export async function listHeadlineRecords(limit = 30): Promise<PersonalRecord[]> {
  const rows = await db.records.toArray()
  return rows
    .filter((record) => record.kind === 'max_weight')
    .sort((a, b) => b.achievedAt - a.achievedAt)
    .slice(0, limit)
}

/**
 * Finish a workout and settle its records.
 *
 * Lives here rather than in `sessions.ts` because record detection reads the
 * whole history; keeping the orchestration on this side avoids a circular
 * import and keeps `sessions.ts` focused on the set-logging write path.
 */
export async function completeSession(sessionId: string): Promise<PersonalRecord[]> {
  await db.sessions.update(sessionId, { status: 'completed', endedAt: Date.now() })
  await recomputeRecordsForSession(sessionId)
  return listRecordsFromSession(sessionId)
}
