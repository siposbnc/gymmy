import { useLiveQuery } from 'dexie-react-hooks'

import type {
  Exercise,
  Routine,
  RoutineExercise,
  Session,
  SessionExercise,
  SetEntry,
  Settings,
} from '~/domain/types'

import { listExercises, type ExerciseFilter } from './repositories/exercises'
import { listRoutineExercises, listRoutines } from './repositories/routines'
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

/** A routine plus the number of exercises in it, for the list screen. */
export interface RoutineSummary {
  routine: Routine
  exerciseCount: number
  /** First few exercise names, so a card is identifiable at a glance. */
  preview: string[]
}

export function useRoutines(includeArchived = false): RoutineSummary[] | undefined {
  return useLiveQuery(async () => {
    const routines = await listRoutines(includeArchived)
    return Promise.all(
      routines.map(async (routine) => {
        const planned = await listRoutineExercises(routine.id)
        const names = await Promise.all(
          planned.slice(0, 4).map(async (entry) => {
            const exercise = await db.exercises.get(entry.exerciseId)
            return exercise?.name ?? 'Unknown'
          }),
        )
        return { routine, exerciseCount: planned.length, preview: names }
      }),
    )
  }, [includeArchived])
}

/** One routine with its exercises resolved, for the editor. */
export interface RoutineDetail {
  routine: Routine
  entries: { entry: RoutineExercise; exercise: Exercise | undefined }[]
}

export function useRoutine(routineId: string | undefined): RoutineDetail | null | undefined {
  return useLiveQuery(async () => {
    if (!routineId) return null
    const routine = await db.routines.get(routineId)
    if (!routine) return null

    const planned = await listRoutineExercises(routineId)
    const entries = await Promise.all(
      planned.map(async (entry) => ({
        entry,
        exercise: await db.exercises.get(entry.exerciseId),
      })),
    )
    return { routine, entries }
  }, [routineId])
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
