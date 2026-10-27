import type { Settings } from '~/domain/types'

import { db, SCHEMA_VERSION } from '../schema'
import { SEED_EXERCISES } from './exercises'
import { DEFAULT_BAR_WEIGHT_KG, DEFAULT_PLATE_INVENTORY } from './plates'

export const DEFAULT_SETTINGS: Settings = {
  id: 'singleton',
  units: 'kg',
  theme: 'system',
  weekStartsOn: 1,
  defaultRestSeconds: 120,
  barWeightKg: DEFAULT_BAR_WEIGHT_KG,
  plateInventory: DEFAULT_PLATE_INVENTORY,
  weeklySessionGoal: 3,
  showStreak: true,
  showRpe: false,
  autoStartRest: true,
  restSound: true,
  restVibrate: true,
  schemaVersion: SCHEMA_VERSION,
}

/**
 * Bring a fresh (or upgraded) database up to date.
 *
 * Idempotent and safe to run on every launch. Crucially it only ADDS exercises
 * that are missing — it never overwrites, because a user may have renamed a
 * built-in or changed its rest default, and an app update must not stomp that.
 */
export async function bootstrapDatabase(): Promise<void> {
  await db.transaction('rw', db.settings, db.exercises, async () => {
    const existingSettings = await db.settings.get('singleton')
    if (!existingSettings) {
      await db.settings.add(DEFAULT_SETTINGS)
    } else if (existingSettings.schemaVersion !== SCHEMA_VERSION) {
      await db.settings.update('singleton', { schemaVersion: SCHEMA_VERSION })
    }

    const existingIds = new Set(await db.exercises.toCollection().primaryKeys())
    const missing = SEED_EXERCISES.filter((exercise) => !existingIds.has(exercise.id))
    if (missing.length > 0) {
      await db.exercises.bulkAdd(missing)
    }
  })
}

export { SEED_EXERCISES, DEFAULT_PLATE_INVENTORY, DEFAULT_BAR_WEIGHT_KG }
