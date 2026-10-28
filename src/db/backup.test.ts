import { beforeEach, describe, expect, it } from 'vitest'

import { buildBackup, EXPORT_FORMAT, importFromJson, backupFilename } from './backup'
import { db, SCHEMA_VERSION } from './schema'
import { bootstrapDatabase } from './seed'
import { completeSession } from './repositories/history'
import { addExerciseToSession, logSet, startEmptySession } from './repositories/sessions'

/**
 * Export/import is the only device-migration path for an app with no account,
 * so "covers every table and round-trips exactly" is a correctness requirement,
 * not a nice-to-have.
 */
describe('backup', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrapDatabase()
  })

  async function seedAWorkout() {
    const sessionId = await startEmptySession('Push A')
    const sessionExerciseId = await addExerciseToSession(sessionId, 'ex_bench-press')
    await logSet(sessionExerciseId, { weightKg: 20, reps: 12, type: 'warmup' })
    await logSet(sessionExerciseId, { weightKg: 80, reps: 8 })
    await logSet(sessionExerciseId, { weightKg: 80, reps: 8, rpe: 8 })
    // completeSession, not finishSession: this is what the app does, and it
    // settles records — so the backup under test contains them.
    await completeSession(sessionId)
    return sessionId
  }

  it('covers every table', async () => {
    const backup = await buildBackup()
    expect(Object.keys(backup.data).sort()).toEqual(
      [
        'exercises',
        'records',
        'routineExercises',
        'routines',
        'sessionExercises',
        'sessions',
        'sets',
        'settings',
      ].sort(),
    )
    expect(backup.format).toBe(EXPORT_FORMAT)
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('round-trips a real workout exactly', async () => {
    await seedAWorkout()
    const before = await buildBackup()
    const json = JSON.stringify(before)

    // Simulate a new device.
    await db.delete()
    await db.open()

    await importFromJson(json, 'replace')

    const after = await buildBackup()
    expect(after.data).toEqual(before.data)
  })

  it('replace mode leaves no trace of what was there before', async () => {
    await seedAWorkout()
    const json = JSON.stringify(await buildBackup())

    // A different device with a different workout on it.
    await db.delete()
    await db.open()
    await bootstrapDatabase()
    const otherSession = await startEmptySession('Legs')
    await completeSession(otherSession)

    await importFromJson(json, 'replace')

    const sessions = await db.sessions.toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.name).toBe('Push A')
  })

  it('merge mode keeps local data and adds only unseen rows', async () => {
    await seedAWorkout()
    const json = JSON.stringify(await buildBackup())

    await db.delete()
    await db.open()
    await bootstrapDatabase()
    const localSession = await startEmptySession('Legs')
    await completeSession(localSession)

    await importFromJson(json, 'merge')

    const names = (await db.sessions.toArray()).map((s) => s.name).sort()
    expect(names).toEqual(['Legs', 'Push A'])
  })

  it('merge is idempotent — importing twice changes nothing', async () => {
    await seedAWorkout()
    const json = JSON.stringify(await buildBackup())

    await importFromJson(json, 'merge')
    const afterFirst = await buildBackup()
    await importFromJson(json, 'merge')
    const afterSecond = await buildBackup()

    expect(afterSecond.data).toEqual(afterFirst.data)
  })

  it('rejects a file that is not a Gymmy backup', async () => {
    await expect(importFromJson('{"hello":"world"}', 'merge')).rejects.toThrow()
    await expect(importFromJson('not json at all', 'merge')).rejects.toThrow()
  })

  it('refuses a backup from a newer schema rather than corrupting data', async () => {
    const backup = await buildBackup()
    const fromTheFuture = JSON.stringify({ ...backup, schemaVersion: SCHEMA_VERSION + 5 })

    await expect(importFromJson(fromTheFuture, 'replace')).rejects.toThrow(/newer version/i)
  })

  it('names the file by date so backups sort', () => {
    expect(backupFilename(new Date('2026-10-26T12:00:00Z'))).toBe('gymmy-backup-2026-10-26.json')
  })

  it('rebuilds records after a restore, so the PR board is not empty', async () => {
    await seedAWorkout()
    const json = JSON.stringify(await buildBackup())

    // A backup written by a build that had no records table content at all.
    const stripped = JSON.parse(json) as { data: { records: unknown[] } }
    stripped.data.records = []

    await db.delete()
    await db.open()
    await importFromJson(JSON.stringify(stripped), 'replace')

    const records = await db.records.toArray()
    expect(records.length).toBeGreaterThan(0)
    expect(records.find((record) => record.kind === 'max_weight')?.value).toBe(80)
  })

  it('fills in settings fields the restored row predates', async () => {
    const json = JSON.stringify(await buildBackup())

    // An older export: written before `suggestProgression` existed, with the
    // user's own units kept so the merge can be seen to preserve them.
    const old = JSON.parse(json) as {
      schemaVersion: number
      data: { settings: Record<string, unknown>[] }
    }
    old.schemaVersion = 2
    old.data.settings = old.data.settings.map((row) => {
      const { suggestProgression: _dropped, ...rest } = row
      return { ...rest, units: 'lb' }
    })

    await db.delete()
    await db.open()
    await importFromJson(JSON.stringify(old), 'replace')

    // An import bypasses the Dexie upgrades, so without the gap-fill this field
    // would be absent forever and the feature would read as switched off.
    const settings = await db.settings.get('singleton')
    expect(settings?.suggestProgression).toBe(true)
    // The restored values still win over the defaults.
    expect(settings?.units).toBe('lb')
  })
})
