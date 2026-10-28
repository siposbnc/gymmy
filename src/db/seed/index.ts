import type { Settings } from '~/domain/types'

import { recomputeRecordsFor } from '../repositories/history'
import { db, SCHEMA_VERSION } from '../schema'
import { SEED_EXERCISES } from './exercises'
import {
  DEFAULT_BAR_ID,
  DEFAULT_BAR_WEIGHT_KG,
  DEFAULT_BARS,
  DEFAULT_PLATE_INVENTORY,
  standardBarName,
} from './plates'

export const DEFAULT_SETTINGS: Settings = {
  id: 'singleton',
  units: 'kg',
  theme: 'system',
  weekStartsOn: 1,
  defaultRestSeconds: 120,
  barWeightKg: DEFAULT_BAR_WEIGHT_KG,
  bars: DEFAULT_BARS,
  defaultBarId: DEFAULT_BAR_ID,
  plateInventory: DEFAULT_PLATE_INVENTORY,
  weeklySessionGoal: 3,
  showStreak: true,
  showRpe: false,
  autoStartRest: true,
  restSound: true,
  restVibrate: true,
  suggestProgression: true,
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
  await seedStaticData()
  await backfillBuiltInMetadata()
  await nameTheMigratedBar()
  await rebuildRecordsIfMissing()
}

/**
 * Give the bar created by the v3 migration its proper name.
 *
 * That migration labelled it "Your bar" regardless of weight, which is
 * uninformative when the weight makes the answer obvious — a 20 kg bar is an
 * Olympic bar. The migration itself now names it correctly, but devices that
 * already upgraded need this.
 *
 * Deliberately narrow: it only touches the exact id and exact placeholder
 * name the migration wrote, and only when the weight is one it recognises. A
 * bar you have renamed yourself is never touched.
 */
export async function nameTheMigratedBar(): Promise<void> {
  const settings = await db.settings.get('singleton')
  if (!settings?.bars?.length) return

  const needsName = settings.bars.some(
    (bar) =>
      bar.id === 'bar_default' &&
      bar.name === 'Your bar' &&
      standardBarName(bar.weightKg) !== 'Your bar',
  )
  if (!needsName) return

  await db.settings.update('singleton', {
    bars: settings.bars.map((bar) =>
      bar.id === 'bar_default' && bar.name === 'Your bar'
        ? { ...bar, name: standardBarName(bar.weightKg) }
        : bar,
    ),
  })
}

/**
 * Fill in metadata that built-in exercises gained after they were seeded.
 *
 * Seeding only ADDS missing exercises, which is what stops an app update
 * stomping a renamed built-in — but it also means a field added later never
 * reaches anyone who installed before it existed. Descriptions were added
 * after v1 shipped, so without this they would only ever appear on fresh
 * installs.
 *
 * Strictly additive: it writes a description only where there is none, and
 * never touches a custom exercise or anything the user has edited.
 */
export async function backfillBuiltInMetadata(): Promise<void> {
  const stored = await db.exercises.toArray()
  const seedById = new Map(SEED_EXERCISES.map((exercise) => [exercise.id, exercise]))

  const missing = stored.filter(
    (exercise) =>
      !exercise.isCustom && exercise.description == null && seedById.has(exercise.id),
  )
  if (missing.length === 0) return

  await db.transaction('rw', db.exercises, async () => {
    await Promise.all(
      missing.map((exercise) => {
        const description = seedById.get(exercise.id)?.description
        return description == null
          ? Promise.resolve(0)
          : db.exercises.update(exercise.id, { description })
      }),
    )
  })
}

/**
 * Records are derived, so they can legitimately be absent when the sessions
 * that produce them are not.
 *
 * The case that matters is import: restoring a backup writes sessions and sets
 * straight into the tables without going through `completeSession`, so without
 * this the PR board would stay empty on a freshly restored device until the
 * user happened to edit something. Same story for a backup taken by a build
 * that predates records entirely.
 *
 * Deliberately conditional: recomputing every exercise on every launch would
 * be wasted work once records exist.
 */
export async function rebuildRecordsIfMissing(): Promise<void> {
  const [recordCount, completed] = await Promise.all([
    db.records.count(),
    db.sessions.where('status').equals('completed').count(),
  ])
  if (recordCount > 0 || completed === 0) return

  const links = await db.sessionExercises.toArray()
  await recomputeRecordsFor([...new Set(links.map((link) => link.exerciseId))])
}

async function seedStaticData(): Promise<void> {
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

export {
  SEED_EXERCISES,
  DEFAULT_PLATE_INVENTORY,
  DEFAULT_BAR_WEIGHT_KG,
  DEFAULT_BARS,
  DEFAULT_BAR_ID,
}
