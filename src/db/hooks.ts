import { useLiveQuery } from 'dexie-react-hooks'

import type { Exercise, Settings } from '~/domain/types'

import { listExercises, type ExerciseFilter } from './repositories/exercises'
import { getSettings } from './repositories/settings'
import { DEFAULT_SETTINGS } from './seed'

/**
 * Reactive reads straight off IndexedDB.
 *
 * `useLiveQuery` re-runs whenever the underlying tables change, which is why
 * Gymmy has no cache layer and no store mirroring the database: the database
 * IS the state. Writes go through repositories and the UI updates itself.
 */

export function useSettings(): Settings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS) ?? DEFAULT_SETTINGS
}

export function useExercises(filter: ExerciseFilter = {}): Exercise[] | undefined {
  const { search, muscleGroup, includeArchived } = filter
  return useLiveQuery(
    () => listExercises({ search, muscleGroup, includeArchived }),
    [search, muscleGroup, includeArchived],
  )
}
