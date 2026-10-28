import type { Routine, RoutineExercise, TargetWeight, VolumeGoal } from '~/domain/types'
import { newId } from '~/lib/uuid'

import { db } from '../schema'
import { getActiveSession } from './sessions'

/**
 * Routines — reusable training plans.
 *
 * A routine exists to pre-fill a session, not to be admired. Everything here
 * is in service of `startSessionFromRoutine`, which is the only moment a plan
 * actually does anything.
 */

export async function listRoutines(includeArchived = false): Promise<Routine[]> {
  const rows = await db.routines.toArray()
  const visible = includeArchived ? rows : rows.filter((row) => row.archivedAt == null)
  return visible.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getRoutine(id: string): Promise<Routine | undefined> {
  return db.routines.get(id)
}

export async function listRoutineExercises(routineId: string): Promise<RoutineExercise[]> {
  const rows = await db.routineExercises.where('routineId').equals(routineId).toArray()
  return rows.sort((a, b) => a.order - b.order)
}

export async function createRoutine(name = 'New routine'): Promise<string> {
  const id = newId('rtn')
  const now = Date.now()
  await db.routines.add({ id, name, createdAt: now, updatedAt: now })
  return id
}

async function touch(routineId: string): Promise<void> {
  await db.routines.update(routineId, { updatedAt: Date.now() })
}

export async function renameRoutine(routineId: string, name: string): Promise<void> {
  await db.routines.update(routineId, { name, updatedAt: Date.now() })
}

export async function setRoutineNotes(routineId: string, notes: string): Promise<void> {
  await db.routines.update(routineId, { notes, updatedAt: Date.now() })
}

export async function setRoutineVolumeGoal(routineId: string, goal: VolumeGoal): Promise<void> {
  await db.routines.update(routineId, { volumeGoal: goal, updatedAt: Date.now() })
}

/** Removes the goal rather than storing a zero, so "no goal" stays one state. */
export async function clearRoutineVolumeGoal(routineId: string): Promise<void> {
  await db.routines
    .where('id')
    .equals(routineId)
    .modify((routine) => {
      delete routine.volumeGoal
      routine.updatedAt = Date.now()
    })
}

/**
 * Archived, not deleted — a routine may be named in the history of sessions
 * that came from it, and those snapshots should keep making sense.
 */
export async function archiveRoutine(routineId: string): Promise<void> {
  await db.routines.update(routineId, { archivedAt: Date.now(), updatedAt: Date.now() })
}

export async function unarchiveRoutine(routineId: string): Promise<void> {
  await db.routines
    .where('id')
    .equals(routineId)
    .modify((routine) => {
      delete routine.archivedAt
      routine.updatedAt = Date.now()
    })
}

/** Permanently removes a routine and its exercise list. Sessions are untouched. */
export async function deleteRoutine(routineId: string): Promise<void> {
  await db.transaction('rw', db.routines, db.routineExercises, async () => {
    await db.routineExercises.where('routineId').equals(routineId).delete()
    await db.routines.delete(routineId)
  })
}

/**
 * Copy a routine, exercises and all.
 *
 * The usual way people build a plan: take last cycle's and change two things.
 */
export async function duplicateRoutine(routineId: string): Promise<string> {
  const source = await db.routines.get(routineId)
  if (!source) throw new Error('Routine not found')

  const id = newId('rtn')
  const now = Date.now()

  await db.transaction('rw', db.routines, db.routineExercises, async () => {
    await db.routines.add({
      ...source,
      id,
      name: `${source.name} copy`,
      createdAt: now,
      updatedAt: now,
    })

    const exercises = await listRoutineExercises(routineId)
    if (exercises.length > 0) {
      await db.routineExercises.bulkAdd(
        exercises.map((exercise) => ({ ...exercise, id: newId('rex'), routineId: id })),
      )
    }
  })

  return id
}

// ---------------------------------------------------------------------------
// Exercises within a routine
// ---------------------------------------------------------------------------

export async function addExerciseToRoutine(routineId: string, exerciseId: string): Promise<string> {
  const id = newId('rex')

  await db.transaction('rw', db.routineExercises, db.exercises, db.routines, async () => {
    const count = await db.routineExercises.where('routineId').equals(routineId).count()
    const exercise = await db.exercises.get(exerciseId)

    await db.routineExercises.add({
      id,
      routineId,
      exerciseId,
      order: count,
      targetSets: 3,
      targetRepsMin: 8,
      isAmrap: false,
      ...(exercise?.defaultRestSeconds == null ? {} : { restSeconds: exercise.defaultRestSeconds }),
    })
    await touch(routineId)
  })

  return id
}

export type RoutineExercisePatch = Partial<
  Pick<
    RoutineExercise,
    | 'targetSets'
    | 'targetRepsMin'
    | 'targetRepsMax'
    | 'isAmrap'
    | 'restSeconds'
    | 'supersetGroup'
    | 'notes'
  >
> & { targetWeight?: TargetWeight }

export async function updateRoutineExercise(
  routineExerciseId: string,
  patch: RoutineExercisePatch,
): Promise<void> {
  const row = await db.routineExercises.get(routineExerciseId)
  if (!row) return
  await db.routineExercises.update(routineExerciseId, patch)
  await touch(row.routineId)
}

/** Clears a target weight entirely rather than storing a zero. */
export async function clearRoutineTargetWeight(routineExerciseId: string): Promise<void> {
  const row = await db.routineExercises.get(routineExerciseId)
  if (!row) return
  await db.routineExercises
    .where('id')
    .equals(routineExerciseId)
    .modify((exercise) => {
      delete exercise.targetWeight
    })
  await touch(row.routineId)
}

export async function removeRoutineExercise(routineExerciseId: string): Promise<void> {
  const row = await db.routineExercises.get(routineExerciseId)
  if (!row) return

  await db.transaction('rw', db.routineExercises, db.routines, async () => {
    await db.routineExercises.delete(routineExerciseId)
    const remaining = await listRoutineExercises(row.routineId)
    await Promise.all(
      remaining.map((exercise, index) =>
        exercise.order === index
          ? Promise.resolve(0)
          : db.routineExercises.update(exercise.id, { order: index }),
      ),
    )
    await touch(row.routineId)
  })
}

/** Move one exercise up or down. Up/down rather than drag: reliable, and it
 *  works from a keyboard and a screen reader without a custom a11y dance. */
export async function moveRoutineExercise(
  routineExerciseId: string,
  direction: -1 | 1,
): Promise<void> {
  const row = await db.routineExercises.get(routineExerciseId)
  if (!row) return

  await db.transaction('rw', db.routineExercises, db.routines, async () => {
    const ordered = await listRoutineExercises(row.routineId)
    const index = ordered.findIndex((exercise) => exercise.id === routineExerciseId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ordered.length) return

    const moved = ordered[index]!
    const displaced = ordered[target]!
    await db.routineExercises.update(moved.id, { order: target })
    await db.routineExercises.update(displaced.id, { order: index })
    await touch(row.routineId)
  })
}

/**
 * Group an exercise with the one above it, or split it off.
 *
 * Supersets are expressed as a shared group number rather than a nested
 * structure: it survives reordering, needs no tree, and "same number means
 * same group" is a rule that cannot get into a half-valid state.
 */
export async function toggleSupersetWithPrevious(routineExerciseId: string): Promise<void> {
  const row = await db.routineExercises.get(routineExerciseId)
  if (!row) return

  await db.transaction('rw', db.routineExercises, db.routines, async () => {
    const ordered = await listRoutineExercises(row.routineId)
    const index = ordered.findIndex((exercise) => exercise.id === routineExerciseId)
    const previous = index > 0 ? ordered[index - 1] : undefined
    if (!previous) return

    const current = ordered[index]!
    const alreadyGrouped =
      current.supersetGroup != null && current.supersetGroup === previous.supersetGroup

    if (alreadyGrouped) {
      await db.routineExercises
        .where('id')
        .equals(current.id)
        .modify((exercise) => {
          delete exercise.supersetGroup
        })
    } else {
      const group =
        previous.supersetGroup ??
        // A fresh group number that no existing group is using.
        Math.max(0, ...ordered.map((exercise) => exercise.supersetGroup ?? 0)) + 1

      await db.routineExercises.update(previous.id, { supersetGroup: group })
      await db.routineExercises.update(current.id, { supersetGroup: group })
    }

    await touch(row.routineId)
  })
}

// ---------------------------------------------------------------------------
// Starting a session
// ---------------------------------------------------------------------------

/**
 * Begin training a routine.
 *
 * Everything the session needs is **copied**, not referenced: the name, the
 * exercise order, the rest lengths, the targets. Editing "Push A" next month
 * must not rewrite what you did in March, and editing it halfway through
 * today's session must not change what the remaining sets are asking for.
 *
 * `routineId` is kept for navigation only — "tune the plan" from the session
 * summary — never as the source of truth for what you were asked to lift.
 */
export async function startSessionFromRoutine(routineId: string): Promise<string> {
  const existing = await getActiveSession()
  if (existing) return existing.id

  const routine = await db.routines.get(routineId)
  if (!routine) throw new Error('Routine not found')

  const sessionId = newId('ses')

  await db.transaction('rw', db.sessions, db.sessionExercises, db.routineExercises, async () => {
    await db.sessions.add({
      id: sessionId,
      routineId,
      routineNameSnapshot: routine.name,
      name: routine.name,
      startedAt: Date.now(),
      status: 'active',
      ...(routine.volumeGoal == null ? {} : { volumeGoalSnapshot: routine.volumeGoal }),
    })

    const planned = await listRoutineExercises(routineId)
    if (planned.length === 0) return

    await db.sessionExercises.bulkAdd(
      planned.map((exercise) => ({
        id: newId('sex'),
        sessionId,
        exerciseId: exercise.exerciseId,
        order: exercise.order,
        ...(exercise.restSeconds == null ? {} : { restSeconds: exercise.restSeconds }),
        ...(exercise.supersetGroup == null ? {} : { supersetGroup: exercise.supersetGroup }),
        ...(exercise.targetSets == null ? {} : { targetSets: exercise.targetSets }),
        ...(exercise.targetRepsMin == null ? {} : { targetRepsMin: exercise.targetRepsMin }),
        ...(exercise.targetRepsMax == null ? {} : { targetRepsMax: exercise.targetRepsMax }),
        ...(exercise.targetWeight == null ? {} : { targetWeight: exercise.targetWeight }),
        ...(exercise.isAmrap == null ? {} : { isAmrap: exercise.isAmrap }),
      })),
    )
  })

  return sessionId
}
