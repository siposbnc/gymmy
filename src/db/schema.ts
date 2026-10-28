import Dexie, { type EntityTable } from 'dexie'

import { DEFAULT_BAR_WEIGHT_KG, DEFAULT_BARS, standardBarName } from './seed/plates'
import type {
  Bar,
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
export const SCHEMA_VERSION = 4

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

    // v3 — multiple bars.
    //
    // Pre-v3 there was a single `barWeightKg`. That value is the user's real
    // measured bar, so it becomes their default rather than being replaced by
    // a seeded 20 kg: silently changing the weight every plate calculation is
    // based on would be the worst possible outcome of an upgrade.
    //
    // The standard rack is added alongside it, minus anything that would
    // duplicate the weight they already had. `barWeightKg` is left in place so
    // a v2 export still imports cleanly.
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table<Settings, string>('settings')
          .toCollection()
          .modify((settings) => {
            if (settings.bars?.length) return

            const existingWeight = settings.barWeightKg ?? DEFAULT_BAR_WEIGHT_KG
            const theirBar: Bar = {
              id: 'bar_default',
              // Name it for what it almost certainly is. A 20 kg bar is a
              // men's Olympic bar and a 15 kg one is the women's; anything
              // else gets a neutral name because guessing would be worse.
              name: standardBarName(existingWeight),
              weightKg: existingWeight,
            }

            settings.bars = [
              theirBar,
              ...DEFAULT_BARS.filter((bar) => bar.weightKg !== existingWeight),
            ]
            settings.defaultBarId = theirBar.id
            settings.schemaVersion = 3
          })
      })

    // v4 — progression suggestions.
    //
    // On for existing installs as well as new ones: the suggestion is quiet,
    // appears only when a rep range has actually been cleared, and changes
    // nothing until it is tapped. Backfilled rather than defaulted on read so
    // the stored row stays complete — see the v2 note above.
    this.version(4)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table<Settings, string>('settings')
          .toCollection()
          .modify((settings) => {
            settings.suggestProgression ??= true
            settings.schemaVersion = 4
          })
      })
  }
}

export const db = new GymmyDB()
