import { beforeEach, describe, expect, it } from 'vitest'

import { GymmyDB, SCHEMA_VERSION } from '../schema'
import { SEED_EXERCISES } from './exercises'

/**
 * Seeding has to be idempotent and non-destructive. It runs on every launch,
 * and an app update that added exercises must not stomp a user's edits to the
 * built-in ones.
 */
describe('bootstrapDatabase', () => {
  let db: GymmyDB

  beforeEach(async () => {
    db = new GymmyDB(`gymmy-test-${Math.random().toString(36).slice(2)}`)
    await db.open()
  })

  // The real bootstrap closes over the singleton `db`, so this mirrors its
  // logic against an isolated instance. Keep the two in step.
  async function bootstrap(target: GymmyDB) {
    await target.transaction('rw', target.settings, target.exercises, async () => {
      const existing = await target.settings.get('singleton')
      if (!existing) {
        await target.settings.add({
          id: 'singleton',
          units: 'kg',
          theme: 'system',
          weekStartsOn: 1,
          defaultRestSeconds: 120,
          barWeightKg: 20,
          bars: [{ id: 'bar_olympic', name: 'Olympic bar', weightKg: 20 }],
          defaultBarId: 'bar_olympic',
          plateInventory: [],
          weeklySessionGoal: 3,
          showStreak: true,
          showRpe: false,
          autoStartRest: true,
          restSound: true,
          restVibrate: true,
          suggestProgression: true,
          schemaVersion: SCHEMA_VERSION,
        })
      }
      const ids = new Set(await target.exercises.toCollection().primaryKeys())
      const missing = SEED_EXERCISES.filter((exercise) => !ids.has(exercise.id))
      if (missing.length > 0) await target.exercises.bulkAdd(missing)
    })
  }

  it('seeds the library on first run', async () => {
    await bootstrap(db)
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length)
    expect(await db.settings.get('singleton')).toBeDefined()
  })

  it('is idempotent across repeated launches', async () => {
    await bootstrap(db)
    await bootstrap(db)
    await bootstrap(db)
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length)
  })

  it('never overwrites a user edit to a built-in exercise', async () => {
    await bootstrap(db)
    await db.exercises.update('ex_bench-press', { defaultRestSeconds: 999, name: 'My Bench' })

    await bootstrap(db)

    const edited = await db.exercises.get('ex_bench-press')
    expect(edited?.defaultRestSeconds).toBe(999)
    expect(edited?.name).toBe('My Bench')
  })

  it('adds only newly shipped exercises', async () => {
    await bootstrap(db)
    await db.exercises.delete('ex_squat')
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length - 1)

    await bootstrap(db)
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length)
  })
})

describe('the seeded library', () => {
  it('has unique, stably prefixed ids', () => {
    const ids = SEED_EXERCISES.map((exercise) => exercise.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.startsWith('ex_'))).toBe(true)
  })

  it('gives every exercise a primary muscle and a sane rest default', () => {
    for (const exercise of SEED_EXERCISES) {
      expect(exercise.muscleGroups.length).toBeGreaterThan(0)
      expect(exercise.defaultRestSeconds).toBeGreaterThanOrEqual(30)
      expect(exercise.defaultRestSeconds).toBeLessThanOrEqual(300)
      expect(exercise.isCustom).toBe(false)
    }
  })

  it('rests compounds longer than isolations on average', () => {
    const mean = (type: 'compound' | 'isolation') => {
      const matching = SEED_EXERCISES.filter((e) => e.movementType === type)
      return matching.reduce((sum, e) => sum + e.defaultRestSeconds, 0) / matching.length
    }
    expect(mean('compound')).toBeGreaterThan(mean('isolation'))
  })
})
