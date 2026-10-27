import Dexie, { type EntityTable } from 'dexie'

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

/**
 * Gymmy's local database.
 *
 * Versioned from the first commit, deliberately. Schema churn is guaranteed as
 * features land, and retrofitting migrations onto an app that already has real
 * training history in it is not something you want to attempt. Every version
 * bump gets a `.version(n).stores(...)` block below and, where data must change
 * shape, an `.upgrade()`.
 *
 * SCHEMA_VERSION is also written into exports so an import can tell what it is
 * looking at.
 */
export const SCHEMA_VERSION = 2

/** Indexes only. Dexie stores the whole object regardless of what is listed. */
export class GymmyDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  routines!: EntityTable<Routine, 'id'>
  routineExercises!: EntityTable<RoutineExercise, 'id'>
  sessions!: EntityTable<Session, 'id'>
  sessionExercises!: EntityTable<SessionExercise, 'id'>
  sets!: EntityTable<SetEntry, 'id'>
  records!: EntityTable<PersonalRecord, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name = 'gymmy') {
    super(name)

    this.version(1).stores({
      exercises: 'id, name, equipment, movementType, trackingType, isCustom, archivedAt, *muscleGroups',
      routines: 'id, name, updatedAt, archivedAt',
      routineExercises: 'id, routineId, exerciseId, [routineId+order]',
      // `status` is the active-session recovery flag, so it must be indexed.
      sessions: 'id, status, startedAt, routineId',
      sessionExercises: 'id, sessionId, exerciseId, [sessionId+order]',
      // [sessionExerciseId+setIndex] drives ordered reads of a single exercise.
      sets: 'id, sessionExerciseId, [sessionExerciseId+setIndex], completedAt',
      records: 'id, exerciseId, [exerciseId+kind], achievedAt, sessionId',
      settings: 'id',
    })

    // v2 — rest timer preferences (M2).
    //
    // No index changes, so the store definitions are unchanged; the upgrade
    // exists purely to backfill the new Settings fields. Doing this through a
    // real migration rather than defaulting on read means the stored row is
    // always complete, so an export taken after an upgrade is too.
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table<Settings, string>('settings')
          .toCollection()
          .modify((settings) => {
            settings.autoStartRest ??= true
            settings.restSound ??= true
            settings.restVibrate ??= true
            settings.schemaVersion = 2
          })
      })
  }
}

export const db = new GymmyDB()
