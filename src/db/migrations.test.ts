import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'

import { GymmyDB, SCHEMA_VERSION } from './schema'

/**
 * Migrations are the thing you cannot retrofit.
 *
 * Gymmy holds training history that exists nowhere else, so every schema bump
 * needs a test that opens a database written by the *previous* version and
 * proves the upgrade leaves it whole. This is the pattern for every future one.
 */
describe('schema migrations', () => {
  async function createV1Database(name: string) {
    const legacy = new Dexie(name)
    legacy.version(1).stores({
      exercises:
        'id, name, equipment, movementType, trackingType, isCustom, archivedAt, *muscleGroups',
      routines: 'id, name, updatedAt, archivedAt',
      routineExercises: 'id, routineId, exerciseId, [routineId+order]',
      sessions: 'id, status, startedAt, routineId',
      sessionExercises: 'id, sessionId, exerciseId, [sessionId+order]',
      sets: 'id, sessionExerciseId, [sessionExerciseId+setIndex], completedAt',
      records: 'id, exerciseId, [exerciseId+kind], achievedAt, sessionId',
      settings: 'id',
    })
    await legacy.open()
    return legacy
  }

  it('v1 → v2 backfills the rest settings without touching anything else', async () => {
    const name = `gymmy-migration-${Math.random().toString(36).slice(2)}`

    const legacy = await createV1Database(name)
    // A v1 settings row: no autoStartRest, restSound or restVibrate.
    await legacy.table('settings').add({
      id: 'singleton',
      units: 'lb',
      theme: 'dark',
      weekStartsOn: 0,
      defaultRestSeconds: 90,
      barWeightKg: 20,
      plateInventory: [{ weightKg: 25, pairs: 2 }],
      weeklySessionGoal: 5,
      showStreak: false,
      showRpe: true,
      schemaVersion: 1,
    })
    await legacy.table('sessions').add({
      id: 'ses_old',
      name: 'An old workout',
      startedAt: 1_700_000_000_000,
      status: 'completed',
      endedAt: 1_700_003_600_000,
    })
    legacy.close()

    // Reopening with the current schema runs the upgrade.
    const upgraded = new GymmyDB(name)
    await upgraded.open()

    const settings = await upgraded.settings.get('singleton')
    expect(settings).toBeDefined()

    // New fields arrive with sane defaults...
    expect(settings?.autoStartRest).toBe(true)
    expect(settings?.restSound).toBe(true)
    expect(settings?.restVibrate).toBe(true)
    expect(settings?.schemaVersion).toBe(2)

    // ...and the user's existing choices are untouched.
    expect(settings?.units).toBe('lb')
    expect(settings?.theme).toBe('dark')
    expect(settings?.defaultRestSeconds).toBe(90)
    expect(settings?.weeklySessionGoal).toBe(5)
    expect(settings?.showRpe).toBe(true)
    expect(settings?.showStreak).toBe(false)
    expect(settings?.plateInventory).toEqual([{ weightKg: 25, pairs: 2 }])

    // And their training history survived, which is the whole point.
    const session = await upgraded.sessions.get('ses_old')
    expect(session?.name).toBe('An old workout')

    upgraded.close()
  })

  it('opens a fresh database straight at the current version', async () => {
    const db = new GymmyDB(`gymmy-fresh-${Math.random().toString(36).slice(2)}`)
    await db.open()
    expect(db.verno).toBe(SCHEMA_VERSION)
    db.close()
  })
})
