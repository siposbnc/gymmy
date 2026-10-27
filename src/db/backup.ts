import type { EntityTable } from 'dexie'
import { z } from 'zod'

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

import { db, SCHEMA_VERSION } from './schema'

/**
 * Export and import.
 *
 * With no account and no server, this file IS the backup story — and the only
 * device-migration path, since Gymmy is single-user-per-device by design. So
 * it must cover every table, not a convenient subset, and it must round-trip
 * exactly. There is a test asserting precisely that.
 *
 * The envelope carries a schema version so a future import can tell what it is
 * looking at rather than guess.
 */

export const EXPORT_FORMAT = 'gymmy.backup'

export interface BackupData {
  exercises: Exercise[]
  routines: Routine[]
  routineExercises: RoutineExercise[]
  sessions: Session[]
  sessionExercises: SessionExercise[]
  sets: SetEntry[]
  records: PersonalRecord[]
  settings: Settings[]
}

export interface Backup {
  format: typeof EXPORT_FORMAT
  schemaVersion: number
  exportedAt: number
  data: BackupData
}

/**
 * Validation is deliberately shallow on the rows and strict on the envelope.
 *
 * The envelope is what tells us whether this is a Gymmy backup at all and
 * whether we are old enough to read it. The rows stay loose because a file
 * written by an older version may legitimately lack fields this version adds —
 * rejecting those would make backups expire, which defeats the point.
 */
const row = z.object({ id: z.string() }).passthrough()

const envelopeSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.number().int().positive(),
  data: z.object({
    exercises: z.array(row),
    routines: z.array(row),
    routineExercises: z.array(row),
    sessions: z.array(row),
    sessionExercises: z.array(row),
    sets: z.array(row),
    records: z.array(row),
    settings: z.array(row),
  }),
})

export async function buildBackup(): Promise<Backup> {
  const [
    exercises,
    routines,
    routineExercises,
    sessions,
    sessionExercises,
    sets,
    records,
    settings,
  ] = await Promise.all([
    db.exercises.toArray(),
    db.routines.toArray(),
    db.routineExercises.toArray(),
    db.sessions.toArray(),
    db.sessionExercises.toArray(),
    db.sets.toArray(),
    db.records.toArray(),
    db.settings.toArray(),
  ])

  return {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    data: {
      exercises,
      routines,
      routineExercises,
      sessions,
      sessionExercises,
      sets,
      records,
      settings,
    },
  }
}

export async function exportToJson(): Promise<string> {
  return JSON.stringify(await buildBackup(), null, 2)
}

export function backupFilename(now = new Date()): string {
  return `gymmy-backup-${now.toISOString().slice(0, 10)}.json`
}

export type ImportMode = 'replace' | 'merge'

export interface ImportResult {
  readonly mode: ImportMode
  readonly counts: Record<string, number>
}

/**
 * Restore one table.
 *
 * The cast is the one place loose JSON becomes typed data. It is safe because
 * the schema-version gate above rejects anything this build does not
 * understand, and because Dexie stores whole objects — an unexpected extra
 * field round-trips harmlessly rather than corrupting an index.
 */
async function restoreTable<T extends { id: string }>(
  table: EntityTable<T, 'id'>,
  rows: readonly { id: string }[],
  mode: ImportMode,
): Promise<number> {
  const typed = rows as readonly T[]

  if (mode === 'replace') {
    await table.clear()
    await table.bulkPut(typed)
    return typed.length
  }

  // Primary keys are typed generically by Dexie; every Gymmy table keys on a
  // string id, so narrowing here keeps the lookup honest.
  const existing = new Set((await table.toCollection().primaryKeys()) as string[])
  const incoming = typed.filter((item) => !existing.has(item.id))
  await table.bulkAdd(incoming)
  return incoming.length
}

/**
 * Restore a backup.
 *
 * `replace` wipes first — the "new phone" case, where the device should end up
 * exactly as the old one was. `merge` keeps what is already here and adds only
 * unseen ids, which is the safer default when a user is unsure, and is
 * idempotent.
 */
export async function importFromJson(json: string, mode: ImportMode): Promise<ImportResult> {
  const parsed: unknown = JSON.parse(json)
  const backup = envelopeSchema.parse(parsed)

  if (backup.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `This backup was made by a newer version of Gymmy (schema ${backup.schemaVersion}, this app understands ${SCHEMA_VERSION}). Update the app before importing.`,
    )
  }

  const counts: Record<string, number> = {}
  const { data } = backup

  await db.transaction(
    'rw',
    [
      db.exercises,
      db.routines,
      db.routineExercises,
      db.sessions,
      db.sessionExercises,
      db.sets,
      db.records,
      db.settings,
    ],
    async () => {
      counts.exercises = await restoreTable(db.exercises, data.exercises, mode)
      counts.routines = await restoreTable(db.routines, data.routines, mode)
      counts.routineExercises = await restoreTable(
        db.routineExercises,
        data.routineExercises,
        mode,
      )
      counts.sessions = await restoreTable(db.sessions, data.sessions, mode)
      counts.sessionExercises = await restoreTable(
        db.sessionExercises,
        data.sessionExercises,
        mode,
      )
      counts.sets = await restoreTable(db.sets, data.sets, mode)
      counts.records = await restoreTable(db.records, data.records, mode)
      counts.settings = await restoreTable(db.settings, data.settings, mode)
    },
  )

  return { mode, counts }
}
