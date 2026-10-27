import { useLiveQuery } from 'dexie-react-hooks'

import type { Exercise, Session, SessionExercise, SetEntry, Settings } from '~/domain/types'

import { listExercises, type ExerciseFilter } from './repositories/exercises'
import { db } from './schema'
import { getSettings } from './repositories/settings'
import {
  getActiveSession,
  getPreviousSets,
  listSessionExercises,
  listSets,
} from './repositories/sessions'
import { DEFAULT_SETTINGS } from './seed'

/**
 * Reactive reads straight off IndexedDB.
 *
 * `useLiveQuery` re-runs whenever a table it touched changes, which is why
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

/** Everything one exercise needs to render a set list and prefill the next row. */
export interface SessionExerciseView {
  sessionExercise: SessionExercise
  exercise: Exercise | undefined
  sets: SetEntry[]
  /** Working + warm-up sets from the last time this exercise was trained. */
  previousSets: SetEntry[]
}

export interface ActiveSessionView {
  session: Session
  views: SessionExerciseView[]
}

/**
 * The whole active session in one query.
 *
 * One `useLiveQuery` rather than a hook per exercise: Dexie tracks every table
 * touched here, so a single set write refreshes exactly what is on screen, and
 * the component tree never has to coordinate a dozen independent subscriptions.
 */
export function useActiveSession(): ActiveSessionView | null | undefined {
  return useLiveQuery(async () => {
    const session = await getActiveSession()
    if (!session) return null

    const sessionExercises = await listSessionExercises(session.id)

    const views = await Promise.all(
      sessionExercises.map(async (sessionExercise): Promise<SessionExerciseView> => {
        const [exercise, sets, previousSets] = await Promise.all([
          db.exercises.get(sessionExercise.exerciseId),
          listSets(sessionExercise.id),
          getPreviousSets(sessionExercise.exerciseId, session.id),
        ])
        return { sessionExercise, exercise, sets, previousSets }
      }),
    )

    return { session, views }
  }, [])
}
