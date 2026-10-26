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
