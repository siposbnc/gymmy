import { useLiveQuery } from 'dexie-react-hooks'

import {
  computeStreak,
  exerciseSeries,
  weeklyVolume,
  type ExercisePoint,
  type HistorySet,
  type Streak,
  type WeeklyVolume,
} from '~/domain/history'
import type {
  Exercise,
  PersonalRecord,
  Routine,
  RoutineExercise,
  Session,
  SessionExercise,
  SetEntry,
  Settings,
} from '~/domain/types'

import { listExercises, type ExerciseFilter } from './repositories/exercises'
import {
  getSessionDetail,
  listCompletedSessions,
  listHeadlineRecords,
  listRecordsForExercise,
  listRecordsFromSession,
} from './repositories/history'
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

// ---------------------------------------------------------------------------
// History & progress
// ---------------------------------------------------------------------------

/** Every working set ever logged, shaped for the domain aggregations. */
async function allHistorySets(): Promise<HistorySet[]> {
  const [links, sets] = await Promise.all([db.sessionExercises.toArray(), db.sets.toArray()])
  const exerciseByLink = new Map(links.map((link) => [link.id, link]))

  return sets.flatMap((set) => {
    const link = exerciseByLink.get(set.sessionExerciseId)
    if (!link) return []
    return [
      {
        sessionId: link.sessionId,
        exerciseId: link.exerciseId,
        completedAt: set.completedAt,
        type: set.type,
        weightKg: set.weightKg,
        reps: set.reps,
      },
    ]
  })
}

export interface ProgressOverview {
  streak: Streak
  weeks: WeeklyVolume[]
  /** The most recent week's split by primary muscle. */
  thisWeekByMuscle: { key: string; label: string; value: number }[]
  records: PersonalRecord[]
  exerciseNames: Map<string, string>
  sessionCount: number
}

export function useProgressOverview(): ProgressOverview | undefined {
  const settings = useSettings()
  const { weekStartsOn, weeklySessionGoal } = settings

  return useLiveQuery(async () => {
    const [sessions, exercises, records, sets] = await Promise.all([
      db.sessions.toArray(),
      db.exercises.toArray(),
      listHeadlineRecords(),
      allHistorySets(),
    ])

    const completed = sessions.filter((session) => session.status === 'completed')
    const primaryMuscle = new Map(
      exercises.flatMap((exercise) =>
        exercise.muscleGroups[0] ? [[exercise.id, exercise.muscleGroups[0]] as const] : [],
      ),
    )

    const weeks = weeklyVolume(sets, primaryMuscle, weekStartsOn)
    const latest = weeks.at(-1)

    return {
      streak: computeStreak(completed, weeklySessionGoal, weekStartsOn),
      weeks,
      thisWeekByMuscle: Object.entries(latest?.byMuscle ?? {}).map(([muscle, value]) => ({
        key: muscle,
        label: muscle,
        value: value ?? 0,
      })),
      records,
      exerciseNames: new Map(exercises.map((exercise) => [exercise.id, exercise.name])),
      sessionCount: completed.length,
    }
  }, [weekStartsOn, weeklySessionGoal])
}

export interface ExerciseProgress {
  exercise: Exercise | undefined
  points: ExercisePoint[]
  records: PersonalRecord[]
}

export function useExerciseProgress(exerciseId: string | undefined): ExerciseProgress | undefined {
  return useLiveQuery(async () => {
    if (!exerciseId) return undefined
    const [exercise, sessions, sets, records] = await Promise.all([
      db.exercises.get(exerciseId),
      db.sessions.toArray(),
      allHistorySets(),
      listRecordsForExercise(exerciseId),
    ])

    const completed = sessions.filter((session) => session.status === 'completed')
    return {
      exercise,
      points: exerciseSeries(exerciseId, sets, completed),
      records,
    }
  }, [exerciseId])
}

export function useCompletedSessions(limit?: number): Session[] | undefined {
  return useLiveQuery(() => listCompletedSessions(limit), [limit])
}

export function useSessionDetail(sessionId: string | undefined) {
  return useLiveQuery(async () => {
    if (!sessionId) return null
    const [detail, records] = await Promise.all([
      getSessionDetail(sessionId),
      listRecordsFromSession(sessionId),
    ])
    return detail == null ? null : { ...detail, records }
  }, [sessionId])
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
