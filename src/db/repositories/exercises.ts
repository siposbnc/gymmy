import type { ExerciseAppearance } from '~/domain/exercise-usage'
import type { Exercise, MuscleGroup } from '~/domain/types'
import { newId } from '~/lib/uuid'

import { db } from '../schema'

/**
 * `| undefined` is explicit on every optional field because
 * `exactOptionalPropertyTypes` is on: without it, callers cannot pass a value
 * that happens to be undefined, only omit the key entirely. For a filter built
 * from component state, that distinction is noise.
 */
export interface ExerciseFilter {
  readonly search?: string | undefined
  readonly muscleGroup?: MuscleGroup | undefined
  readonly includeArchived?: boolean | undefined
}

export async function listExercises(filter: ExerciseFilter = {}): Promise<Exercise[]> {
  const { search, muscleGroup, includeArchived = false } = filter

  let results = await db.exercises.orderBy('name').toArray()

  if (!includeArchived) {
    results = results.filter((exercise) => exercise.archivedAt == null)
  }
  if (muscleGroup) {
    results = results.filter((exercise) => exercise.muscleGroups.includes(muscleGroup))
  }
  if (search?.trim()) {
    const needle = search.trim().toLowerCase()
    results = results.filter((exercise) => exercise.name.toLowerCase().includes(needle))
  }

  return results
}

/**
 * Every time an exercise was actually trained, for ranking the picker.
 *
 * Two deliberate exclusions. Unfinished sessions do not count: an abandoned
 * workout is not evidence of what you train, and the session you are in right
 * now would otherwise re-rank the list underneath you while you are using it.
 * Neither does an exercise that was added to a session and never logged
 * against — the count beside each row says "12 sessions", and that has to mean
 * twelve times you did it.
 *
 * The distinct-set lookup rides the `sessionExerciseId` index, so finding out
 * which entries were performed costs a key scan rather than loading every set
 * you have ever logged.
 */
export async function listExerciseAppearances(): Promise<ExerciseAppearance[]> {
  const [links, sessions, performed] = await Promise.all([
    db.sessionExercises.toArray(),
    db.sessions.where('status').equals('completed').toArray(),
    db.sets.orderBy('sessionExerciseId').uniqueKeys(),
  ])

  const trainedAt = new Map(sessions.map((session) => [session.id, session.endedAt ?? session.startedAt]))
  const hasSets = new Set(performed as string[])

  return links.flatMap((link) => {
    const at = trainedAt.get(link.sessionId)
    if (at == null || !hasSets.has(link.id)) return []
    return [{ exerciseId: link.exerciseId, at }]
  })
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  return db.exercises.get(id)
}

export async function createCustomExercise(
  input: Omit<Exercise, 'id' | 'isCustom'>,
): Promise<string> {
  const id = newId('ex')
  await db.exercises.add({ ...input, id, isCustom: true })
  return id
}

/**
 * Edit an exercise.
 *
 * Built-ins are editable too — renaming "Pendlay Row" to match what your gym
 * calls it, or fixing a rest default, is legitimate. Seeding never overwrites
 * an existing row, so those edits survive app updates.
 */
export async function updateExercise(
  id: string,
  patch: Partial<Omit<Exercise, 'id' | 'isCustom'>>,
): Promise<void> {
  await db.exercises.update(id, patch)
}

/**
 * Pin an exercise to the top of the picker, or release it.
 *
 * `pinnedAt` is deliberately not indexed: the picker already holds every
 * exercise in memory to sort and section it, so an index would buy nothing and
 * cost a schema version. Absent means unpinned, which is also what every
 * backup taken before this existed will say.
 */
export async function pinExercise(id: string): Promise<void> {
  await db.exercises.update(id, { pinnedAt: Date.now() })
}

export async function unpinExercise(id: string): Promise<void> {
  // `modify` with a delete removes the key outright; `update` to undefined
  // would leave it present and reading back as an own-property, exactly as
  // with `archivedAt` below.
  await db.exercises
    .where('id')
    .equals(id)
    .modify((exercise) => {
      delete exercise.pinnedAt
    })
}

/** Detach an exercise from a specific bar, so it follows the default again. */
export async function clearExerciseBar(id: string): Promise<void> {
  await db.exercises
    .where('id')
    .equals(id)
    .modify((exercise) => {
      delete exercise.barId
    })
}

/**
 * Whether an exercise can be deleted outright.
 *
 * Only if nothing references it. Anything with history gets archived instead,
 * so past sessions keep making sense.
 */
export async function canDeleteExercise(id: string): Promise<boolean> {
  const [inSessions, inRoutines] = await Promise.all([
    db.sessionExercises.where('exerciseId').equals(id).count(),
    db.routineExercises.where('exerciseId').equals(id).count(),
  ])
  return inSessions === 0 && inRoutines === 0
}

export async function deleteExercise(id: string): Promise<boolean> {
  if (!(await canDeleteExercise(id))) return false
  await db.exercises.delete(id)
  return true
}

/**
 * Archived rather than deleted: an exercise may be referenced by years of
 * sessions, and deleting it would orphan that history.
 */
export async function archiveExercise(id: string): Promise<void> {
  await db.exercises.update(id, { archivedAt: Date.now() })
}

export async function unarchiveExercise(id: string): Promise<void> {
  // `modify` with a delete actually removes the property. Setting it to
  // undefined via `update` would leave the key present, which then reads back
  // as an own-property and confuses `archivedAt == null` checks elsewhere.
  await db.exercises
    .where('id')
    .equals(id)
    .modify((exercise) => {
      delete exercise.archivedAt
    })
}
